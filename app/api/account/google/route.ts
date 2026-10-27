import { bindings, failure, HttpError, rateLimit } from '@/lib/account-server';
import { encrypt, tokenHash, fingerprint } from '@/lib/crypto';
import { oauthSecret, pkceChallenge, oauthCookie } from '@/lib/google-auth';

export async function GET(request:Request) {
 try {
  const env=await bindings();
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)throw new HttpError(503,'Google sign-in is not configured yet. Please use your username and password.');
  await rateLimit(env,'google-ip:'+await fingerprint(request.headers.get('CF-Connecting-IP')||'local',env.VAULT_MASTER_KEY,'rate-limit'),30);
  const state=oauthSecret(),verifier=oauthSecret();
  await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at<?').bind(Date.now()).run();
  await env.DB.prepare('INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)').bind(await tokenHash(state),Date.now()+600000).run();
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:new URL('/api/account/google/callback',request.url).href,response_type:'code',scope:'openid email profile',state,code_challenge:await pkceChallenge(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();
  const cookie=await encrypt(JSON.stringify({state,verifier,expires:Date.now()+600000}),env.VAULT_MASTER_KEY,'google-oauth');
  return new Response(null,{status:302,headers:{Location:url.href,'Cache-Control':'no-store','Set-Cookie':oauthCookie(request,cookie)}});
 }catch(error){return failure(error);}
}
