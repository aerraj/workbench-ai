import { encode64, randomSecret, tokenHash } from './crypto';

export const oauthSecret = () => randomSecret().replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function pkceChallenge(verifier:string) {
 return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export function oauthCookieName(request:Request) {
 return new URL(request.url).protocol==='https:'?'__Host-workbench_google':'workbench_google';
}
export function oauthCookie(request:Request,value:string,maxAge=600) {
 return `${oauthCookieName(request)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
export function readOauthCookie(request:Request) {
 const value=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(oauthCookieName(request)+'='))?.split('=').slice(1).join('=');
 return value?decodeURIComponent(value):null;
}
export async function consumeState(db:D1Database,state:string) {
 return db.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING state_hash').bind(await tokenHash(state),Date.now()).first();
}
