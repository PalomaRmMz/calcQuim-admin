import {useMemo,useRef,useState} from 'react';
import {Autocomplete,Button,Dialog,DialogActions,DialogContent,TextField} from '@mui/material';
import {catalogChoices,searchChoices} from '../../server/src/mobile/catalog.mjs';
import {makeLine,money,repriceLines,requestBody,total} from '../../server/src/mobile/sale.mjs';
import {COMMERCE_VERSION} from '../domain/commerce.mjs';
import {laundryOptions} from '../domain/laundryPricing.mjs';
import {assertSaleDraftGeneration} from '../domain/saleDraftGuard.mjs';
import {captureUnit,hardwareAmountQuantity,physicalQuantity,suggestedPhysical,webCaptureChoices,withWebPhysical} from '../domain/webSaleCapture.mjs';
import {paymentAmounts,WEB_PAYMENT_POLICY} from '../domain/webPayment.mjs';
import {wholesaleSettings} from '../domain/wholesalePricing.mjs';
import {unitLabel} from '../utils/units.js';
import ModalHeader from './ModalHeader';
import WebMoneyBreakdown from './WebMoneyBreakdown';
import '../styles/components/SaleFormModal.css';

const discreteUnits=new Set(['pieza','rollo','paquete','envase','botella','bolsa']);
const wholeQuantity=tariff=>tariff?.presentation?.integerOnly??discreteUnits.has(captureUnit(tariff));
const selectedTariff=(choices,row)=>choices.get(row.choiceKey)?.tariffs.find(tariff=>tariff.key===row.tariffKey);
const showsPhysical=(row,tariff)=>row.mode==='amount'&&Boolean(tariff)&&!tariff.service;

function calculateTicket(rows,choices){
 const errors=new Map(),draft=[];
 for(const row of rows){
  const choice=choices.get(row.choiceKey),tariff=choice?.tariffs.find(option=>option.key===row.tariffKey);
  if(!tariff){errors.set(row.id,'Selecciona una tarifa disponible.');continue;}
  if(!row.value){errors.set(row.id,'Captura una cantidad o importe.');continue;}
  try{
   const {service,presentation}=tariff;
   const mode=presentation?'quantity':row.mode;
   const value=presentation&&row.mode==='amount'?hardwareAmountQuantity(tariff,row.value):row.value;
   if(mode==='quantity'&&wholeQuantity(tariff)&&!Number.isInteger(Number(value)))throw Error('Captura unidades enteras.');
   if(service?.id==='fc:service:especial'&&!row.description.trim())throw Error('Describe brevemente el trabajo.');
   draft.push(makeLine(choice,tariff,mode,value,row.id,null,{addons:row.addons,description:row.description}));
   if(presentation&&row.mode==='amount'&&row.physical&&physicalQuantity(row.physical)!==physicalQuantity(value)){
    errors.set(row.id,'Confirma la cantidad equivalente al importe o cambia a Cantidad para vender otra cantidad.');
   }
  }catch(error){errors.set(row.id,error.message);}
 }
 const byId=new Map(rows.map(row=>[row.id,row]));
 let priced,issue='';
 try{priced=repriceLines(draft);}
 catch(error){
  if(/ambigu/i.test(error.message)&&draft.some(line=>!line.commerceVersion&&line.entryMode==='amount'&&byId.get(line.id).physical)){
   try{priced=repriceLines(draft.map(line=>!line.commerceVersion&&line.entryMode==='amount'
    ?{...line,confirmedQuantity:byId.get(line.id).physical||null}:line));}
   catch(retryError){issue=retryError.message;}
  }else issue=error.message;
 }
 const lines=(priced??[]).map(line=>{
  if(line.commerceVersion||line.entryMode!=='amount')return line;
  const manual=byId.get(line.id).physical;
  try{return withWebPhysical(line,manual||suggestedPhysical(line),manual?'manual':'suggested');}
  catch(error){errors.set(line.id,error.message);return line;}
 });
 return {lines,errors,issue};
}

