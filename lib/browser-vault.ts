import { get,set } from 'idb-keyval';
import type { Account } from './catalog';
import type { Conversation } from './contracts';
async function keyFor(user:Account) { return crypto.subtle.importKey('raw',Uint8Array.from(atob(user.workspaceKey),c=>c.charCodeAt(0)), 'AES-GCM', false, ['encrypt','decrypt']); }
export async function loadConversations(user:Account):Promise<Conversation[]> {
 const saved=await get<{iv:Uint8Array;data:ArrayBuffer}>(`workbench:${user.id}`);if(!saved)return [];
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(saved.iv),additionalData:new TextEncoder().encode(user.id)},await keyFor(user),saved.data);
 const data=JSON.parse(new TextDecoder().decode(plain));
 return data.map((c:any)=>({...c,assets:c.assets.map((a:any)=>{const {blob64,...rest}=a;const bytes=Uint8Array.from(atob(blob64),c=>c.charCodeAt(0));return {...rest,blob:new Blob([bytes],{type:a.type})};})}));
}
export async function saveConversations(user:Account,conversations:Conversation[]) {
 const data=await Promise.all(conversations.map(async c=>({...c,assets:await Promise.all(c.assets.map(async a=>{const {blob,...rest}=a;const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve((reader.result as string).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});return {...rest,blob64:encoded};}))})));
 const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(user.id)},await keyFor(user),new TextEncoder().encode(JSON.stringify(data)));
 await set(`workbench:${user.id}`,{iv,data:encrypted});
}
