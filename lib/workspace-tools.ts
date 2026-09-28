import type { Asset, ToolCall } from './contracts';
import Papa from 'papaparse';
export function calculate(expression: string): number {
  if (expression.length > 500 || /[^\d.\s+*/()-]/.test(expression)) throw new Error('Use only numbers, parentheses, and + - * /.');
  const tokens = expression.match(/\d*\.?\d+|[()+*/-]/g) || []; let i = 0;
  function factor(): number { if (tokens[i] === '-') { i++; return -factor(); } if (tokens[i] === '+') { i++; return factor(); } if (tokens[i] === '(') { i++; const n = sum(); if (tokens[i++] !== ')') throw new Error('Missing closing parenthesis'); return n; } const token = tokens[i++]; if (!token || !/^\d*\.?\d+$/.test(token)) throw new Error('Invalid expression'); return Number(token); }
  function product(): number { let n = factor(); while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++]; const b = factor(); n = op === '*' ? n * b : n / b; } return n; }
  function sum(): number { let n = product(); while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++]; const b = product(); n = op === '+' ? n + b : n - b; } return n; }
  const result = sum(); if (i !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid expression or division by zero'); return result;
}
export async function makeDocument(content: string): Promise<Blob> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
  const paragraphs = content.split('\n').map(line => {
    const h = line.match(/^(#{1,3})\s+(.*)/); const bullet = /^[-*]\s+/.test(line);
    const text = h ? h[2] : line.replace(/^[-*]\s+/, '');
    const runs = text.split(/(\*\*.*?\*\*)/g).map(part => new TextRun({ text: part.replace(/^\*\*|\*\*$/g, ''), bold: part.startsWith('**') }));
    return new Paragraph({ children: runs, ...(h ? { heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][h[1].length-1] } : {}), ...(bullet ? { bullet: { level: 0 } } : {}), spacing: { after: 160 } });
  });
  return Packer.toBlob(new Document({ creator: 'Workbench', styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, sections: [{ children: paragraphs }] }));
}
export async function readUpload(file: File): Promise<Asset> {
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: maximum file size is 10 MB.`);
  const asset: Asset = { id: crypto.randomUUID(), name: file.name, type: file.type || 'text/plain', size: file.size, blob: file };
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    if (file.size > 2 * 1024 * 1024) throw new Error('Images must be below 2 MB. Resize the image first.');
    asset.data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file); });
  } else if (ext === 'docx') {
    const mammoth = await import('mammoth'); const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); asset.text = value;
  } else if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }); const doc = await loading.promise;
    try { if (doc.numPages > 100) throw new Error('PDFs can contain up to 100 pages.'); const pages: string[] = []; for (let p = 1; p <= doc.numPages; p++) { const page = await doc.getPage(p); const text = await page.getTextContent(); pages.push(text.items.map(item => 'str' in item ? item.str : '').join(' ')); } asset.text = pages.join('\n\n'); if (!asset.text.trim()) throw new Error('This PDF contains no readable text. Upload page images for visual analysis.'); } finally { await loading.destroy(); }
  } else if (['txt','md','csv','json','js','ts','tsx','jsx','py','html','css','xml','yaml','yml','log'].includes(ext || '')) { asset.text = await file.text(); }
  else throw new Error(`${file.name}: use DOCX, PDF, text, CSV, code, or PNG/JPEG/WebP/GIF. Legacy .doc files must be saved as .docx.`);
  if (asset.text && asset.text.length > 100000) throw new Error(`${file.name} exceeds 100,000 characters. Split it into smaller files.`);
  return asset;
}
export async function executeTool(call: ToolCall, assets: Asset[]): Promise<{ result: string; asset?: Asset }> {
  const args = JSON.parse(call.arguments);
  if (call.name === 'calculate') return { result: String(calculate(String(args.expression))) };
  if (call.name === 'read_file' || call.name === 'analyze_csv') {
    const file = assets.find(a => a.id === args.id); if (!file) throw new Error('File not found');
    if (file.text === undefined) throw new Error('Image contents are supplied directly to the model.');
    if (call.name === 'read_file') return { result: file.text };
    const parsed = Papa.parse<Record<string,string>>(file.text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`);
    const columns = parsed.meta.fields || [];
    const numeric = Object.fromEntries(columns.map(col => { const values = parsed.data.map(r => r[col]?.trim()).filter(v => v !== undefined && v !== ''); if (!values.length || values.some(v => !Number.isFinite(Number(v)))) return [col, null]; const nums = values.map(Number); return [col, { count: nums.length, sum: nums.reduce((a,b) => a+b,0), mean: nums.reduce((a,b) => a+b,0)/nums.length, min: Math.min(...nums), max: Math.max(...nums) }]; }).filter(([,v]) => v !== null));
    return { result: JSON.stringify({ rows: parsed.data.length, columns, sample: parsed.data.slice(0,8), numeric }) };
  }
  if (call.name === 'create_document' || call.name === 'write_file') {
    if (typeof args.content !== 'string' || args.content.length > 100000 || typeof args.filename !== 'string') throw new Error('Provide filename and content, up to 100,000 characters.');
    let name = args.filename.replace(/[^\w. -]/g, '_').slice(0,100) || 'document';
    const isDoc = call.name === 'create_document'; if (isDoc && !name.endsWith('.docx')) name += '.docx';
    const blob = isDoc ? await makeDocument(args.content) : new Blob([args.content], { type: 'text/plain;charset=utf-8' });
    const asset: Asset = { id: crypto.randomUUID(), name, blob, size: blob.size, type: blob.type, text: args.content, generated: true };
    return { result: `Created ${name}. The file is available in the workspace for download. File ID: ${asset.id}`, asset };
  }
  throw new Error('Unknown tool');
}
export function downloadAsset(asset: Asset) { const url = URL.createObjectURL(asset.blob); const a = document.createElement('a'); a.href = url; a.download = asset.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
