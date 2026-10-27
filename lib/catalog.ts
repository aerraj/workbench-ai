import type { Provider } from './contracts';
export const catalog: Record<Provider, {id:string;name:string}[]> = {
 openai: [
  {id:'gpt-6-astra',name:'GPT-6 Astra'},{id:'gpt-6-sol',name:'GPT-6 Sol'},{id:'gpt-6-luna',name:'GPT-6 Luna'},
  {id:'gpt-5.6-sol',name:'GPT-5.6 Sol'},{id:'gpt-5.6-terra',name:'GPT-5.6 Terra'},{id:'gpt-5.6-luna',name:'GPT-5.6 Luna'},{id:'gpt-4.1',name:'GPT-4.1'},
 ],
 anthropic:[{id:'claude-sonnet-4-5',name:'Claude Sonnet 4.5'}],
 gemini:[{id:'gemini-2.5-flash',name:'Gemini 2.5 Flash'},{id:'gemini-2.5-pro',name:'Gemini 2.5 Pro'}],
 openrouter:[{id:'openai/gpt-5.6-sol',name:'GPT-5.6 Sol'},{id:'openai/gpt-4.1',name:'GPT-4.1'},{id:'anthropic/claude-sonnet-4.5',name:'Claude Sonnet 4.5'},{id:'google/gemini-2.5-flash',name:'Gemini 2.5 Flash'}],
};
export type CredentialSummary = {provider:Provider;last4:string;models:string[]};
export type Account = {id:string;username:string;theme:'light'|'dark';workspaceKey:string;authProvider?:'google'|'password'};
