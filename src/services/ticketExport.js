import {ticketModel} from '../domain/mobileReceipt/ticket.mjs';
import {logoDataUri} from '../domain/mobileReceipt/logo.mjs';
export async function ticketPng(receipt){
 const model=ticketModel(receipt),canvas=document.createElement('canvas');canvas.width=1080;
 const wrap=text=>{const result=[];let line='';for(const word of text.split(/\s+/)){if((line+' '+word).trim().length>58&&line){result.push(line);line=word;}else line=(line+' '+word).trim();}if(line)result.push(line);return result;};
 const rows=model.items.map(item=>({item,lines:wrap(item.name)}));canvas.height=650+rows.reduce((n,r)=>n+r.lines.length*30+65,0);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 const logo=new Image();logo.src=logoDataUri;await logo.decode();ctx.drawImage(logo,320,20,440,180);ctx.textAlign='center';ctx.fillStyle='#2F466E';ctx.font='bold 30px sans-serif';ctx.fillText(model.brand.name,540,240);ctx.font='22px sans-serif';ctx.fillText(model.brand.street,540,280);ctx.fillText(model.brand.locality,540,315);ctx.fillText('Teléfono y WhatsApp: '+model.brand.phone,540,350);ctx.textAlign='left';ctx.fillText(model.folio+' · '+model.date+' '+model.time,50,410);
 let y=470;for(const {item:i,lines} of rows){ctx.font='bold 25px sans-serif';for(const t of lines){ctx.fillText(t,50,y);y+=30;}ctx.font='22px sans-serif';ctx.fillText(i.quantity+' · '+i.price,50,y+10);ctx.textAlign='right';ctx.fillText(i.amount,1030,y+10);ctx.textAlign='left';y+=65;}ctx.font='bold 42px sans-serif';ctx.fillText('Total MXN '+model.total,50,y+25);ctx.font='23px sans-serif';ctx.fillText(model.brand.thanks,50,y+75);ctx.font='18px sans-serif';ctx.fillText(model.disclaimer,50,y+110);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo exportar PNG.')),'image/png'));
}
export async function downloadTicketPng(receipt){const blob=await ticketPng(receipt),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='FullClean-'+receipt.folio+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
