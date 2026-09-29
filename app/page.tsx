'use client';
import { useEffect, useRef, useState } from 'react';
import { AccountGate, applyTheme } from '@/components/account-gate';
import { ModelSettings } from '@/components/model-settings';
import { Account, CredentialSummary, catalog } from '@/lib/catalog';
import { loadConversations, saveConversations } from '@/lib/browser-vault';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, ArrowUpRight, Plus, Paperclip, MessageSquare, FolderOpen, Settings2, FileText, Download, X, Sparkles, Square, ChevronRight, Wrench, Table2, Code2, ImageIcon, PanelRightClose, PanelRightOpen, Loader2, Check, Trash2, Moon, Sun, LogOut } from 'lucide-react';
import { Sidebar, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { providers, Asset, Conversation, Message, Provider } from '@/lib/contracts';
import { downloadAsset, executeTool, readUpload, makeDocument } from '@/lib/workspace-tools';
const fresh = (): Conversation => ({ id: crypto.randomUUID(), title: 'New conversation', messages: [], assets: [], updated: Date.now() });
const starters = [
  { icon: FileText, title: 'Draft a document', text: 'From rough notes to a finished Word file.', prompt: 'Help me create a polished Word document. Ask me for the topic, audience, and any notes you need.', color: 'green' },
  { icon: Table2, title: 'Make sense of data', text: 'Explore a CSV. Find what matters.', prompt: 'Analyze my uploaded CSV. Summarize the key numbers and patterns, and create a short report.', color: 'blue' },
  { icon: ImageIcon, title: 'Work with an image', text: 'Understand, extract, and get ideas.', prompt: 'Help me understand the image I upload. Describe the key details and extract any readable text.', color: 'orange' },
  { icon: Code2, title: 'Build something', text: 'Turn an idea into downloadable code.', prompt: 'Help me build a small project. Ask what I want to make, then create the source files for download.', color: 'purple' },
];
export default function Home() { return <AccountGate>{(user,logout,updateUser)=><Workbench key={user.id} user={user} logout={logout} updateUser={updateUser}/>}</AccountGate>; }
function Workbench({user,logout,updateUser}:{user:Account;logout:()=>Promise<void>;updateUser:(user:Account)=>void}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('work');
  const [provider, setProvider] = useState<Provider>('openai');
  const [models, setModels] = useState<Record<Provider,string>>({ openai: providers.openai.model, anthropic: providers.anthropic.model, gemini: providers.gemini.model, openrouter: providers.openrouter.model });
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [currentPassword,setCurrentPassword]=useState('');const [newPassword,setNewPassword]=useState('');const [changingPassword,setChangingPassword]=useState(false);
  const enabledModels=credentials.flatMap(c=>c.models.map(id=>({provider:c.provider,id,name:catalog[c.provider].find(m=>m.id===id)?.name||id})));
  const connected=credentials.some(c=>c.provider===provider);
  const [settings, setSettings] = useState(false);
  const [panel, setPanel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<Asset | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const persistence = useRef(Promise.resolve());
  async function refreshCredentials(){const response=await fetch('/api/credentials',{headers:{'X-Workbench-User':user.id}});const data=await response.json() as {credentials:CredentialSummary[];error?:string};if(!response.ok)throw new Error(data.error||'Could not load saved models.');setCredentials(data.credentials);}
  useEffect(() => {
    let active=true;if(window.innerWidth<1000)setPanel(false);
    loadConversations(user).then(list=>{if(active){setConversations(list);setCurrent(list[0]||fresh());setReady(true);}}).catch(()=>{if(active)setError('Could not unlock your saved workspace. Reload before continuing.');});
    refreshCredentials().catch(e=>setError(e.message));
    const p=localStorage.getItem(`workbench-preferences:${user.id}`);if(p){try{const v=JSON.parse(p);if(v.provider in providers)setProvider(v.provider);if(v.models)setModels(v.models);}catch{}}
    return()=>{active=false;controller.current?.abort();};
  }, [user.id]);
  useEffect(()=>{if(enabledModels.length&&!enabledModels.some(m=>m.provider===provider&&m.id===models[provider])){const first=enabledModels[0];setProvider(first.provider);setModels(old=>({...old,[first.provider]:first.id}));}},[credentials,provider,models]);
  useEffect(() => { if (ready) localStorage.setItem(`workbench-preferences:${user.id}`, JSON.stringify({ provider, models })); }, [provider, models, ready,user.id]);
  async function toggleTheme(){const theme=user.theme==='dark'?'light':'dark';applyTheme(theme);updateUser({...user,theme});try{const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-User':user.id},body:JSON.stringify({action:'theme',theme})});if(!r.ok)throw new Error();}catch{setError('Could not save your theme preference.');}}
  async function signOut(){try{await persistence.current;await logout();}catch(e){setError(e instanceof Error?e.message:'Could not sign out.');}}
  async function changePassword(){setChangingPassword(true);try{const r=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-User':user.id},body:JSON.stringify({action:'password',current:currentPassword,password:newPassword})});const result=await r.json() as {error?:string};if(!r.ok)throw new Error(result.error);await logout();}catch(e){setError(e instanceof Error?e.message:'Could not change password.');}finally{setChangingPassword(false);}}
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [current?.messages.length, status]);
  function save(c: Conversation) {
    setCurrent(c); setConversations(old => { const next = [c, ...old.filter(x => x.id !== c.id)]; persistence.current = persistence.current.then(() => saveConversations(user, next)).catch(() => { setError('Could not save to browser storage. Download important files before closing.'); }); return next; });
  }
  async function addFiles(files: FileList | null) {
    if (!files || !current || busy || uploading) return; setUploading(true); setError('');
    const assets = [...current.assets];
    for (const file of Array.from(files)) { try { if (assets.length >= 30) throw new Error('A conversation can contain up to 30 files.'); if (assets.reduce((n,a) => n+a.size,0) + file.size > 50*1024*1024) throw new Error('Workspace file limit is 50 MB per conversation.'); if (/^image\//.test(file.type) && assets.filter(a=>a.data).length >= 4) throw new Error('Use up to 4 images per conversation. Remove an image before adding another.'); assets.push(await readUpload(file)); } catch(e) { setError(e instanceof Error ? e.message : 'Could not read file'); } }
    save({ ...current, assets }); setUploading(false); if (upload.current) upload.current.value = '';
  }
  async function send() {
    if (!input.trim() || !current || busy || uploading) return;
    if (!enabledModels.some(m=>m.provider===provider&&m.id===models[provider])) { setSettings(true); setError('Save an API key and enable a model to start this conversation.'); return; }
    setBusy(true); setError(''); setStatus('Thinking'); const abort = new AbortController(); controller.current = abort;
    const text = input.trim(); setInput('');
    // Every send includes current image attachments; older copies are removed to bound payload size.
    const history = current.messages.map(m => ({ ...m, images: undefined }));
    const images = current.assets.filter(a => a.data).map(a => a.data!).slice(-4);
    const context = mode === 'chat' ? current.assets.filter(a => a.text).map(a => `\n\n<file name=${JSON.stringify(a.name)}>\n${a.text}\n</file>`).join('').slice(0,100000) : '';
    let working: Conversation = { ...current, title: current.messages.length ? current.title : text.slice(0,48), updated: Date.now(), messages: [...history, { role: 'user', content: text + context, ...(images.length ? { images } : {}) }] };
    save(working);
    try {
      for (let round = 0; round < 8; round++) {
        if (abort.signal.aborted) throw new DOMException('Stopped','AbortError');
        setStatus(round ? 'Continuing the task' : 'Thinking');
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench-User':user.id }, signal: abort.signal, body: JSON.stringify({ provider, model: models[provider], work: mode === 'work', messages: working.messages, files: working.assets.map(({id,name,type,size}) => ({ id,name,type,size })) }) });
        const message = await response.json() as Message & { error?: string }; if (!response.ok) throw new Error(message.error || 'Request failed');
        const assistant: Message = { ...message, model: `${providers[provider].name} · ${models[provider]}` };
        working = { ...working, messages: [...working.messages, assistant] }; save(working);
        if (!assistant.toolCalls?.length) break;
        for (const call of assistant.toolCalls) {
          let result = '';
          if (abort.signal.aborted) { result = 'Tool cancelled by user.'; }
          else {
            setStatus(`Using ${call.name.replaceAll('_',' ')}`);
            try { if (mode !== 'work') throw new Error('Tools are disabled in Chat mode.'); if (working.assets.length >= 30 && ['create_document','write_file'].includes(call.name)) throw new Error('Workspace file limit reached.'); const output = await executeTool(call, working.assets); result = output.result; if (output.asset) working = { ...working, assets: [...working.assets, output.asset] }; }
            catch(e) { result = `Tool error: ${e instanceof Error ? e.message : 'Operation failed'}`; }
          }
          working = { ...working, messages: [...working.messages, { role: 'tool', content: result, toolCallId: call.id }] }; save(working);
        }
        if (round === 7) setError('Reached the 8-step limit. Send a follow-up to continue.');
      }
    } catch(e) { setError(e instanceof Error && e.name === 'AbortError' ? 'Stopped. Your completed work is saved.' : e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); setStatus(''); controller.current = null; }
  }
  async function exportWord(message: Message) { try { const blob = await makeDocument(message.content); downloadAsset({ id:'export', name:'workbench-response.docx', size:blob.size, type:blob.type, blob }); } catch { setError('Could not export document.'); } }
  const files = current?.assets || [];
  const visible = (current?.messages || []).filter(m => m.role !== 'tool');
  return <SidebarProvider className="workbench">
    <Sidebar className="app-sidebar"><div className="sidebar-inner">
      <a className="brand" href="/" aria-label="Workbench home"><span className="brand-mark">w</span>workbench<span className="brand-dot">®</span></a>
      <button className="new-chat" disabled={busy || uploading || !ready} onClick={() => { setCurrent(fresh()); setInput(''); setError(''); }}><Plus size={18}/> New conversation <span>↗</span></button>
      <div className="nav-label">YOUR SPACE</div>
      <button className="nav-item active" onClick={() => setPanel(false)}><MessageSquare size={17}/> Conversations <span>{conversations.length}</span></button>
      <button className="nav-item" onClick={() => setPanel(true)}><FolderOpen size={17}/> Workspace files <span>{files.length}</span></button>
      <div className="nav-label recent-label">RECENT</div>
      <div className="history">{conversations.length ? conversations.map(c => <div className={`history-row ${c.id === current?.id ? 'selected' : ''}`} key={c.id}><button disabled={busy || uploading} onClick={() => { setCurrent(c); setError(''); setInput(''); }}><MessageSquare size={14}/><span>{c.title}</span></button><button aria-label={`Delete ${c.title}`} disabled={busy || uploading} onClick={() => { if (!confirm('Delete this conversation and its stored files?')) return; const next = conversations.filter(x=>x.id!==c.id); setConversations(next); persistence.current = persistence.current.then(()=>saveConversations(user,next)).catch(()=>setError('Could not save deletion.')); if (current?.id===c.id) setCurrent(next[0]||fresh()); }}><Trash2 size={13}/></button></div>) : <p className="history-empty">Your next good idea<br/>starts here.</p>}</div>
      <div className="sidebar-bottom"><div className="private-note"><span className="tiny-mark">↳</span><div>Your workspace. Your models.<small>Encrypted on this browser.</small></div></div><button className="settings-link" onClick={() => setSettings(true)}><span className="avatar">Y</span><div>{user.username}<small>{credentials.length} providers connected</small></div><Settings2 size={17}/></button></div>
    </div></Sidebar>
    <main className="main-shell"><header className="topbar"><div className="breadcrumb"><SidebarTrigger/><span>Personal workspace</span><ChevronRight size={14}/><strong>{current?.messages.length ? current.title : 'New conversation'}</strong></div><div className="top-actions"><button className="icon-button" onClick={toggleTheme} aria-label={user.theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{user.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-button" disabled={busy||uploading} onClick={signOut} aria-label="Sign out"><LogOut size={18}/></button><button onClick={()=>setSettings(true)} className="connect-button"><span className={connected ? 'connection-dot connected' : 'connection-dot'}/>{connected ? 'Models & keys' : 'Connect models'}</button><button className="icon-button" onClick={()=>setPanel(!panel)} aria-label="Toggle workspace files">{panel ? <PanelRightClose size={19}/> : <PanelRightOpen size={19}/>}</button></div></header>
    <div className="work-area"><section className="conversation">
      <div className="modebar"><Tabs value={mode} onValueChange={v=>!busy&&setMode(v)}><TabsList><TabsTrigger disabled={busy} value="chat"><MessageSquare/>Chat</TabsTrigger><TabsTrigger disabled={busy} value="work"><Sparkles/>Work</TabsTrigger></TabsList></Tabs><span className="mode-description">{mode === 'work' ? 'A little less talking. A lot more doing.' : 'Think it through, together.'}</span></div>
      <div className="conversation-scroll">{!visible.length ? <div className="welcome"><div className="eyebrow"><span/> A SPACE FOR YOUR NEXT BIG THING</div><h1>Let’s get to <em>work.</em></h1><p>Bring your ideas, files, and favorite models.<br/>Leave with something finished.</p><div className="starter-grid">{starters.map(s=><button key={s.title} onClick={()=>{ setMode('work'); setInput(s.prompt); document.getElementById('composer')?.focus(); }} className="starter"><span className={`starter-icon ${s.color}`}><s.icon size={21}/></span><ArrowUpRight className="starter-arrow" size={17}/><strong>{s.title}</strong><span>{s.text}</span></button>)}</div><div className="provider-strip"><span>ONE WORKSPACE, MANY MINDS</span><div>OpenAI <i/> Anthropic <i/> Gemini <i/> OpenRouter</div></div></div> : <div className="messages">{visible.map((m,i)=><article key={i} className={`message ${m.role}`}><div className={`message-avatar ${m.role}`}>{m.role==='user'?'Y':<Sparkles size={17}/>}</div><div className="message-body"><div className="message-author">{m.role==='user'?'You':'Workbench'}<span>{m.role==='assistant'?m.model:''}</span></div><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content.split('\n\n<file name=')[0]}</ReactMarkdown></div>{m.images?.length ? <div className="message-images">{m.images.map((src,j)=><img key={j} src={src} alt="Attached image"/>)}</div>:null}{m.toolCalls?.map(t=><details className="tool-event" key={t.id}><summary><Wrench size={13}/>{t.name.replaceAll('_',' ')}<ChevronRight size={12}/></summary><pre>{current?.messages.find(x=>x.toolCallId===t.id)?.content.slice(0,2000) || 'Running…'}</pre></details>)}{m.role==='assistant'&&m.content&&<button className="export-response" onClick={()=>exportWord(m)}><Download size={13}/> Export as Word</button>}</div></article>)}{busy&&<div className="working-status" role="status"><Loader2 size={16} className="spin"/>{status}…</div>}<div ref={bottom}/></div>}</div>
      <div className="composer-wrap">{error&&<div className="error-message" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}<div className="composer" onDragOver={e=>e.preventDefault()} onDrop={e=>{ e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      {files.length>0&&<div className="attachment-chips">{files.slice(-4).map(a=><button key={a.id} onClick={()=>setPreview(a)}><FileText size={12}/>{a.name}</button>)}{files.length>4&&<span>+{files.length-4} files</span>}</div>}
      <textarea id="composer" value={input} onChange={e=>setInput(e.target.value)} placeholder={mode==='work'?'What do you want to get done?':'Ask anything, or think out loud…'} disabled={!ready} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
      <div className="composer-toolbar"><div className="composer-tools"><button className="icon-button" disabled={busy||uploading} onClick={()=>upload.current?.click()} aria-label="Upload files">{uploading?<Loader2 className="spin" size={19}/>:<Plus size={21}/>}</button><span className="toolbar-divider"/>{enabledModels.length?<Select value={`${provider}:${models[provider]}`} onValueChange={value=>{const [p,...parts]=value.split(':');setProvider(p as Provider);setModels({...models,[p]:parts.join(':')});}} disabled={busy}><SelectTrigger className="model-select" aria-label="Active model"><SelectValue/></SelectTrigger><SelectContent>{enabledModels.map(m=><SelectItem key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>{m.name} · {providers[m.provider].name}</SelectItem>)}</SelectContent></Select>:<button className="model-select" onClick={()=>setSettings(true)}>Enable a model</button>}{mode==='work'&&<span className="tools-enabled"><Wrench size={13}/> 5 tools</span>}</div><button className={`send-button ${busy?'stop':''}`} aria-label={busy?'Stop generation':'Send message'} disabled={!busy&&(!input.trim()||uploading||!ready)} onClick={()=>busy?controller.current?.abort():send()}>{busy?<Square size={15}/>:<ArrowUp size={19}/>}</button></div>
      </div><div className="composer-hint"><span><Paperclip size={12}/> DOCX, PDF, images, CSV & code</span><span>Enter to send · Shift + Enter for a new line</span></div></div>
    </section>
    {panel&&<aside className="files-panel"><div className="panel-title"><div><FolderOpen size={18}/><h2>Workspace</h2></div><span>{files.length}</span></div><p className="panel-description">Everything this conversation works with.</p><button className="upload-area" disabled={busy||uploading} onClick={()=>upload.current?.click()}><span><Plus size={20}/></span><strong>{uploading?'Reading files…':'Add your files'}</strong><small>Documents, images, data & more<br/>Up to 10 MB each · Images 2 MB</small></button>
      <div className="file-section-label">FILES <span>{files.filter(a=>!a.generated).length}</span></div>{files.filter(a=>!a.generated).map(a=><FileRow key={a.id} asset={a} onPreview={()=>setPreview(a)}/>)}{!files.some(a=>!a.generated)&&<p className="empty-files">A little context goes a long way.<br/>Add a file to get started.</p>}
      <div className="file-section-label outputs-label">CREATED HERE <span>{files.filter(a=>a.generated).length}</span></div>{files.filter(a=>a.generated).map(a=><FileRow key={a.id} asset={a} onPreview={()=>setPreview(a)}/>)}{!files.some(a=>a.generated)&&<div className="output-empty"><FileText size={26}/><p>From conversation<br/>to something you can use.</p><small>Finished files will appear here.</small></div>}
      <div className="toolkit"><div><Wrench size={15}/><strong>Your toolkit</strong></div><p>Read documents · Create Word files<br/>Analyze CSVs · Calculate · Write code</p><span>Available in Work mode</span></div></aside>}
    </div></main>
    <input ref={upload} type="file" className="sr-only" multiple accept=".docx,.pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log,.png,.jpg,.jpeg,.webp,.gif" onChange={e=>addFiles(e.target.files)}/>
    <Dialog open={settings} onOpenChange={open=>{setSettings(open);if(!open){setCurrentPassword('');setNewPassword('');}}}><DialogContent className="settings-dialog"><DialogTitle>Models & keys</DialogTitle><DialogDescription>Choose your models. Save each provider key once to your account.</DialogDescription><ModelSettings user={user} credentials={credentials} onUpdate={refreshCredentials}/><details className="password-settings"><summary>Change password</summary><label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label>New password<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="At least 12 characters"/></label><button className="primary-button" disabled={changingPassword||!currentPassword||newPassword.length<12} onClick={changePassword}>Change password & sign out</button><p className="settings-note">This signs you out on all devices.</p></details></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open=>!open&&setPreview(null)}><DialogContent className="preview-dialog"><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{preview?`${(preview.size/1024).toFixed(1)} KB · ${preview.generated?'Created in Workbench':'Uploaded file'}`:''}</DialogDescription>{preview?.data?<img className="preview-image" src={preview.data} alt={preview.name}/>:<pre className="file-preview">{preview?.text || 'No text preview available.'}</pre>}<div className="preview-actions"><button className="primary-button" onClick={()=>preview&&downloadAsset(preview)}><Download size={16}/> Download</button><button disabled={busy||uploading} className="delete-file" onClick={()=>{if(current&&preview){save({...current,assets:current.assets.filter(a=>a.id!==preview.id)});setPreview(null);}}}><Trash2 size={16}/> Remove from workspace</button></div></DialogContent></Dialog>
  </SidebarProvider>;
}
function FileRow({asset,onPreview}:{asset:Asset;onPreview:()=>void}) { return <div className="file-row"><button onClick={onPreview}><span className={asset.generated?'file-icon generated':'file-icon'}>{asset.data?<ImageIcon size={18}/>:<FileText size={18}/>}</span><div><strong>{asset.name}</strong><small>{(asset.size/1024).toFixed(1)} KB{asset.generated?' · Ready to download':''}</small></div></button><button className="file-download" onClick={()=>downloadAsset(asset)} aria-label={`Download ${asset.name}`}><Download size={15}/></button></div>; }
