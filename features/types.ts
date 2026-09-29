import type { Asset, Message, Provider } from '@/lib/contracts';
export type ChatSummary={id:string;title:string;updated:number;created:number;provider:Provider|null;model:string|null};
export type ChatMessage=Message & {id:string;position:number;feedback?:'up'|'down'};
export type Artifact={id:string;title:string;kind:'document'|'code'|'table'|'chart'|'html'|'image'|'text';version:number;content:string;fileId?:string|null};
export type WorkspaceAsset=Asset;
export type ChatDetail={messages:ChatMessage[];files:Omit<WorkspaceAsset,'blob'|'data'>[];artifacts:Artifact[]};
