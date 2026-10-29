import { createHash } from 'node:crypto';
import { STORAGE_KEYS } from '../../../src/services/catalogStorage.js';
import { validateDataset } from './commands.mjs';

function decimal(token) {
  const [mantissa,exponent='0']=token.toLowerCase().split('e');
  const negative=mantissa.startsWith('-');
  const absolute=mantissa.replace('-','');
  const [whole,fraction='']=absolute.split('.');
  let digits=(whole+fraction).replace(/^0+/,'')||'0';
  let power=Number(exponent)-fraction.length;
  while(digits.endsWith('0')&&digits!=='0') {digits=digits.slice(0,-1);power++;}
  return `${negative&&digits!=='0'?'-':''}${digits}e${digits==='0'?0:power}`;
}
export function previewOriginal(text) {
  const sha256=createHash('sha256').update(text).digest('hex');
  const issues=[];
  let original;
  try {original=JSON.parse(text);} catch {return {report:{sha256,canTransfer:false,issues:['INVALID_JSON']}};}
  if(original?.application!=='CalcQuim'||original.formatVersion!==1||!original.storage||Array.isArray(original.storage)) issues.push('UNSUPPORTED_BACKUP');
  // Detecta números que JSON.parse redondearía, sin imprimirlos.
  for(const match of text.matchAll(/"(?:\\.|[^"\\])*"|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)) if(match[1]) {
    const value=Number(match[1]);
    if(!Number.isFinite(value)||decimal(match[1])!==decimal(JSON.stringify(value))) {issues.push('NUMERIC_PRECISION_LOSS');break;}
  }
  const storage=original?.storage??{};
  if(storage[STORAGE_KEYS.resetPending]!=null||storage.calcquim_import_pending_v1!=null) issues.push('PENDING_STORAGE_OPERATION');
  const data={};
  for(const name of ['categories','productLines','priceGroups','products','sales','procurement']) {
    try {
      if(typeof storage[STORAGE_KEYS[name]]!=='string') throw new Error();
      // El respaldo contiene JSON serializado dentro del contenedor: validar también su precisión.
      const raw=storage[STORAGE_KEYS[name]];
      for(const match of raw.matchAll(/"(?:\\.|[^"\\])*"|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)) if(match[1]&&(!Number.isFinite(Number(match[1]))||decimal(match[1])!==decimal(JSON.stringify(Number(match[1]))))) throw new Error();
      data[name]=JSON.parse(raw);
    } catch {issues.push(`MISSING_OR_INVALID_${name.toUpperCase()}`);}
  }
  if(data.procurement?.supplyModelVersion!==2) issues.push('EXPLICIT_LEGACY_REVIEW_REQUIRED');
  if(!issues.length) {
    try {validateDataset(data);}catch {issues.push('DOMAIN_OR_RELATION_REVIEW_REQUIRED');}
  }
  let legacy=[];
  try {legacy=storage[STORAGE_KEYS.purchases]===null?[]:JSON.parse(storage[STORAGE_KEYS.purchases]);if(!Array.isArray(legacy))throw new Error();}
  catch {issues.push('INVALID_LEGACY_ARCHIVE');}
  if(legacy.length)issues.push('LEGACY_ARCHIVE_REQUIRES_SEPARATE_MAPPING');
  const sequence=storage[STORAGE_KEYS.salesSequence];
  if(sequence!=null&&(!/^\d+$/.test(sequence)||!Number.isSafeInteger(Number(sequence))))issues.push('INVALID_SALES_SEQUENCE');
  const counts=Object.fromEntries(Object.entries(data).filter(([,value])=>Array.isArray(value)).map(([name,rows])=>[name,rows.length]));
  for(const name of ['suppliers','purchasedItems','supplyItems','supplyConversions','supplierPrices','purchases']) counts[name]=data.procurement?.[name]?.length??0;
  const report={sha256,canTransfer:issues.length===0,issues:[...new Set(issues)],counts,applyEnabled:false};
  // Datos completos solo en memoria del llamador; el CLI imprime exclusivamente report.
  return {report,data,original};
}
