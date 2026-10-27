import { decrypt, tokenHash, fingerprint } from './crypto';
import type { Provider } from './contracts';
import { ZodError } from 'zod';
export type Bindings={DB:D1Database;VAULT_MASTER_KEY:string;GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string;BUCKET?:R2Bucket};
export class HttpError extends Error { constructor(public status:number,message:string){super(message);} }
export async function bindings():Promise<Bindings> { const {env}=await import('cloudflare:workers');if(!env.DB||!env.VAULT_MASTER_KEY)throw new HttpError(503,'Account service is not configured.');return env as Bindings; }
export const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export function sameOrigin(request:Request) { if(request.headers.get('origin')!==new URL(request.url).origin)throw new HttpError(403,'Request origin is not allowed.'); }
export async function readJson(request:Request) { if(Number(request.headers.get('content-length')||0)>16000)throw new HttpError(413,'Request too large.');const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Request body required.');let text='';let size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();throw new HttpError(413,'Request too large.');}text+=decoder.decode(value,{stream:true});}try{return JSON.parse(text+decoder.decode());}catch{throw new HttpError(400,'Invalid request.');} }
export function cookieName(request:Request) {return new URL(request.url).protocol==='https:'?'__Host-workbench_session':'workbench_session';}
export function sessionCookie(request:Request,token:string,maxAge=604800) {return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export function sessionToken(request:Request){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName(request)+'='))?.split('=').slice(1).join('=');}
export async function requireUser(request:Request,env:Bindings) {
 const token=sessionToken(request);if(!token)throw new HttpError(401,'Please sign in.');
 const user=await env.DB.prepare('SELECT u.id,u.username,u.theme,u.workspace_key,u.google_sub FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await tokenHash(token),Date.now()).first<{id:string;username:string;theme:'light'|'dark';workspace_key:string;google_sub:string|null}>();
 if(!user)throw new HttpError(401,'Your session expired. Please sign in again.');const expected=request.headers.get('X-Workbench-User');if(expected&&expected!==user.id)throw new HttpError(401,'The signed-in account changed. Reload this tab.');return user;
}
export async function rateLimit(env:Bindings,id:string,max:number,seconds=900) {
 const now=Date.now();const row=await env.DB.prepare('INSERT INTO rate_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(id,now+seconds*1000,now,now).first<{count:number}>();
 if(!row||row.count>max)throw new HttpError(429,'Too many attempts. Please try again later.');
}
export async function authRateLimit(request:Request,env:Bindings,username:string) {
 const ip=request.headers.get('CF-Connecting-IP')||'local';await rateLimit(env,'ip:'+await fingerprint(ip,env.VAULT_MASTER_KEY,'rate-limit'),30);await rateLimit(env,'user:'+await fingerprint(username,env.VAULT_MASTER_KEY,'rate-limit'),10);
 await env.DB.batch([env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(Date.now()-86400000),env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now())]);
}
export async function savedKey(request:Request,provider:Provider,model:string) {
 const env=await bindings();const user=await requireUser(request,env);await rateLimit(env,'chat:'+user.id,60,60);
 const row=await env.DB.prepare('SELECT encrypted_key,models FROM provider_keys WHERE user_id=? AND provider=?').bind(user.id,provider).first<{encrypted_key:string;models:string}>();
 if(!row||!JSON.parse(row.models).includes(model))throw new HttpError(400,'Enable this model in Models & keys first.');
 return decrypt(row.encrypted_key,env.VAULT_MASTER_KEY,`${user.id}:${provider}`);
}
export function failure(error:unknown) {return json({error:error instanceof HttpError?error.message:error instanceof ZodError?'Invalid request. Check the supplied fields.':'Could not complete the request. Please try again.'},error instanceof HttpError?error.status:error instanceof ZodError?400:500);}
