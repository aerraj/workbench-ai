'use client';
import { useState } from 'react';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check } from 'lucide-react';
export function Markdown({content}:{content:string}){return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex,rehypeHighlight]} components={{pre:({children})=><CodeBlock>{children}</CodeBlock>}}>{content}</ReactMarkdown></div>}
function CodeBlock({children}:{children:React.ReactNode}){const [copied,setCopied]=useState(false);const className=(children as any)?.props?.className||'';const lang=className.match(/language-([\w+-]+)/)?.[1]||'code';return <div className="code-block"><div className="code-head"><span>{lang}</span><button type="button" onClick={async e=>{await navigator.clipboard.writeText(e.currentTarget.closest('.code-block')?.querySelector('code')?.textContent||'');setCopied(true);setTimeout(()=>setCopied(false),1800);}} aria-label="Copy code">{copied?<Check size={14}/>:<Copy size={14}/>} {copied?'Copied':'Copy'}</button></div><pre>{children}</pre></div>}
