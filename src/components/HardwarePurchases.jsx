import {useContext,useState} from 'react';
import PurchaseDialog,{PurchaseArticleSearch} from './PurchaseDialog';
import {PersistenceContext} from '../context/PersistenceContext.js';
import {validateHardwareName} from '../domain/hardwareCatalog.mjs';
import {purchasePresentationLabel} from '../domain/purchasePresentationLabel.mjs';
import {presentationPurchaseCost} from '../domain/purchaseCost.mjs';
import {normalizeText} from '../utils/catalogUtils.js';
import {money,localDate} from '../utils/salesUtils.js';
import {unitCostText} from '../utils/purchaseUtils.js';
import PurchaseInventoryCorrection from './PurchaseInventoryCorrection';
import QuickHardwareCreate from './QuickHardwareCreate';
import TableActions from './TableActions';
import {PurchaseLines,PurchaseLineGroup,PurchaseLineQuantity,PurchaseLineCostMode,PurchaseLineCost,PurchaseLineTotal} from './PurchaseLineFields';

function lineInput({option,quantity,costMode,cost}){
 return {
  ...(option.draftId ? {draftId:option.draftId,presentationIndex:option.presentationIndex} : {presentationId:option.id}),
  quantity,...(costMode==='total'?{totalAmount:cost}:{cost})
 };
}

function lineTotal(line){
 try{return presentationPurchaseCost(lineInput(line));}catch{return null;}
}

