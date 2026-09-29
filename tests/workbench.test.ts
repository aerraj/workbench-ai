import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, executeTool, makeDocument, readUpload } from '../lib/workspace-tools';
import { buildRequest, normalizeResponse } from '../lib/provider';
import { handleChat } from '../lib/chat-handler';
const POST=(request:Request)=>handleChat(request,async()=> 'test-key-only');
import mammoth from 'mammoth';
const call = (name:string, args:unknown) => ({ id:'tool-1', name, arguments:JSON.stringify(args) });
test('arithmetic parser honors precedence, parentheses and unary negatives; rejects code and zero division',()=>{
 assert.equal(calculate('(20 + 4) * 3 / -2'),-36);
 for (const input of ['1/0','globalThis.fetch("https://example.com")','2 3','1+','(2+3','2.3.4']) assert.throws(()=>calculate(input));
});
test('Word creation round-trips headings, paragraphs, bold and lists',async()=>{
 const blob=await makeDocument('# Quarterly report\nRevenue grew by **20%**.\n- Next action');
 const result=await mammoth.extractRawText({buffer:Buffer.from(await blob.arrayBuffer())});
 assert.match(result.value,/Quarterly report/); assert.match(result.value,/Revenue grew by 20%/);assert.match(result.value,/Next action/);
 const table=await makeDocument('| Name | Revenue |\n| --- | --- |\n| Acme | 42 |');const extracted=await mammoth.extractRawText({buffer:Buffer.from(await table.arrayBuffer())});assert.match(extracted.value,/Acme/);assert.match(extracted.value,/Revenue/);
 const generated=await executeTool(call('create_document',{filename:'report',content:'# Report\nDone.'}),[]);
 assert.equal(generated.asset?.name,'report.docx');assert.ok(generated.asset!.size>100);
});
test('CSV handles quoted commas and computes numeric summaries',async()=>{
 const file=await readUpload(new File(['name,revenue\n"Acme, Inc",10\nBeta,30\n'], 'data.csv',{type:'text/csv'}));
 const result=JSON.parse((await executeTool(call('analyze_csv',{id:file.id}),[file])).result);
 assert.equal(result.rows,2);assert.equal(result.sample[0].name,'Acme, Inc');assert.equal(result.numeric.revenue.sum,40);assert.equal(result.numeric.revenue.mean,20);
});
test('file tools reject missing files, malformed input and unknown tool names',async()=>{
 await assert.rejects(()=>executeTool(call('read_file',{id:'missing'}),[]));
 await assert.rejects(()=>executeTool(call('write_file',{filename:'x'}),[]));
 await assert.rejects(()=>executeTool(call('shell',{cmd:'whoami'}),[]));
 await assert.rejects(()=>readUpload(new File(['x'],'file.exe')));
});
test('OpenAI and Anthropic adapters preserve image and tool round-trips',()=>{
 const messages:any=[{role:'user',content:'Read image',images:['data:image/png;base64,YQ==']},{role:'assistant',content:'',toolCalls:[call('calculate',{expression:'1+2'})]},{role:'tool',content:'3',toolCallId:'tool-1'}];
 const open:any=buildRequest('openai','model',messages,'system',true);assert.equal(open.input[0].content[1].image_url,messages[0].images[0]); assert.equal(open.input[2].call_id,'tool-1');assert.equal(open.input[2].type,'function_call_output');assert.equal(open.tools.length,7);assert.equal(open.tools.find((t:any)=>t.name==='create_presentation').strict,false);assert.equal(open.tools.find((t:any)=>t.name==='generate_image').strict,false);
 const anthropic:any=buildRequest('anthropic','model',messages,'system',true);assert.equal(anthropic.messages[0].content[1].source.data,'YQ==');assert.equal(anthropic.messages[2].content[0].tool_use_id,'tool-1');
 assert.equal(normalizeResponse('anthropic',{content:[{type:'text',text:'Done'},{type:'tool_use',id:'t',name:'calculate',input:{expression:'1+2'}}]}).toolCalls?.[0].name,'calculate');
 assert.equal(normalizeResponse('gemini',{choices:[{message:{content:'Done'}}]}).content,'Done');
});
test('API rejects cross-origin, malformed and oversized messages without contacting a provider',async()=>{
 const badOrigin=await POST(new Request('http://localhost/api/chat',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}));assert.equal(badOrigin.status,403);
 const invalid=await POST(new Request('http://localhost/api/chat',{method:'POST',body:'{}'}));assert.equal(invalid.status,400);
 const huge=await POST(new Request('http://localhost/api/chat',{method:'POST',body:'x'.repeat(12_000_001)}));assert.equal(huge.status,413);
});
test('API forwards to each fixed provider endpoint and returns normalized output',async()=>{
 const original=globalThis.fetch;
 try { for (const provider of ['openai','anthropic','gemini','openrouter']) {
 globalThis.fetch=async(input,init)=>{assert.ok(String(input).startsWith('https://'));const body=JSON.parse(String(init?.body));assert.equal(body.model,'test-model');if(provider==='openai') { assert.equal(String(input),'https://api.openai.com/v1/responses'); assert.equal(body.store,false); assert.equal(body.tools[0].type,'function'); assert.equal(body.tools[0].function,undefined); return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Hello',annotations:[]}]}]}); } return Response.json(provider==='anthropic'?{content:[{type:'text',text:'Hello'}]}:{choices:[{message:{content:'Hello'}}]});};
 const response=await POST(new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({provider,model:'test-model',key:'test-key-only',work:true,files:[],messages:[{role:'user',content:'Hello'}]})}));
 assert.equal(response.status,200);assert.equal((await response.json() as any).content,'Hello');
 }} finally {globalThis.fetch=original;}
});

