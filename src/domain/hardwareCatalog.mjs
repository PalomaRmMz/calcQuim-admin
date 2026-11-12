import {hardwareIdentity} from './hardwareCreation.mjs';
import {normalizeText} from '../utils/catalogUtils.js';
export function hardwareCategory(data,id){return (data.procurement.hardwareCategories||[]).find(c=>String(c.id)===String(id));}
export function saveHardwareCategory(data,input){
 const rows=data.procurement.hardwareCategories||[],old=rows.find(c=>String(c.id)===String(input.id));
 const name=String(input.name??'').trim().replace(/\s+/g,' ');
 if(!name||name.length>200)throw Error('Escribe una categoría de hasta 200 caracteres.');
 if(rows.some(c=>c!==old&&normalizeText(c.name)===normalizeText(name)))throw Error('Ya existe una categoría de jarcería con ese nombre.');
 const row={id:old?.id??Math.max(0,...rows.map(c=>Number(c.id)))+1,name,active:input.active!==false};
 data.procurement.hardwareCategories=old?rows.map(c=>c===old?row:c):[...rows,row];return {ok:true,id:row.id};
}
export function deleteHardwareCategory(data,input){
 if(data.products.some(p=>p.activity==='JARCERIA'&&String(p.hardwareCategoryId)===String(input.id)))throw Error('La categoría tiene productos asociados; puedes desactivarla.');
 data.procurement.hardwareCategories=(data.procurement.hardwareCategories||[]).filter(c=>String(c.id)!==String(input.id));return {ok:true};
}
export function validateHardwareName(data,input){
 const name=String(input.name??'').trim().replace(/\s+/g,' ');
 if(!name||name.length>200)throw Error('Escribe un nombre de hasta 200 caracteres.');
 const old=data.products.find(p=>String(p.id)===String(input.id));
 if(normalizeText(old?.name)!==normalizeText(name)&&data.products.some(p=>p.activity==='JARCERIA'&&String(p.id)!==String(input.id)&&hardwareIdentity(p.name)===hardwareIdentity(name)))throw Error('Ya existe un producto de jarcería con ese nombre; agrega su presentación al producto existente.');
 return name;
}