export default function CommercialSaleForm({snapshot,onSave,onClose,onRefresh}){
 const [query,setQuery]=useState(''),[selection,setSelection]=useState(null),[rows,setRows]=useState([]);
 const [payment,setPayment]=useState('Efectivo'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stale,setStale]=useState(false);
 const [draftGeneration]=useState(snapshot.generation);
 const searchInput=useRef(null),saving=useRef(false);
 const wholesale=wholesaleSettings(snapshot.data);
 const choices=useMemo(()=>webCaptureChoices(catalogChoices(snapshot.data).filter(c=>['product','presentation','service'].includes(c.kind)),snapshot.data.products),[snapshot.data]);
 const choiceByKey=useMemo(()=>new Map(choices.map(choice=>[choice.key,choice])),[choices]);
 const matches=query.trim()?searchChoices(choices,query).slice(0,30):[];
 const {lines,errors,issue}=useMemo(()=>calculateTicket(rows,choiceByKey),[rows,choiceByKey]);
 const lineById=new Map(lines.map(line=>[line.id,line]));
 const policy=snapshot.webPaymentPolicy?.enabled?snapshot.webPaymentPolicy.version:null;
 const paymentPreview=policy&&lines.length?paymentAmounts(lines,payment,policy):null;
 const canSave=rows.length>0&&!errors.size&&!issue&&!busy&&snapshot.generation===draftGeneration;
 const invalidMessage=rows.map(row=>({row,message:errors.get(row.id)})).find(entry=>entry.message);
 const showPhysicalColumn=rows.some(row=>showsPhysical(row,selectedTariff(choiceByKey,row)));
 const showDescriptionColumn=rows.some(row=>selectedTariff(choiceByKey,row)?.service?.priceMode==='custom');

 function add(){
  if(!selection||busy)return;
  const choice=choiceByKey.get(selection.key);
  if(!choice)return;
  const tariff=choice.tariffs.length===1?choice.tariffs[0]:null;
  const row={id:crypto.randomUUID(),choiceKey:choice.key,displayName:choice.displayName,
   tariffKey:tariff?.key??'',mode:tariff?.service?.priceMode==='custom'?'amount':'quantity',
   value:'',physical:'',addons:tariff?.service?laundryOptions(tariff.service)[0]?.addons??[]:[],description:''};
  setRows(current=>[...current,row]);
  setSelection(null);
  setQuery('');
  setError('');
  searchInput.current?.focus();
 }
 function update(id,patch){
  setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row));
  setError('');
 }
 async function save(){
  if(saving.current||!canSave)return;
  saving.current=true;
  setBusy(true);
  setError('');
  try{
   assertSaleDraftGeneration(draftGeneration,snapshot);
   const body=requestBody({lines,payment},{...snapshot,pricingVersion:wholesale?.version??'admin-sales-normal-v1'});
   body.items=body.items.map((row,n)=>({...row,...(lines[n].webPhysicalQuantity?{webPhysicalQuantity:lines[n].webPhysicalQuantity}:{})}));
   const result=await onSave({...body,commerceVersion:COMMERCE_VERSION,...(policy?{webPaymentPolicyVersion:WEB_PAYMENT_POLICY}:{})});
   if(result.ok)onClose();
   else {setError(result.message);setStale(result.code==='STALE_DATA');}
  }catch(error){setError(error.message);}
  finally{saving.current=false;setBusy(false);}
 }
 async function refreshDraft(){
  if(busy||!onRefresh)return;
  setBusy(true);
  try{
   const result=await onRefresh();
   if(!result?.ok)throw Error(result?.message||'No se pudo actualizar el catálogo.');
   assertSaleDraftGeneration(draftGeneration,result.snapshot);
   setStale(false);
   setError('Catálogo actualizado. Revisa los importes antes de registrar.');
  }catch(error){setError(error.message);}
  finally{setBusy(false);}
 }

 return <Dialog className="app-dialog" open fullWidth maxWidth="md" onClose={busy?undefined:onClose} PaperProps={{className:'sale-modal'}} aria-labelledby="commercial-sale-title">
  <ModalHeader titleId="commercial-sale-title" title="Registrar venta" onClose={busy?()=>{}:onClose}/>
  <DialogContent className="sale-modal-body">
   {error&&<p role="alert" className={error.startsWith('Catálogo actualizado.')?'alert alert-info':'alert alert-danger'}>{error}</p>}
   {stale&&onRefresh&&<Button disabled={busy} onClick={refreshDraft}>Actualizar catálogo</Button>}
   <div className="sale-ticket-search">
    <Autocomplete size="small" value={selection} inputValue={query} disabled={busy} options={matches}
     onInputChange={(_,text,reason)=>{setQuery(text);if(reason==='input')setSelection(null);}}
     onChange={(_,choice)=>{setSelection(choice);if(choice)setQuery(choice.displayName);}}
     filterOptions={options=>options} getOptionLabel={choice=>choice.displayName} getOptionKey={choice=>choice.key}
     isOptionEqualToValue={(a,b)=>a.key===b.key} noOptionsText={query.trim()?'Sin coincidencias':'Escribe para buscar'}
     renderOption={(props,choice)=>{const {key,...rest}=props;return <li key={key} {...rest}><div>{choice.displayName}
      <small className="d-block text-muted">{choice.tariffs.map(t=>t.service?.priceMode==='custom'?'Precio personalizado':money(t.price)+' / '+captureUnit(t)).join(' · ')}</small>
     </div></li>;}}
     renderInput={params=><TextField {...params} inputRef={searchInput} autoFocus label="Buscar producto o servicio"/>}/>
    <Button type="button" variant="contained" disabled={!selection||busy} onClick={add}>Agregar</Button>
   </div>
   {rows.length>0&&<div className="table-responsive sale-items sale-ticket-scroll">
    <table className={`table align-middle sale-ticket-table ${showPhysicalColumn?'sale-ticket-table-physical':''}`}>
     <thead><tr><th scope="col">Producto</th><th scope="col">Modo</th><th scope="col">Cantidad / importe</th>
      {showPhysicalColumn&&<th scope="col">Cantidad física</th>}{showDescriptionColumn&&<th scope="col">Descripción</th>}
      <th scope="col" className="sale-ticket-subtotal">Subtotal</th><th scope="col"><span className="visually-hidden">Eliminar</span></th></tr></thead>
     <tbody>{rows.map(row=>{
      const choice=choiceByKey.get(row.choiceKey),tariff=choice?.tariffs.find(t=>t.key===row.tariffKey),line=lineById.get(row.id);
      const service=tariff?.service,custom=service?.priceMode==='custom',amount=row.mode==='amount';
      const unit=unitLabel(captureUnit(tariff)),physical=showsPhysical(row,tariff);
      const step=amount?'0.01':service?.loadPricing?.step??(wholeQuantity(tariff)||service?.unit==='carga'||service?.unit==='servicio'?'1':'0.000001');
      const physicalStep=wholeQuantity(tariff)?'1':'0.000001';
      const options=service&&!custom?laundryOptions(service):[];
      const laundryOption=options.find(option=>option.addons.length===row.addons.length&&option.addons.every(id=>row.addons.includes(id)));
      const title=row.displayName;
      return <tr key={row.id}>
       <th scope="row" className="sale-ticket-name"><span title={title}>{title}</span>
        {choice?.tariffs.length>1&&<select className="form-select form-select-sm" aria-label={`Tarifa de ${title}`} disabled={busy} value={row.tariffKey}
         onChange={event=>update(row.id,{tariffKey:event.target.value,physical:''})}>
         <option value="">Selecciona tarifa</option>{choice.tariffs.map(t=><option key={t.key} value={t.key}>{money(t.price)} / {captureUnit(t)}</option>)}
        </select>}
       </th>
       <td>{service?options.length>1?<select className="form-select form-select-sm" aria-label={`Modalidad de ${title}`} disabled={busy}
        value={laundryOption?.key??''} onChange={event=>update(row.id,{addons:options.find(option=>option.key===event.target.value)?.addons??[]})}>
        {options.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}
       </select>:null:<div className="sale-ticket-modes" role="group" aria-label={`Modo de ${title}`}>
        {[['quantity','Cantidad'],['amount','Monto']].map(([mode,label])=><label key={mode}>
         <input type="radio" name={`sale-mode-${row.id}`} checked={row.mode===mode} disabled={busy||mode==='amount'&&(tariff?.price===0||tariff?.presentation?.supplyInventory)}
          onChange={()=>update(row.id,{mode,value:'',physical:''})}/>{label}
        </label>)}
       </div>}</td>
       <td><div className="sale-ticket-value">
        {amount&&<span aria-hidden="true">$</span>}
        <input type="number" className="form-control form-control-sm" min={step} step={step}
         inputMode={amount||step!=='1'?'decimal':'numeric'} disabled={busy||!tariff}
         aria-label={`${amount?'Importe':'Cantidad'} de ${title}`} value={row.value} onChange={event=>update(row.id,{value:event.target.value})}/>
        {!amount&&<span aria-hidden="true">{unit}</span>}
       </div></td>
       {showPhysicalColumn&&<td>{physical&&<div className="sale-ticket-value">
         <input type="number" className="form-control form-control-sm" min={physicalStep} step={physicalStep}
          inputMode={physicalStep==='1'?'numeric':'decimal'} disabled={busy}
          aria-label={`Cantidad física confirmada de ${title}`}
          value={row.physical||(tariff.presentation?line?.quantity:line?.webPhysicalQuantity?.quantity)||''}
          onChange={event=>update(row.id,{physical:event.target.value})}/>
        <span aria-hidden="true">{unit}</span>
       </div>}</td>}
       {showDescriptionColumn&&<td>{custom&&<input className="form-control form-control-sm" aria-label={`Descripción de ${title}`} placeholder="Descripción" maxLength={200}
        value={row.description} disabled={busy} onChange={event=>update(row.id,{description:event.target.value})}/>}</td>}
       <td className="sale-ticket-subtotal">{line?money(line.amount):'—'}</td>
       <td><button type="button" className="sale-remove" aria-label={`Eliminar ${title}`} disabled={busy}
        onClick={()=>{setRows(current=>current.filter(item=>item.id!==row.id));setError('');}}>×</button></td>
      </tr>;
     })}</tbody>
    </table>
   </div>}
   {(issue||invalidMessage&&invalidMessage.row.value)&&<p role="alert" className="text-danger small mt-2 mb-0">{issue||`${invalidMessage.row.displayName}: ${invalidMessage.message}`}</p>}
   <label className="sale-ticket-payment">Forma de pago<select className="form-select form-select-sm" value={payment} disabled={busy}
    onChange={event=>setPayment(event.target.value)}>{['Efectivo','Transferencia','Tarjeta'].map(method=><option key={method}>{method}</option>)}</select></label>
  </DialogContent>
  <DialogActions className="sale-modal-actions">
   <div className="sale-footer-total"><span>{policy?'Total a cobrar':'Total'}</span><WebMoneyBreakdown monetary={paymentPreview}/>
    <strong>{money(paymentPreview?paymentPreview.collectedCents/100:total(lines))}</strong></div>
   <Button disabled={busy} onClick={onClose}>Cancelar</Button>
   <Button variant="contained" disabled={!canSave} onClick={save}>{busy?'Registrando…':'Registrar venta'}</Button>
  </DialogActions>
 </Dialog>;
}
