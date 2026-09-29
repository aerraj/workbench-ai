import { decode64 } from './crypto';
import { HttpError } from './account-server';

export const imageModel='gpt-image-2.5-flare';
export async function requestGeneratedImage(key:string,prompt:string,size:'1024x1024'|'1536x1024'|'1024x1536',providerFetch:typeof fetch=fetch,signal?:AbortSignal){
 const response=await providerFetch('https://api.openai.com/v1/images/generations',{
  method:'POST',
  headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({model:imageModel,prompt,size,quality:'medium',output_format:'png',n:1}),
  signal,
 });
 if(!response.ok){
  const data=await response.json().catch(()=>({})) as {error?:{message?:string}};
  const message=response.status===401||response.status===403?'OpenAI rejected this key or image model. Check your OpenAI key and organization access.':response.status===429?'OpenAI image generation is rate-limited or out of credits.':(data.error?.message||'Image generation failed.').replaceAll(key,'[redacted]').slice(0,300);
  throw new HttpError(response.status,message);
 }
 const data=await response.json() as {data?:Array<{b64_json?:string}>};
 const encoded=data.data?.[0]?.b64_json;
 if(!encoded||encoded.length>14_000_000)throw new HttpError(502,'The image provider returned no usable image.');
 let bytes:Uint8Array;try{bytes=decode64(encoded);}catch{throw new HttpError(502,'The image provider returned invalid image data.');}
 if(bytes.length>10*1024*1024||bytes.length<8||[137,80,78,71,13,10,26,10].some((byte,i)=>bytes[i]!==byte))throw new HttpError(502,'The image provider returned an unsupported image.');
 return bytes;
}