export default function HardwarePurchases({onCreated,onClose,original}){
 const persistence=useContext(PersistenceContext);
 const editing=Boolean(original);
 const [purchase,setPurchase]=useState(()=>({supplierId:original?.supplierId??'',date:original?.date??localDate(),reference:original?.reference??'',notes:original?.notes??'',receipt:original?.receipt??null}));
 const [search,setSearch]=useState(''),[draftName,setDraftName]=useState(null);
 const [drafts,setDrafts]=useState([]),[items,setItems]=useState(()=>original?.items.map(item=>{
  const p=item.commercialPurchase,productName=item.productNameSnapshot||item.name,costMode=p.costMode==='unit'?'unit':'total';
  const catalogPresentation=persistence?.snapshot.data.procurement.presentations?.find(row=>row.id===p.presentationId);
  return {id:item.id,originalId:item.id,option:{...p,id:p.presentationId,productName,label:productName+' · '+p.name,
   integerOnly:catalogPresentation?.integerOnly||!['kg','gramo'].includes(p.unit)||!['kg','gramo'].includes(p.baseUnit)},
   quantity:String(p.quantity),costMode,cost:String(costMode==='unit'?p.costPerPresentation:item.total)};
 })??[]);
 const [inventoryCorrection,setInventoryCorrection]=useState({confirmed:false,disposition:'adjust',reason:'',baselineTreatment:''});
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[photoBusy,setPhotoBusy]=useState(false);
 if(!persistence)return null;

 const data=persistence.snapshot.data,model=data.procurement;
 const suppliers=model.suppliers.filter(s=>s.id===original?.supplierId||s.active&&s.businessActivity==='JARCERIA');
 const products=new Map(data.products.filter(p=>p.active&&p.activity==='JARCERIA').map(p=>[String(p.id),p]));
 const options=(model.presentations||[]).filter(p=>p.active&&p.purchaseEnabled!==false&&products.has(String(p.productId)))
  .map(p=>({...p,productName:products.get(String(p.productId)).name,label:purchasePresentationLabel(p,[products.get(String(p.productId))])}))
  .concat(drafts.flatMap(draft=>draft.options));
 const totals=items.map(lineTotal);
 const total=totals.reduce((sum,row)=>sum+Math.round((row?.total??0)*100),0)/100;
 const knownCosts=new Map();
 if(editing)for(const prior of model.purchases.filter(p=>p.id!==original.id&&!p.voidedAt&&p.supplierId===purchase.supplierId)
  .sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt??'').localeCompare(a.createdAt??''))){
  for(const {commercialPurchase:p} of prior.items)if(p?.costPerPresentation>0&&!knownCosts.has(p.presentationId))knownCosts.set(p.presentationId,p.costPerPresentation);
 }
 const change=(key,value)=>setPurchase(current=>({...current,[key]:value}));
 const changeLine=(id,patch)=>setItems(current=>current.map(row=>row.id===id?{...row,...patch}:row));
 const newLine=option=>({id:crypto.randomUUID(),option,quantity:'',costMode:'total',cost:''});

 function addDraft(bundle){
  const name=validateHardwareName({...data,products:[...data.products,...drafts.map(d=>({...d.bundle.product,id:d.id,activity:'JARCERIA'}))]},bundle.product);
  const id=crypto.randomUUID();
  const draftOptions=bundle.presentations.map((p,index)=>({
   ...p,id:id+'-'+index,draftId:id,presentationIndex:index,productName:name,baseUnit:bundle.product.unit,label:name+' · '+p.name
  }));
  setDrafts(current=>[...current,{id,bundle,options:draftOptions}]);
  setItems(current=>[...current,newLine(draftOptions[0])]);
  setDraftName(null);
  setSearch('');
  return {ok:true};
 }

 async function save(){
  if(busy||photoBusy||!items.length)return;
  setBusy(true);
  setMessage('');
  try{
   const usedDrafts=new Set(items.map(row=>row.option.draftId));
   const activeDrafts=drafts.filter(d=>usedDrafts.has(d.id)).map(({id,bundle})=>({id,bundle}));
   const result=editing
    ?await persistence.command('editHardwarePurchase',[{...purchase,inventoryCorrection,drafts:activeDrafts,items:items.map(row=>({id:row.originalId,...lineInput(row)}))},original.id])
    :await persistence.command('saveHardwarePurchase',[{...purchase,items:items.map(lineInput),drafts:activeDrafts}]);
   if(result.ok)onCreated?.();
   else setMessage(result.message);
  }catch(error){setMessage(error.message);}
  finally{setBusy(false);}
 }

 return <>
  <PurchaseDialog editing={editing} suppliers={suppliers} supplierId={purchase.supplierId} onSupplierChange={value=>change('supplierId',suppliers.find(s=>String(s.id)===value)?.id??'')}
   date={purchase.date} onDateChange={value=>change('date',value)}
   itemCount={items.length} total={total} receipt={purchase.receipt} onReceiptChange={value=>change('receipt',value)} onReceiptBusy={setPhotoBusy} receiptBusy={photoBusy}
   reference={purchase.reference} onReferenceChange={value=>change('reference',value)} notes={purchase.notes} onNotesChange={value=>change('notes',value)}
   error={message} busy={busy} onClose={photoBusy?()=>{}:onClose} onSubmit={save}
   beforeSearch={editing&&<PurchaseInventoryCorrection hardware value={inventoryCorrection} onChange={setInventoryCorrection}/>}
   search={<PurchaseArticleSearch clearOnBlur={false} value={null} inputValue={search} options={options} onCreate={()=>setDraftName(search.trim())}
        onInputChange={(_,value)=>setSearch(value)} getOptionLabel={p=>p.label} getOptionKey={p=>p.id}
        filterOptions={(choices,{inputValue})=>{
         const terms=normalizeText(inputValue).split(/\s+/).filter(Boolean);
         return terms.length?choices.filter(p=>terms.every(term=>normalizeText(p.label).includes(term))).slice(0,60):[];
        }}
        noOptionsText={search.trim()?'No encontramos coincidencias.':'Escribe para buscar'}
        onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}
        onChange={(_,option)=>{if(option)setItems(current=>[...current,newLine(option)]);setSearch('');}}
        renderOption={({key,...props},p)=><li key={key} {...props}><span>{p.label}<small className="d-block text-muted">{p.factor} {p.baseUnit} / {p.unit}{p.draftId?' · Producto nuevo':''}</small></span></li>}
       />}>
        <PurchaseLines showKnownCost={editing}>
         <PurchaseLineGroup name="Jarcería" columnCount={editing?7:6} style={{backgroundColor:'#f1f3f5',color:'#6c757d'}}>{items.map((row,index)=>{
          const {id,option,quantity,costMode,cost}=row,calculated=totals[index];
          const draft=drafts.find(d=>d.id===option.draftId);
          const presentation=!draft&&model.presentations?.find(p=>p.id===option.id);
          const product=presentation&&products.get(String(presentation.productId));
          const salePrice=presentation?.active&&presentation.saleEnabled!==false&&product&&product.available!==false&&
           !product.pricePending&&Number(presentation.price)>0?money(presentation.price)+' / '+presentation.unit:'Sin precio vigente';
          return <tr key={id}>
           <td>{option.productName}
            {draft?.options.length>1?<select className="form-select form-select-sm" aria-label={'Presentación de '+option.productName} value={option.id} onChange={e=>changeLine(id,{option:draft.options.find(p=>p.id===e.target.value),quantity:'',cost:''})}>
             {draft.options.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>:<small className="d-block text-muted">{option.name}{!draft&&<> · Precio de venta: {salePrice}</>}</small>}
           </td>
           <td><PurchaseLineQuantity id={id} name={option.productName} unit={option.unit} value={quantity}
            min={option.integerOnly?'1':'0.000001'} step={option.integerOnly?'1':'0.000001'} onChange={value=>changeLine(id,{quantity:value})}/></td>
           {editing&&<td className="text-nowrap">{knownCosts.has(option.id)?unitCostText(knownCosts.get(option.id))+' / '+option.unit:'Sin costo conocido'}</td>}
           <td><PurchaseLineCostMode id={id} name={option.productName} value={costMode} onChange={mode=>changeLine(id,{
             costMode:mode,cost:calculated?(mode==='total'?calculated.total:calculated.cost.toFixed(2)):cost
            })}/>
           </td>
           <td><PurchaseLineCost id={id} name={option.productName} mode={costMode} value={cost} min="0.01" step="0.01" onChange={value=>changeLine(id,{cost:value})}/></td>
           <td className="text-nowrap"><PurchaseLineTotal total={calculated?.total} unitCost={calculated?.cost} unit={option.unit}/></td>
           <td><TableActions label={option.label} deleteLabel="Quitar" onDelete={()=>setItems(current=>current.filter(item=>item.id!==id))}/></td>
          </tr>;
         })}</PurchaseLineGroup>
        </PurchaseLines>
  </PurchaseDialog>
  {draftName!==null&&<QuickHardwareCreate purchaseDraft initialName={draftName} categories={model.hardwareCategories||[]} onClose={()=>setDraftName(null)} onSave={addDraft}/>}
 </>;
}
