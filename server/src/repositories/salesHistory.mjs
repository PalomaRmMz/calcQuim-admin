import {createHash} from 'node:crypto';
import {ApiError} from '../services/commands.mjs';
import {saleCapturedAt} from '../../../src/services/saleAuditView.mjs';
const fail=(code,message,status=400)=>{throw new ApiError(status,code,message);};
const text=v=>typeof v==='string'&&v.trim()?v:null;
const decimal=v=>typeof v==='number'&&Number.isFinite(v)?String(v):typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?v:null;
const day=v=>typeof v==='string'&&/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function decode(v){try{if(typeof v!=='string'||v.length>2048||!/^[\w-]+$/.test(v))throw Error();const o=JSON.parse(Buffer.from(v,'base64url').toString());if(!o||Array.isArray(o)||typeof o!=='object')throw Error();return o;}catch{fail('INVALID_CURSOR','Paginación inválida. Vuelve a consultar.');}}
function integer(v,min,max,fallback){if(v===undefined)return fallback;if(typeof v!=='string'||!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)fail('INVALID_LIMIT','Límite inválido.');return Number(v);}
function scalarQuery(q,keys){if(!q||Object.keys(q).some(k=>!keys.includes(k))||Object.values(q).some(v=>typeof v!=='string'))fail('INVALID_FILTER','Parámetros de consulta inválidos.');}
export function historyFilters(q={}){
 scalarQuery(q,['folio','from','to','limit','cursor']);
 const folio=(q.folio??'').trim();if(folio.length>80||/[\x00-\x1f]/.test(folio))fail('INVALID_FOLIO','Folio inválido (máximo 80 caracteres).');
 const from=q.from||null,to=q.to||null;
 if((from&&!day(from))||(to&&!day(to))||(from&&to&&from>to))fail('INVALID_DATE','Usa fechas reales AAAA-MM-DD y un rango válido.');
 return {folio:folio||null,from,to,limit:integer(q.limit,1,50,20),cursor:q.cursor?decode(q.cursor):null};
}
export function historyDetailFilters(q={}){scalarQuery(q,['limit','cursor','revision','generation']);if((q.revision===undefined)!==(q.generation===undefined))fail('INVALID_SNAPSHOT','Revisión y generación deben enviarse juntas.');if(q.generation!==undefined&&!/^[\w-]{1,100}$/.test(q.generation))fail('INVALID_SNAPSHOT','Generación inválida.');return {limit:integer(q.limit,1,50,25),cursor:q.cursor?decode(q.cursor):null,revision:integer(q.revision,0,Number.MAX_SAFE_INTEGER,null),generation:q.generation??null};}
async function state(c,purpose){const s=(await c.query('SELECT revision,generation,purpose FROM dataset_state WHERE singleton=true')).rows[0];if(!s||s.purpose!==purpose)fail('HISTORY_UNAVAILABLE','Historial no disponible en este conjunto de datos.',503);return {revision:Number(s.revision),generation:s.generation};}
function snapshotMatches(expected,current){if(expected.revision!==current.revision||expected.generation!==current.generation)fail('HISTORY_CHANGED','Los datos cambiaron. Actualiza el listado para consultar una versión consistente.',409);}
function header(row){
 const r=row.record||{},issues=[];
 const origin=['WEB','MOVIL'].includes(r.origin)?r.origin:null;
 const createdChannels=[...new Set((Array.isArray(r.history)?r.history:[]).filter(h=>h?.action==='created'&&['WEB','MOVIL'].includes(h.channel)).map(h=>h.channel))];
 const captureOrigin=origin&&(!createdChannels.length||createdChannels.every(c=>c===origin))?origin:!origin&&createdChannels.length===1?createdChannels[0]:null;
 if(!row.folio)issues.push('Folio no registrado');if(!text(r.payment))issues.push('Método de pago no registrado');if(!captureOrigin)issues.push('Origen de captura no verificable');
 const recordedAt=saleCapturedAt(r);if(!recordedAt)issues.push('Hora de captura no registrada');
 const activities=(row.activities||[]).filter(v=>['LIMPIEZA','JARCERIA','LAVANDERIA'].includes(v));
 const monetary=r.monetary&&['calculatedCents','roundingCents','collectedCents'].every(k=>Number.isSafeInteger(r.monetary[k]))?Object.fromEntries(['calculatedCents','roundingCents','collectedCents'].map(k=>[k,r.monetary[k]])):null;
 return {id:row.id,folio:row.folio??null,date:row.date,total:row.total,payment:text(r.payment),capturedAt:recordedAt,captureOrigin,activities,voidedAt:text(r.voidedAt),monetary,partial:issues.length>0,issues};
}
function item(row){const r=row.record||{},issues=[];const name=text(r.name);if(!name)issues.push('Nombre histórico no registrado');return {ordinal:row.ordinal,name,quantity:decimal(r.quantity)??row.quantity,unit:text(r.unit)??row.unit,price:decimal(r.price)??row.price,amount:decimal(r.amount)??row.amount,activity:['LIMPIEZA','JARCERIA','LAVANDERIA'].includes(r.activity)?r.activity:row.activity??null,presentationName:text(r.presentationSnapshot?.name)||text(r.serviceSnapshot?.name),partial:issues.length>0,issues};}
const columns=`s.id,s.folio,s.date::text,s.total::text,
 jsonb_build_object('payment',s.record->'payment','origin',s.record->'origin','createdAt',s.record->'createdAt','history',(SELECT COALESCE(jsonb_agg(h),'[]'::jsonb) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.record->'history')='array' THEN s.record->'history' ELSE '[]'::jsonb END) h WHERE h->>'action'='created'),'voidedAt',s.record->'voidedAt','monetary',s.record->'monetary') AS record,
 ARRAY(SELECT DISTINCT COALESCE(i.activity,i.record->>'activity') FROM sale_items i WHERE i.sale_id=s.id) AS activities`;
