import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { makePresentation } from '../lib/presentation';
import { readUpload } from '../lib/workspace-tools';
import { encode64,decode64 } from '../lib/crypto';
import { requestGeneratedImage,imageModel } from '../lib/image-generation';

test('PowerPoint creation produces an editable deck and can read its slide text back',async()=>{
 const {blob,filename}=await makePresentation({filename:'Quarterly plan',title:'Quarterly plan',subtitle:'A practical roadmap',slides:[{title:'Priorities',bullets:['Ship the workspace','Measure adoption'],notes:'Discuss milestones'},{title:'Next steps',body:'Start with a small pilot.'}]},[]);
 assert.equal(filename,'Quarterly plan.pptx');
 assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.presentationml.presentation');
 const zip=await JSZip.loadAsync(await blob.arrayBuffer());
 assert.ok(zip.file('ppt/slides/slide1.xml'));
 assert.ok(zip.file('ppt/slides/slide2.xml'));
 assert.ok(zip.file('ppt/slides/slide3.xml'));
 const upload=new File([blob],filename,{type:blob.type});
 const asset=await readUpload(upload);
 assert.match(asset.text||'',/Priorities/);
 assert.match(asset.text||'',/Start with a small pilot/);
});
test('large image bytes can be base64 encoded for encrypted R2 storage',()=>{
 const original=crypto.getRandomValues(new Uint8Array(65536));
 const bytes=new Uint8Array(2_000_000);for(let i=0;i<bytes.length;i+=original.length)bytes.set(original.subarray(0,Math.min(original.length,bytes.length-i)),i);
 assert.deepEqual(decode64(encode64(bytes)),bytes);
});
test('image generation uses the saved key and validates returned PNG bytes',async()=>{
 const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
 let seen:any;
 const fakeFetch:typeof fetch=async(url,init)=>{seen={url,init};return Response.json({data:[{b64_json:encode64(png)}]});};
 const result=await requestGeneratedImage('secret-key','A calm landscape','1536x1024',fakeFetch);
 assert.deepEqual(result,png);
 assert.equal(seen.url,'https://api.openai.com/v1/images/generations');
 assert.equal(seen.init.headers.Authorization,'Bearer secret-key');
 assert.deepEqual(JSON.parse(seen.init.body),{model:imageModel,prompt:'A calm landscape',size:'1536x1024',quality:'medium',output_format:'png',n:1});
});
