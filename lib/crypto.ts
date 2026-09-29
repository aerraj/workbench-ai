const encoder = new TextEncoder();
export const encode64 = (bytes: Uint8Array) => {
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return btoa(binary);
};
export const decode64 = (s:string) => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
export const randomSecret = () => encode64(crypto.getRandomValues(new Uint8Array(32)));
async function derived(master:string, purpose:string, algorithm:'AES-GCM'|'HMAC') {
 const material = await crypto.subtle.importKey('raw',decode64(master), 'HKDF',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('workbench-v1'),info:encoder.encode(purpose)}, material, algorithm==='AES-GCM'?{name:'AES-GCM',length:256}:{name:'HMAC',hash:'SHA-256',length:256},false,algorithm==='AES-GCM'?['encrypt','decrypt']:['sign']);
}
export async function fingerprint(value:string, master:string, purpose='api-key') {
 const key=await derived(master,purpose,'HMAC');return encode64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))));
}
export async function encrypt(value:string, master:string, context:string) {
 const iv=crypto.getRandomValues(new Uint8Array(12));const key=await derived(master,'vault','AES-GCM');
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},key,encoder.encode(value));
 return `v1.${encode64(iv)}.${encode64(new Uint8Array(encrypted))}`;
}
export async function decrypt(value:string, master:string, context:string) {
 const [version,iv,data]=value.split('.');if(version!=='v1')throw new Error('Unsupported vault version');
 const key=await derived(master,'vault','AES-GCM');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(iv),additionalData:encoder.encode(context)},key,decode64(data)));
}
export async function passwordHash(password:string,salt:string,master:string) {
 // Pepper prevents offline password guessing from a database-only compromise.
 const peppered=await fingerprint(password,master,'password-pepper');
 const key=await crypto.subtle.importKey('raw',encoder.encode(peppered),'PBKDF2',false,['deriveBits']);
 return encode64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode64(salt),iterations:100000},key,256)));
}
export function equalHash(a:string,b:string) { let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0; }
export async function tokenHash(token:string) { return encode64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token)))); }
