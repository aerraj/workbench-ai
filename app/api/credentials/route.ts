import { z } from 'zod';
import { bindings,json,sameOrigin,readJson,requireUser,HttpError,failure } from '@/lib/account-server';
import { encrypt,fingerprint } from '@/lib/crypto';
import { catalog } from '@/lib/catalog';
const provider=z.enum(['openai','anthropic','gemini','openrouter']);
export async function GET(request:Request){try{const env=await bindings();const user=await requireUser(request,env);const {results}=await env.DB.prepare('SELECT provider,last4,models FROM provider_keys WHERE user_id=?').bind(user.id).all<{provider:string;last4:string;models:string}>();return json({credentials:results.map(row=>({...row,models:JSON.parse(row.models)}))});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const env=await bindings();const user=await requireUser(request,env);
 const parsed=z.object({provider, key:z.string().trim().min(8).max(512).optional(), models:z.array(z.string()).max(30)}).safeParse(await readJson(request));
 if(!parsed.success)throw new HttpError(400,'Provide a valid provider, key, and model selection.');const {provider:p,key,models}=parsed.data;
 if(models.some(id=>!catalog[p].some(m=>m.id===id)))throw new HttpError(400,'Select a model from the list.');
 if(key){
  try { await env.DB.prepare('INSERT INTO provider_keys(user_id,provider,encrypted_key,fingerprint,last4,models) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET encrypted_key=excluded.encrypted_key,fingerprint=excluded.fingerprint,last4=excluded.last4,models=excluded.models').bind(user.id,p,await encrypt(key,env.VAULT_MASTER_KEY,`${user.id}:${p}`),await fingerprint(key,env.VAULT_MASTER_KEY),key.slice(-4),JSON.stringify([...new Set(models)])).run(); }
  catch(e){if(String(e).includes('UNIQUE'))throw new HttpError(409,'This API key is already linked to an account or provider. Use a separate key.');throw e;}
 }else{
  const result=await env.DB.prepare('UPDATE provider_keys SET models=? WHERE user_id=? AND provider=?').bind(JSON.stringify([...new Set(models)]),user.id,p).run();if(!result.meta.changes)throw new HttpError(400,'Add an API key for this provider first.');
 }
 return json({ok:true});
}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{sameOrigin(request);const env=await bindings();const user=await requireUser(request,env);const parsed=provider.safeParse((await readJson(request)).provider);if(!parsed.success)throw new HttpError(400,'Invalid provider.');await env.DB.prepare('DELETE FROM provider_keys WHERE user_id=? AND provider=?').bind(user.id,parsed.data).run();return json({ok:true});}catch(e){return failure(e);}}
