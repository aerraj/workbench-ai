import { z } from 'zod';
import { bindings,json,sameOrigin,readJson,requireUser,authRateLimit,sessionCookie,sessionToken,HttpError,failure } from '@/lib/account-server';
import { randomSecret,passwordHash,equalHash,encrypt,decrypt,tokenHash } from '@/lib/crypto';
const credentials=z.object({action:z.enum(['register','login']),username:z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,40}$/),password:z.string().min(8).max(128)});
export async function GET(request:Request){try{const env=await bindings();const user=await requireUser(request,env);return json({user:{id:user.id,username:user.username,theme:user.theme,authProvider:user.google_sub?'google':'password',workspaceKey:await decrypt(user.workspace_key,env.VAULT_MASTER_KEY,`${user.id}:workspace`)}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const env=await bindings();const body=await readJson(request);
 if(body.action==='logout'){await requireUser(request,env);const token=sessionToken(request);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await tokenHash(token)).run();return json({ok:true},200,{'Set-Cookie':sessionCookie(request,'',0)});}
 if(body.action==='theme'){const user=await requireUser(request,env);const theme=z.enum(['light','dark']).parse(body.theme);await env.DB.prepare('UPDATE users SET theme=? WHERE id=?').bind(theme,user.id).run();return json({ok:true});}
 if(body.action==='password'){
  const user=await requireUser(request,env);await authRateLimit(request,env,user.username);
  const parsed=z.object({current:z.string().min(1).max(128),password:z.string().min(8).max(128)}).safeParse(body);if(!parsed.success)throw new HttpError(400,'Use a password between 8 and 128 characters.');
  const row=await env.DB.prepare('SELECT password_hash,salt FROM users WHERE id=?').bind(user.id).first<{password_hash:string;salt:string}>();
  if(!row||!equalHash(row.password_hash,await passwordHash(parsed.data.current,row.salt,env.VAULT_MASTER_KEY)))throw new HttpError(401,'Current password is incorrect.');
  const salt=randomSecret();await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=?').bind(await passwordHash(parsed.data.password,salt,env.VAULT_MASTER_KEY),salt,user.id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
  return json({ok:true},200,{'Set-Cookie':sessionCookie(request,'',0)});
 }
 const parsed=credentials.safeParse(body);if(!parsed.success)throw new HttpError(400,'Use a username of 3–40 letters, numbers or underscores, and a password of 8–128 characters.');
 const {action,username,password}=parsed.data;await authRateLimit(request,env,username);
 let row=await env.DB.prepare('SELECT id,username,password_hash,salt FROM users WHERE username=?').bind(username).first<{id:string;username:string;password_hash:string;salt:string}>();
 if(action==='register'){
  if(row)throw new HttpError(409,'This username is unavailable.');const id=crypto.randomUUID();const salt=randomSecret();const hash=await passwordHash(password,salt,env.VAULT_MASTER_KEY);
  try{await env.DB.prepare('INSERT INTO users(id,username,password_hash,salt,workspace_key,created_at) VALUES(?,?,?,?,?,?)').bind(id,username,hash,salt,await encrypt(randomSecret(),env.VAULT_MASTER_KEY,`${id}:workspace`),Date.now()).run();}catch{throw new HttpError(409,'Could not register this username. Try another.');}
  row={id,username,password_hash:hash,salt};
 }else{
  const hash=await passwordHash(password,row?.salt||'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',env.VAULT_MASTER_KEY);
  if(!row||!equalHash(hash,row.password_hash))throw new HttpError(401,'Incorrect username or password.');
 }
 const token=randomSecret().replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await tokenHash(token),row!.id,Date.now()+604800000).run();
 return json({ok:true},200,{'Set-Cookie':sessionCookie(request,token)});
}catch(e){return failure(e);}}
