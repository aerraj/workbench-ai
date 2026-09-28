import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate, executeTool, makeDocument, readUpload } from '../lib/workspace-tools';
import { buildRequest, normalizeResponse } from '../lib/provider';
import { POST } from '../app/api/chat/route';
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
 const open:any=buildRequest('openai','model',messages,'system',true);assert.equal(open.messages[1].content[1].image_url.url,messages[0].images[0]); assert.equal(open.messages[3].tool_call_id,'tool-1');assert.equal(open.tools.length,5);
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
 globalThis.fetch=async(input,init)=>{assert.ok(String(input).startsWith('https://'));const body=JSON.parse(String(init?.body));assert.equal(body.model,'test-model');return Response.json(provider==='anthropic'?{content:[{type:'text',text:'Hello'}]}:{choices:[{message:{content:'Hello'}}]});};
 const response=await POST(new Request('http://localhost/api/chat',{method:'POST',body:JSON.stringify({provider,model:'test-model',key:'test-key-only',work:true,files:[],messages:[{role:'user',content:'Hello'}]})}));
 assert.equal(response.status,200);assert.equal((await response.json() as any).content,'Hello');
 }} finally {globalThis.fetch=original;}
});
