import {commercialImport} from './commerce.mjs';
import {referenceCommerce} from '../../../src/domain/referenceCommerce.mjs';
import {saveSupplier} from '../../../src/services/procurementDomain.js';
import {normalizeText} from '../../../src/utils/catalogUtils.js';
import {canonical} from './dataset.mjs';

// Explicit owner-authorized catalog only. Does not seed transactions or inventory.
export function prepareFullCleanCatalog(data,counters){
 const next=structuredClone(data),counts=structuredClone(counters),before=canonical(data);
 const preview=commercialImport(next,{},true);
 commercialImport(next,{hash:preview.plan.hash,confirmed:true});
 for(const supplier of referenceCommerce.suppliers){
   const matches=next.procurement.suppliers.filter(s=>s.externalKey===supplier.externalKey||normalizeText(s.name)===normalizeText(supplier.name));
   if(matches.length>1)throw Error('Hay proveedores ambiguos; no se fusionan automáticamente.');
   const old=matches[0];
   if(old&&old.businessActivity==='JARCERIA'&&old.externalKey===supplier.externalKey)continue;
   next.procurement=saveSupplier(next.procurement,{...(old||{}),name:old?.name||supplier.name,externalKey:supplier.externalKey,businessActivity:'JARCERIA',active:old?.active??true});
   next.procurement.suppliers.find(s=>normalizeText(s.name)===normalizeText(old?.name||supplier.name)).externalKey=supplier.externalKey;
 }
 counts.products=Math.max(counts.products??0,...next.products.map(p=>Number(p.id)));
 return {data:next,counters:counts,changed:canonical(next)!==before};
}
