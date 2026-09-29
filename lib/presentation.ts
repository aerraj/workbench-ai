import { z } from 'zod';
import type { Asset } from './contracts';
import { encode64 } from './crypto';

export const presentationSchema=z.object({
 filename:z.string().min(1).max(100),
 title:z.string().min(1).max(160),
 subtitle:z.string().max(240).optional(),
 slides:z.array(z.object({
  title:z.string().min(1).max(120),
  bullets:z.array(z.string().min(1).max(180)).max(6).optional(),
  body:z.string().max(700).optional(),
  imageId:z.string().uuid().optional(),
  notes:z.string().max(2000).optional(),
 })).min(1).max(20),
});
export type PresentationSpec=z.infer<typeof presentationSchema>;
export const presentationOutline=(spec:PresentationSpec)=>[
 `# ${spec.title}`,
 spec.subtitle||'',
 ...spec.slides.flatMap((slide,index)=>[
  `## ${index+1}. ${slide.title}`,
  ...(slide.bullets||[]).map(b=>`- ${b}`),
  slide.body||'',
  slide.imageId?`Image file: ${slide.imageId}`:'',
  slide.notes?`Notes: ${slide.notes}`:'',
 ]),
].filter(Boolean).join('\n\n');

export async function makePresentation(input:unknown,assets:Asset[]):Promise<{blob:Blob;outline:string;filename:string}>{
 const spec=presentationSchema.parse(input);
 const {default:PptxGenJS}=await import('pptxgenjs');
 const pptx=new PptxGenJS();
 pptx.layout='LAYOUT_WIDE';
 pptx.author='Workbench';
 pptx.title=spec.title;
 pptx.subject='Created with Workbench';
 pptx.theme={headFontFace:'Aptos Display',bodyFontFace:'Aptos'};
 const dark='24332F',accent='C8643B',paper='FAF9F7',ink='242522',muted='676D68';
 const cover=pptx.addSlide();cover.background={color:dark};
 cover.addShape(pptx.ShapeType.rect,{x:0.72,y:1.1,w:0.13,h:4.9,line:{color:accent},fill:{color:accent}});
 cover.addText(spec.title,{x:1.18,y:1.6,w:10.9,h:2.4,fontFace:'Aptos Display',fontSize:38,bold:true,color:'FFFFFF',breakLine:false,margin:0,fit:'shrink'});
 if(spec.subtitle)cover.addText(spec.subtitle,{x:1.2,y:4.45,w:10.4,h:1.15,fontSize:19,color:'DFE8E1',margin:0,fit:'shrink'});
 cover.addText('WORKBENCH',{x:1.2,y:6.75,w:3,h:0.3,fontSize:10,bold:true,charSpacing:2,color:'B9C6BD',margin:0});
 for(let index=0;index<spec.slides.length;index++){
  const item=spec.slides[index],slide=pptx.addSlide();slide.background={color:paper};
  slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:0.12,line:{color:accent},fill:{color:accent}});
  slide.addText(String(index+1).padStart(2,'0'),{x:0.72,y:0.48,w:0.55,h:0.36,fontSize:12,bold:true,color:accent,margin:0});
  slide.addText(item.title,{x:1.38,y:0.38,w:11.2,h:0.86,fontFace:'Aptos Display',fontSize:29,bold:true,color:ink,margin:0,fit:'shrink'});
  const picture=item.imageId?assets.find(a=>a.id===item.imageId):undefined;
  if(item.imageId&&!picture)throw new Error(`Image ${item.imageId} is not in this workspace.`);
  if(picture&&!['image/png','image/jpeg'].includes(picture.type))throw new Error('Presentation images must be PNG or JPEG.');
  const textWidth=picture?5.65:11.75;
  const bullets=item.bullets||[];
  const maxBodyHeight=picture?3.45:4.25;
  if(item.body)slide.addText(item.body,{x:0.82,y:1.54,w:textWidth,h:Math.min(maxBodyHeight,Math.max(1.0,item.body.length/110)),fontSize:picture?18:20,color:ink,margin:0,breakLine:false,fit:'shrink',valign:'top'});
  const bulletStart=item.body?Math.min(4.0,1.65+Math.max(1.0,item.body.length/110)):1.65;
  if(bullets.length)slide.addText(bullets.map(text=>({text,options:{bullet:{indent:18},breakLine:true}})),{x:0.82,y:bulletStart,w:textWidth,h:Math.max(1,6.05-bulletStart),fontSize:bullets.length>5?16:19,color:ink,paraSpaceAfter:14,margin:0,breakLine:false,fit:'shrink',valign:'top'});
  if(picture){const bytes=new Uint8Array(await picture.blob.arrayBuffer());slide.addImage({data:`${picture.type};base64,${encode64(bytes)}`,x:7.2,y:1.58,w:5.28,h:4.63,sizing:{type:'contain',w:5.28,h:4.63}});}
  slide.addShape(pptx.ShapeType.line,{x:0.78,y:6.72,w:11.75,h:0,line:{color:'DEDCD6',width:1}});
  slide.addText('WORKBENCH',{x:0.8,y:6.91,w:2.4,h:0.24,fontSize:9,bold:true,charSpacing:1.2,color:muted,margin:0});
  slide.addText(`${index+1} / ${spec.slides.length}`,{x:11.4,y:6.91,w:1.1,h:0.24,fontSize:9,color:muted,align:'right',margin:0});
  if(item.notes)slide.addNotes(item.notes);
 }
 const output=await pptx.write({outputType:'blob',compression:true});
 const blob=new Blob([output as BlobPart],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
 if(blob.size>10*1024*1024)throw new Error('Presentation exceeds the 10 MB workspace limit. Use fewer or smaller images.');
 const filename=(spec.filename.replace(/[^\w. -]/g,'_').slice(0,95)||'presentation').replace(/\.pptx$/i,'')+'.pptx';
 return {blob,outline:presentationOutline(spec),filename};
}
