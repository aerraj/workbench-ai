import { z } from 'zod';
import { bindings,requireUser,sameOrigin,readJson,rateLimit,json,failure,HttpError } from '@/lib/account-server';
import { decrypt } from '@/lib/crypto';
import { requestGeneratedImage } from '@/lib/image-generation';
import { assertChat,saveFile,saveArtifact,deleteFile } from '@/lib/workspace-repository';

const schema=z.object({
 chatId:z.string().uuid(),
 filename:z.string().min(1).max(100),
 prompt:z.string().min(1).max(4000),
 size:z.enum(['1024x1024','1536x1024','1024x1536']).default('1024x1024'),
});
export async function POST(request:Request){
 try{
  sameOrigin(request);const env=await bindings(),user=await requireUser(request,env),input=schema.parse(await readJson(request));
  await assertChat(env,user.id,input.chatId);
  await rateLimit(env,`image:${user.id}`,20,3600);
  const row=await env.DB.prepare('SELECT encrypted_key FROM provider_keys WHERE user_id=? AND provider=?').bind(user.id,'openai').first<{encrypted_key:string}>();
  if(!row)throw new HttpError(400,'Save an OpenAI API key in Models & keys to generate images.');
  const key=await decrypt(row.encrypted_key,env.VAULT_MASTER_KEY,`${user.id}:openai`);
  const bytes=await requestGeneratedImage(key,input.prompt,input.size,fetch,AbortSignal.any([request.signal,AbortSignal.timeout(120000)]));
  const fileId=crypto.randomUUID(),filename=(input.filename.replace(/[^\w. -]/g,'_').slice(0,95)||'image').replace(/\.png$/i,'')+'.png';
  await saveFile(env,user,input.chatId,{id:fileId,name:filename,type:'image/png',size:bytes.length,text:undefined,generated:true,bytes});
  try{
   const artifact=await saveArtifact(env,user,input.chatId,filename,'image',input.prompt,fileId);
   return json({file:{id:fileId,name:filename,type:'image/png',size:bytes.length,generated:true},artifact,result:`Created ${filename}. The image is available in the workspace for download. File ID: ${fileId}`});
  }catch(error){await deleteFile(env,user.id,fileId);throw error;}
 }catch(error){return failure(error);}
}
