'use client';
import { useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, ArrowUpRight, Plus, Paperclip, MessageSquare, FolderOpen, Settings2, FileText, Download, X, Sparkles, Square, ChevronRight, Wrench, Table2, Code2, ImageIcon, PanelRightClose, PanelRightOpen, Loader2, Check, Trash2 } from 'lucide-react';
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
export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<Conversation | null>(null);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('work');
  const [provider, setProvider] = useState<Provider>('openai');
  const [models, setModels] = useState<Record<Provider,string>>({ openai: providers.openai.model, anthropic: providers.anthropic.model, gemini: providers.gemini.model, openrouter: providers.openrouter.model });
  const [keys, setKeys] = useState<Partial<Record<Provider,string>>>({});
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
  useEffect(() => { if (window.innerWidth < 1000) setPanel(false); get<Conversation[]>('workbench-conversations').then(saved => { const list = saved || []; setConversations(list); setCurrent(list[0] || fresh()); setReady(true); }).catch(() => { setCurrent(fresh()); setReady(true); setError('Browser storage is unavailable. Chats will not persist.'); }); const p = localStorage.getItem('workbench-preferences'); if (p) { try { const v = JSON.parse(p); if (v.provider in providers) setProvider(v.provider); if (v.models) setModels(v.models); } catch {} } }, []);
  useEffect(() => { if (ready) localStorage.setItem('workbench-preferences', JSON.stringify({ provider, models })); }, [provider, models, ready]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [current?.messages.length, status]);
  function save(c: Conversation) {
    setCurrent(c); setConversations(old => { const next = [c, ...old.filter(x => x.id !== c.id)]; persistence.current = persistence.current.then(() => set('workbench-conversations', next)).catch(() => { setError('Could not save to browser storage. Download important files before closing.'); }); return next; });
  }
  async function addFiles(files: FileList | null) {
    if (!files || !current || busy || uploading) return; setUploading(true); setError('');
    const assets = [...current.assets];
    for (const file of Array.from(files)) { try { if (assets.length >= 30) throw new Error('A conversation can contain up to 30 files.'); if (assets.reduce((n,a) => n+a.size,0) + file.size > 50*1024*1024) throw new Error('Workspace file limit is 50 MB per conversation.'); if (/^image\//.test(file.type) && assets.filter(a=>a.data).length >= 4) throw new Error('Use up to 4 images per conversation. Remove an image before adding another.'); assets.push(await readUpload(file)); } catch(e) { setError(e instanceof Error ? e.message : 'Could not read file'); } }
    save({ ...current, assets }); setUploading(false); if (upload.current) upload.current.value = '';
  }
  async function send() {
    if (!input.trim() || !current || busy || uploading) return;
    if (!keys[provider]) { setSettings(true); setError('Add an API key to start this conversation.'); return; }
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
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify({ provider, model: models[provider], key: keys[provider], work: mode === 'work', messages: working.messages, files: working.assets.map(({id,name,type,size}) => ({ id,name,type,size })) }) });
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
      <div className="history">{conversations.length ? conversations.map(c => <div className={`history-row ${c.id === current?.id ? 'selected' : ''}`} key={c.id}><button disabled={busy || uploading} onClick={() => { setCurrent(c); setError(''); setInput(''); }}><MessageSquare size={14}/><span>{c.title}</span></button><button aria-label={`Delete ${c.title}`} disabled={busy || uploading} onClick={() => { if (!confirm('Delete this conversation and its stored files?')) return; const next = conversations.filter(x=>x.id!==c.id); setConversations(next); persistence.current = persistence.current.then(()=>set('workbench-conversations',next)).catch(()=>setError('Could not save deletion.')); if (current?.id===c.id) setCurrent(next[0]||fresh()); }}><Trash2 size={13}/></button></div>) : <p className="history-empty">Your next good idea<br/>starts here.</p>}</div>
      <div className="sidebar-bottom"><div className="private-note"><span className="tiny-mark">↳</span><div>Your workspace. Your models.<small>Saved on this browser.</small></div></div><button className="settings-link" onClick={() => setSettings(true)}><span className="avatar">Y</span><div>Personal workspace<small>{Object.values(keys).filter(Boolean).length} providers connected</small></div><Settings2 size={17}/></button></div>
    </div></Sidebar>
    <main className="main-shell"><header className="topbar"><div className="breadcrumb"><SidebarTrigger/><span>Personal workspace</span><ChevronRight size={14}/><strong>{current?.messages.length ? current.title : 'New conversation'}</strong></div><div className="top-actions"><button onClick={()=>setSettings(true)} className="connect-button"><span className={keys[provider] ? 'connection-dot connected' : 'connection-dot'}/>{keys[provider] ? providers[provider].name : 'Connect models'}</button><button className="icon-button" onClick={()=>setPanel(!panel)} aria-label="Toggle workspace files">{panel ? <PanelRightClose size={19}/> : <PanelRightOpen size={19}/>}</button></div></header>
    <div className="work-area"><section className="conversation">
      <div className="modebar"><Tabs value={mode} onValueChange={v=>!busy&&setMode(v)}><TabsList><TabsTrigger disabled={busy} value="chat"><MessageSquare/>Chat</TabsTrigger><TabsTrigger disabled={busy} value="work"><Sparkles/>Work</TabsTrigger></TabsList></Tabs><span className="mode-description">{mode === 'work' ? 'A little less talking. A lot more doing.' : 'Think it through, together.'}</span></div>
      <div className="conversation-scroll">{!visible.length ? <div className="welcome"><div className="eyebrow"><span/> A SPACE FOR YOUR NEXT BIG THING</div><h1>Let’s get to <em>work.</em></h1><p>Bring your ideas, files, and favorite models.<br/>Leave with something finished.</p><div className="starter-grid">{starters.map(s=><button key={s.title} onClick={()=>{ setMode('work'); setInput(s.prompt); document.getElementById('composer')?.focus(); }} className="starter"><span className={`starter-icon ${s.color}`}><s.icon size={21}/></span><ArrowUpRight className="starter-arrow" size={17}/><strong>{s.title}</strong><span>{s.text}</span></button>)}</div><div className="provider-strip"><span>ONE WORKSPACE, MANY MINDS</span><div>OpenAI <i/> Anthropic <i/> Gemini <i/> OpenRouter</div></div></div> : <div className="messages">{visible.map((m,i)=><article key={i} className={`message ${m.role}`}><div className={`message-avatar ${m.role}`}>{m.role==='user'?'Y':<Sparkles size={17}/>}</div><div className="message-body"><div className="message-author">{m.role==='user'?'You':'Workbench'}<span>{m.role==='assistant'?m.model:''}</span></div><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content.split('\n\n<file name=')[0]}</ReactMarkdown></div>{m.images?.length ? <div className="message-images">{m.images.map((src,j)=><img key={j} src={src} alt="Attached image"/>)}</div>:null}{m.toolCalls?.map(t=><details className="tool-event" key={t.id}><summary><Wrench size={13}/>{t.name.replaceAll('_',' ')}<ChevronRight size={12}/></summary><pre>{current?.messages.find(x=>x.toolCallId===t.id)?.content.slice(0,2000) || 'Running…'}</pre></details>)}{m.role==='assistant'&&m.content&&<button className="export-response" onClick={()=>exportWord(m)}><Download size={13}/> Export as Word</button>}</div></article>)}{busy&&<div className="working-status" role="status"><Loader2 size={16} className="spin"/>{status}…</div>}<div ref={bottom}/></div>}</div>
      <div className="composer-wrap">{error&&<div className="error-message" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}<div className="composer" onDragOver={e=>e.preventDefault()} onDrop={e=>{ e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      {files.length>0&&<div className="attachment-chips">{files.slice(-4).map(a=><button key={a.id} onClick={()=>setPreview(a)}><FileText size={12}/>{a.name}</button>)}{files.length>4&&<span>+{files.length-4} files</span>}</div>}
      <textarea id="composer" value={input} onChange={e=>setInput(e.target.value)} placeholder={mode==='work'?'What do you want to get done?':'Ask anything, or think out loud…'} disabled={!ready} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
      <div className="composer-toolbar"><div className="composer-tools"><button className="icon-button" disabled={busy||uploading} onClick={()=>upload.current?.click()} aria-label="Upload files">{uploading?<Loader2 className="spin" size={19}/>:<Plus size={21}/>}</button><span className="toolbar-divider"/><Select value={provider} onValueChange={p=>setProvider(p as Provider)} disabled={busy}><SelectTrigger className="model-select"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(providers).map(([id,p])=><SelectItem key={id} value={id}>{p.name}</SelectItem>)}</SelectContent></Select>{mode==='work'&&<span className="tools-enabled"><Wrench size={13}/> 5 tools</span>}</div><button className={`send-button ${busy?'stop':''}`} aria-label={busy?'Stop generation':'Send message'} disabled={!busy&&(!input.trim()||uploading||!ready)} onClick={()=>busy?controller.current?.abort():send()}>{busy?<Square size={15}/>:<ArrowUp size={19}/>}</button></div>
      </div><div className="composer-hint"><span><Paperclip size={12}/> DOCX, PDF, images, CSV & code</span><span>Enter to send · Shift + Enter for a new line</span></div></div>
    </section>
    {panel&&<aside className="files-panel"><div className="panel-title"><div><FolderOpen size={18}/><h2>Workspace</h2></div><span>{files.length}</span></div><p className="panel-description">Everything this conversation works with.</p><button className="upload-area" disabled={busy||uploading} onClick={()=>upload.current?.click()}><span><Plus size={20}/></span><strong>{uploading?'Reading files…':'Add your files'}</strong><small>Documents, images, data & more<br/>Up to 10 MB each · Images 2 MB</small></button>
      <div className="file-section-label">FILES <span>{files.filter(a=>!a.generated).length}</span></div>{files.filter(a=>!a.generated).map(a=><FileRow key={a.id} asset={a} onPreview={()=>setPreview(a)}/>)}{!files.some(a=>!a.generated)&&<p className="empty-files">A little context goes a long way.<br/>Add a file to get started.</p>}
      <div className="file-section-label outputs-label">CREATED HERE <span>{files.filter(a=>a.generated).length}</span></div>{files.filter(a=>a.generated).map(a=><FileRow key={a.id} asset={a} onPreview={()=>setPreview(a)}/>)}{!files.some(a=>a.generated)&&<div className="output-empty"><FileText size={26}/><p>From conversation<br/>to something you can use.</p><small>Finished files will appear here.</small></div>}
      <div className="toolkit"><div><Wrench size={15}/><strong>Your toolkit</strong></div><p>Read documents · Create Word files<br/>Analyze CSVs · Calculate · Write code</p><span>Available in Work mode</span></div></aside>}
    </div></main>
    <input ref={upload} type="file" className="sr-only" multiple accept=".docx,.pdf,.txt,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.html,.css,.xml,.yaml,.yml,.log,.png,.jpg,.jpeg,.webp,.gif" onChange={e=>addFiles(e.target.files)}/>
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="settings-dialog"><DialogTitle>Connect your models</DialogTitle><DialogDescription>Use your own API keys. Keys stay in memory for this tab and are sent through this app’s server only to the selected provider. They are never saved.</DialogDescription><div className="provider-settings">{Object.entries(providers).map(([id,p])=><div className="provider-setting" key={id}><div className="provider-heading"><span style={{background:p.color}}/>{p.name}{keys[id as Provider]&&<Check size={15}/>}</div><label>API key<input type="password" autoComplete="off" placeholder="Paste your API key" value={keys[id as Provider]||''} onChange={e=>setKeys({...keys,[id]:e.target.value.trim()})}/></label><label>Model ID<input value={models[id as Provider]} onChange={e=>setModels({...models,[id]:e.target.value})}/></label></div>)}</div><p className="settings-note">Model availability depends on your provider account. You can enter any compatible model ID. Provider usage is billed to your API account. Chats and files are stored on this browser, with no cross-device sync.</p><button className="primary-button" onClick={()=>{setSettings(false);setError('');}}>Done <ArrowUpRight size={17}/></button></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open=>!open&&setPreview(null)}><DialogContent className="preview-dialog"><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{preview?`${(preview.size/1024).toFixed(1)} KB · ${preview.generated?'Created in Workbench':'Uploaded file'}`:''}</DialogDescription>{preview?.data?<img className="preview-image" src={preview.data} alt={preview.name}/>:<pre className="file-preview">{preview?.text || 'No text preview available.'}</pre>}<div className="preview-actions"><button className="primary-button" onClick={()=>preview&&downloadAsset(preview)}><Download size={16}/> Download</button><button disabled={busy||uploading} className="delete-file" onClick={()=>{if(current&&preview){save({...current,assets:current.assets.filter(a=>a.id!==preview.id)});setPreview(null);}}}><Trash2 size={16}/> Remove from workspace</button></div></DialogContent></Dialog>
  </SidebarProvider>;
}
function FileRow({asset,onPreview}:{asset:Asset;onPreview:()=>void}) { return <div className="file-row"><button onClick={onPreview}><span className={asset.generated?'file-icon generated':'file-icon'}>{asset.data?<ImageIcon size={18}/>:<FileText size={18}/>}</span><div><strong>{asset.name}</strong><small>{(asset.size/1024).toFixed(1)} KB{asset.generated?' · Ready to download':''}</small></div></button><button className="file-download" onClick={()=>downloadAsset(asset)} aria-label={`Download ${asset.name}`}><Download size={15}/></button></div>; }