test('GPT-5.6 Sol Work mode preserves reasoning and tool linkage through the HTTP route', async () => {
 const original = globalThis.fetch;
 const model = 'gpt-5.6-sol';
 const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque-reasoning-state' };
 const functionCall = { type: 'function_call', id: 'fc_1', call_id: 'call_doc_1', name: 'create_document', arguments: JSON.stringify({ filename: 'summary.docx', content: '# Summary\nRevenue increased.' }), status: 'completed' };
 const messages: any[] = [{ role: 'user', content: 'Create a Word summary.' }];
 let requests = 0;
 const send = () => POST(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ provider: 'openai', model, key: 'test-key-only', work: true, files: [], messages }) }));
 try {
   globalThis.fetch = async (url, init) => {
     assert.equal(url, 'https://api.openai.com/v1/responses');
     const body = JSON.parse(String(init?.body));
     assert.equal(body.model, model);
     assert.equal(body.messages, undefined);
     assert.equal(body.reasoning_effort, undefined);
     assert.equal(body.store, false);
     assert.ok(body.include.includes('reasoning.encrypted_content'));
     assert.ok(body.tools.some((t: any) => t.name === 'create_document' && t.strict === true));
     if (requests++ === 0) return Response.json({ status: 'completed', output: [reasoning, functionCall] });
     // This verifies request validation didn't strip the stored reasoning state.
     assert.deepEqual(body.input[1], reasoning);
     assert.deepEqual(body.input[2], functionCall);
     assert.equal(body.input[3].type, 'function_call_output');
     assert.equal(body.input[3].call_id, 'call_doc_1');
     assert.match(body.input[3].output, /Created summary.docx/);
     assert.equal(body.input.filter((item: any) => item.type === 'function_call').length, 1);
     return Response.json({ status: 'completed', output: [{ type: 'message', id: 'msg_1', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Your Word document is ready.', annotations: [], logprobs: [] }] }] });
   };
   const first = await send(); assert.equal(first.status, 200);
   const assistant: any = await first.json();
   assert.equal(assistant.toolCalls[0].id, 'call_doc_1'); // not the fc_ item ID
   const tool = await executeTool(assistant.toolCalls[0], []);
   assert.equal(tool.asset?.name, 'summary.docx');
   const extracted = await mammoth.extractRawText({ buffer: Buffer.from(await tool.asset!.blob.arrayBuffer()) });
   assert.match(extracted.value, /Revenue increased/);
   messages.push(assistant, { role: 'tool', content: tool.result, toolCallId: assistant.toolCalls[0].id });
   const second = await send(); assert.equal(second.status, 200);
   const answer: any = await second.json();
   assert.equal(answer.content, 'Your Word document is ready.');
   assert.equal(answer.openaiOutput[0].phase, 'final_answer');
   assert.equal(answer.openaiOutput[0].content[0].logprobs, undefined);
   assert.equal(requests, 2);
 } finally { globalThis.fetch = original; }
});

test('Responses history supports parallel tools, legacy chats, Chat mode, and model switching', () => {
 const assistant = normalizeResponse('openai', { status: 'completed', output: [
   { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'opaque-state' },
   { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'calculate', arguments: '{"expression":"1+2"}' },
   { type: 'function_call', id: 'fc_2', call_id: 'call_2', name: 'calculate', arguments: '{"expression":"3+4"}' },
 ] }, 'gpt-5.6-sol');
 const messages: any[] = [{ role: 'user', content: 'Calculate' }, assistant, { role: 'tool', content: '3', toolCallId: 'call_1' }, { role: 'tool', content: '7', toolCallId: 'call_2' }];
 const same: any = buildRequest('openai', 'gpt-5.6-sol', messages, 'Be helpful', true);
 assert.deepEqual(same.input.map((i: any) => i.type), [undefined, 'reasoning', 'function_call', 'function_call', 'function_call_output', 'function_call_output']);
 const switched: any = buildRequest('openai', 'gpt-4.1', messages, 'Be helpful', false);
 assert.equal(switched.tools, undefined);
 assert.ok(!JSON.stringify(switched).includes('opaque-state'));
 assert.equal(switched.input.filter((i: any) => i.type === 'function_call').length, 2);
 const gemini: any = buildRequest('gemini', 'gemini-2.5-flash', messages, 'Be helpful', true);
 assert.equal(gemini.messages[2].tool_calls[0].id, 'call_1');
 assert.ok(!JSON.stringify(gemini).includes('opaque-state'));
 const legacy: any = buildRequest('openai', 'gpt-5.6-sol', [{ role: 'assistant', content: 'Earlier answer' }, { role: 'user', content: 'Follow up' }], 'Be helpful', false);
 assert.equal(legacy.input[0].content, 'Earlier answer');
 assert.equal(legacy.instructions, 'Be helpful');
});

test('Responses normalization surfaces refusals and rejects incomplete or empty output', () => {
 assert.equal(normalizeResponse('openai', { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'I cannot help with that.' }] }] }).content, 'I cannot help with that.');
 assert.throws(() => normalizeResponse('openai', { status: 'incomplete', output: [] }));
 assert.throws(() => normalizeResponse('openai', { status: 'failed', output: [] }));
 assert.throws(() => normalizeResponse('openai', { status: 'completed', output: [] }));
});
