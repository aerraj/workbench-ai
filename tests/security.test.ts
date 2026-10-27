import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomSecret,encrypt,decrypt,fingerprint,passwordHash,equalHash} from '../lib/crypto';
import {sameOrigin,sessionCookie} from '../lib/account-server';
test('API key encryption is randomized and bound to its owner and provider',async()=>{
 const master=randomSecret(),secret='sk-test-private-value';
 const a=await encrypt(secret,master,'user-a:openai'),b=await encrypt(secret,master,'user-a:openai');
 assert.notEqual(a,b);assert.ok(!a.includes(secret));assert.equal(await decrypt(a,master,'user-a:openai'),secret);
 await assert.rejects(()=>decrypt(a,master,'user-b:openai'));await assert.rejects(()=>decrypt(a,master,'user-a:gemini'));await assert.rejects(()=>decrypt(a,randomSecret(),'user-a:openai'));
 const tampered=a.slice(0,-5)+'AAAAA';await assert.rejects(()=>decrypt(tampered,master,'user-a:openai'));
});
test('key uniqueness fingerprints are deterministic and secret keyed',async()=>{
 const master=randomSecret();assert.equal(await fingerprint('key',master),await fingerprint('key',master));assert.notEqual(await fingerprint('key',master),await fingerprint('other-key',master));assert.notEqual(await fingerprint('key',master),await fingerprint('key',randomSecret()));
});
test('passwords are salted and peppered, and verification rejects incorrect passwords',async()=>{
 const salt=randomSecret(),master=randomSecret(),password='a-password-long-enough';const hash=await passwordHash(password,salt,master);
 assert.ok(equalHash(hash,await passwordHash(password,salt,master)));assert.ok(!equalHash(hash,await passwordHash('incorrect',salt,master)));assert.notEqual(hash,await passwordHash(password,randomSecret(),master));assert.notEqual(hash,await passwordHash(password,salt,randomSecret()));
});
test('production sessions use secure HttpOnly cookies and writes reject foreign origins',()=>{
 const request=new Request('https://workbench.example/api/account',{headers:{origin:'https://workbench.example'}});
 assert.match(sessionCookie(request,'token'),/^__Host-workbench_session=token/);assert.match(sessionCookie(request,'token'),/HttpOnly; SameSite=Strict; Max-Age=604800; Secure/);sameOrigin(request);
 assert.throws(()=>sameOrigin(new Request(request.url,{headers:{origin:'https://other.example'}})));assert.throws(()=>sameOrigin(new Request(request.url)));
});

test('Google OAuth uses RFC 7636 PKCE and a cross-site return cookie scoped to the host',async()=>{
 const {pkceChallenge,oauthCookie,readOauthCookie}=await import('../lib/google-auth');
 assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 const request=new Request('https://workbench.example/api/account/google');
 const cookie=oauthCookie(request,'v1.a+b/c==');
 assert.match(cookie,/^__Host-workbench_google=/);assert.match(cookie,/HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
 assert.equal(readOauthCookie(new Request(request.url,{headers:{cookie:cookie.split(';')[0]}})),'v1.a+b/c==');
 assert.match(oauthCookie(request,'',0),/Max-Age=0/);
});
