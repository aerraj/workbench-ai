import type { Message, Provider, ToolCall } from './contracts';
import { normalizeResponse } from './provider';
export type StreamEvent={type:'text'|'thinking'|'tool-call'|'done'|'error';text?:string;message?:Message;error?:string;call?:ToolCall};
export async function* parseSSE(body:ReadableStream<Uint8Array>):AsyncGenerator<{event:string;data:any}>{
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});buffer=buffer.replaceAll('\r\n','\n');let boundary;while((boundary=buffer.indexOf('\n\n'))!==-1){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);let event='message';const lines:string[]=[];for(const line of frame.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))lines.push(line.slice(5).trimStart());}if(!lines.length)continue;const payload=lines.join('\n');if(payload==='[DONE]')return;try{yield {event,data:JSON.parse(payload)};}catch{}}}}
 finally{reader.releaseLock();}
}
export async function* normalizeStream(provider:Provider,model:string,body:ReadableStream<Uint8Array>):AsyncGenerator<StreamEvent>{
 let text='';let final:Message|null=null;const calls=new Map<number,ToolCall>();const blocks=new Map<number,{type:string;id?:string;name?:string;text:string;input:string}>();
 for await(const frame of parseSSE(body)){
  const d=frame.data;
  if(provider==='openai'){
   const type=d.type||frame.event;
   if(type==='response.output_text.delta'&&d.delta){text+=d.delta;yield {type:'text',text:d.delta};}
   else if(type==='response.reasoning_summary_text.delta'&&d.delta)yield {type:'thinking',text:d.delta};
   else if(type==='response.completed')final=normalizeResponse('openai',d.response,model);
   else if(type==='response.failed'||type==='error')throw new Error(d.response?.error?.message||d.error?.message||d.message||'The model request failed.');
  }else if(provider==='anthropic'){
   if(frame.event==='content_block_start'){blocks.set(d.index,{type:d.content_block.type,id:d.content_block.id,name:d.content_block.name,text:d.content_block.text||'',input:''});}
   else if(frame.event==='content_block_delta'){const block=blocks.get(d.index);if(!block)continue;if(d.delta.type==='text_delta'){block.text+=d.delta.text;text+=d.delta.text;yield {type:'text',text:d.delta.text};}else if(d.delta.type==='thinking_delta')yield {type:'thinking',text:d.delta.thinking};else if(d.delta.type==='input_json_delta')block.input+=d.delta.partial_json;}
   else if(frame.event==='error')throw new Error(d.error?.message||'The model request failed.');
  }else{
   if(d.error)throw new Error(d.error.message||'The model request failed.');const delta=d.choices?.[0]?.delta;if(!delta)continue;
   if(delta.content){text+=delta.content;yield {type:'text',text:delta.content};}
   for(const c of delta.tool_calls||[]){const current=calls.get(c.index)||{id:c.id||'',name:'',arguments:''};if(c.id)current.id=c.id;if(c.function?.name)current.name+=c.function.name;if(c.function?.arguments)current.arguments+=c.function.arguments;calls.set(c.index,current);}
  }
 }
 if(provider==='anthropic')final=normalizeResponse('anthropic',{content:[...blocks.values()].map(b=>b.type==='tool_use'?{type:'tool_use',id:b.id,name:b.name,input:JSON.parse(b.input||'{}')}:{type:'text',text:b.text})},model);
 else if(provider!=='openai')final={role:'assistant',content:text,toolCalls:[...calls.values()]};
 if(!final&&text)final={role:'assistant',content:text};
 if(!final)throw new Error('The model returned no answer.');
 for(const call of final.toolCalls||[])yield {type:'tool-call',call};
 yield {type:'done',message:final};
}