export async function readSalesHistory(c,q={},purpose='operational'){
 const f=historyFilters(q),s=await state(c,purpose),filterKey=digest({folio:f.folio,from:f.from,to:f.to,limit:f.limit}),where=[],values=[];
 const bind=v=>{values.push(v);return '$'+values.length;};
 if(f.folio)where.push('s.folio='+bind(f.folio));
 if(f.from)where.push('s.date>='+bind(f.from)+'::date');if(f.to)where.push('s.date<='+bind(f.to)+'::date');
 if(f.cursor){snapshotMatches(f.cursor,s);if(f.cursor.filterKey!==filterKey||!day(f.cursor.date)||typeof f.cursor.id!=='string'||f.cursor.id.length>150)fail('INVALID_CURSOR','El cursor no corresponde a estos filtros.');where.push(`(s.date,s.id)<(${bind(f.cursor.date)}::date,${bind(f.cursor.id)}::text)`);}
 const rows=(await c.query(`SELECT ${columns} FROM sales s ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY s.date DESC,s.id DESC LIMIT ${bind(f.limit+1)}`,values)).rows;
 const hasMore=rows.length>f.limit,selected=rows.slice(0,f.limit),last=selected.at(-1);
 return {...s,source:'postgresql',generatedAt:new Date().toISOString(),sales:selected.map(header),filters:{folio:f.folio,from:f.from,to:f.to},limit:f.limit,nextCursor:hasMore?encode({...s,filterKey,date:last.date,id:last.id}):null,order:'sale_date_desc_id_desc'};
}
export async function readOfficialSale(c,id,q={},purpose='operational'){
 if(typeof id!=='string'||!id.length||id.length>150||/[\x00-\x1f]/.test(id))fail('INVALID_SALE_ID','Identificador de venta inválido.');
 const f=historyDetailFilters(q),s=await state(c,purpose);if(f.revision!==null)snapshotMatches(f,s);
 let after=-1;if(f.cursor){snapshotMatches(f.cursor,s);if(f.cursor.id!==id||f.cursor.limit!==f.limit||!Number.isSafeInteger(f.cursor.ordinal)||f.cursor.ordinal<0)fail('INVALID_CURSOR','El cursor no corresponde a esta venta.');after=f.cursor.ordinal;}
 const row=(await c.query(`SELECT ${columns},s.record->'originalReceipt' AS original_receipt FROM sales s WHERE s.id=$1`,[id])).rows[0];
 if(!row)fail('SALE_NOT_FOUND','La venta no está en este servidor.',404);
 const rows=(await c.query('SELECT ordinal,record,quantity::text,unit,price::text,amount::text,activity FROM sale_items WHERE sale_id=$1 AND ordinal>$2 ORDER BY ordinal LIMIT $3',[id,after,f.limit+1])).rows;
 const count=Number((await c.query('SELECT count(*)::int AS n FROM sale_items WHERE sale_id=$1',[id])).rows[0].n);
 const selected=rows.slice(0,f.limit),last=selected.at(-1),receipt=row.original_receipt;
 const originalReceiptReference=receipt&&String(receipt.id)===id&&receipt.folio===row.folio?{id,folio:row.folio,sha256:digest(receipt)}:null;
 const sale=header(row);if(!count){sale.partial=true;sale.issues.push('Sin renglones históricos disponibles');}
 return {...s,source:'postgresql',generatedAt:new Date().toISOString(),sale,items:selected.map(item),itemCount:count,nextCursor:rows.length>f.limit?encode({...s,id,ordinal:last.ordinal,limit:f.limit}):null,originalReceiptReference};
}
