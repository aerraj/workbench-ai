import { bindings, sessionCookie } from '@/lib/account-server';
import { decrypt, encrypt, equalHash, randomSecret, tokenHash } from '@/lib/crypto';
import { consumeState, oauthCookie, oauthSecret, readOauthCookie } from '@/lib/google-auth';

export async function GET(request:Request) {
 const headers=new Headers({'Cache-Control':'no-store'});
 headers.append('Set-Cookie',oauthCookie(request,'',0));
 try {
  const env=await bindings();
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)throw new Error('Unconfigured');
  const url=new URL(request.url),cookie=readOauthCookie(request);
  if(!cookie)throw new Error('Missing state');
  const flow=JSON.parse(await decrypt(cookie,env.VAULT_MASTER_KEY,'google-oauth')) as {state:string;verifier:string;expires:number};
  const state=url.searchParams.get('state'),code=url.searchParams.get('code');
  if(!state||!equalHash(state,flow.state)||flow.expires<Date.now()||!await consumeState(env.DB,state))throw new Error('Invalid state');
  if(!code||url.searchParams.has('error'))throw new Error('Cancelled');
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:new URL('/api/account/google/callback',request.url).href,grant_type:'authorization_code',code_verifier:flow.verifier}),signal:AbortSignal.timeout(15000)});
  if(!tokenResponse.ok)throw new Error('Token exchange failed');
  const tokens=await tokenResponse.json() as {access_token?:string};
  if(!tokens.access_token)throw new Error('Missing token');
  const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(15000)});
  if(!profileResponse.ok)throw new Error('Profile failed');
  const profile=await profileResponse.json() as {sub?:string;email_verified?:boolean};
  if(typeof profile.sub!=='string'||!profile.sub||profile.email_verified!==true)throw new Error('Unverified profile');
  let user=await env.DB.prepare('SELECT id FROM users WHERE google_sub=?').bind(profile.sub).first<{id:string}>();
  if(!user){
   const id=crypto.randomUUID(),username='google_'+id.replaceAll('-','').slice(0,24);
   // A Google-only account has no usable password. Never link by email or username.
   await env.DB.prepare('INSERT INTO users(id,username,password_hash,salt,workspace_key,created_at,google_sub) VALUES(?,?,?,?,?,?,?) ON CONFLICT(google_sub) DO NOTHING').bind(id,username,'!google-only',randomSecret(),await encrypt(randomSecret(),env.VAULT_MASTER_KEY,`${id}:workspace`),Date.now(),profile.sub).run();
   user=await env.DB.prepare('SELECT id FROM users WHERE google_sub=?').bind(profile.sub).first<{id:string}>();
  }
  if(!user)throw new Error('Account creation failed');
  const token=oauthSecret();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await tokenHash(token),user.id,Date.now()+604800000).run();
  headers.append('Set-Cookie',sessionCookie(request,token));headers.set('Location',new URL('/',request.url).href);
 }catch {headers.set('Location',new URL('/?auth_error=google',request.url).href);}
 return new Response(null,{status:303,headers});
}
