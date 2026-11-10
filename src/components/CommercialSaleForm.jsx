import {captureUnit,captureChoices,capturePreview,suggestedPhysical,withWebPhysical} from '../domain/webSaleCapture.mjs';
import WebMoneyBreakdown from './WebMoneyBreakdown';
import {paymentAmounts,WEB_PAYMENT_POLICY} from '../domain/webPayment.mjs';
import LaundrySaleFields from './LaundrySaleFields';
import CleaningSaleFields from './CleaningSaleFields';
import ModalHeader from './ModalHeader';
import {Autocomplete,TextField} from '@mui/material';
import '../styles/components/SaleFormModal.css';
import {useState} from 'react';
import {Dialog,DialogContent,DialogActions,Button} from '@mui/material';
import {catalogChoices,searchChoices} from '../../server/src/mobile/catalog.mjs';
import {makeLine,repriceLines,requestBody,total,money} from '../../server/src/mobile/sale.mjs';
import {COMMERCE_VERSION} from '../domain/commerce.mjs';
import {wholesaleSettings} from '../domain/wholesalePricing.mjs';

export default function CommercialSaleForm({snapshot,onSave,onClose}){
 const [query,setQuery]=useState(''),[selection,setSelection]=useState(null),[tariffKey,setTariffKey]=useState(''),[mode,setMode]=useState('quantity'),[value,setValue]=useState(''),[manualPhysical,setManualPhysical]=useState(''),[physicalEdited,setPhysicalEdited]=useState(false),[addons,setAddons]=useState([]),[description,setDescription]=useState(''),[lines,setLines]=useState([]),[payment,setPayment]=useState('Efectivo'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const data={...snapshot.data,wholesalePricing:wholesaleSettings(snapshot.data)},choices=captureChoices(catalogChoices(data)),choice=choices.find(c=>c.key===selection),tariff=choice?.tariffs.find(t=>t.key===tariffKey),custom=tariff?.service?.priceMode==='custom',commercial=!!tariff?.commerceVersion;
 const paymentPolicy=snapshot.webPaymentPolicy?.enabled?snapshot.webPaymentPolicy.version:null;
 const paymentPreview=paymentPolicy?paymentAmounts(lines,payment,paymentPolicy):null;
 const matches=query.trim()?searchChoices(choices,query).slice(0,30):[];
 let cleaningPreview=null,cleaningError='';
 if(choice&&!commercial&&value.trim()){try{cleaningPreview=capturePreview(choice,tariff,mode,value,lines,physicalEdited?manualPhysical:null);}catch(e){cleaningError=e.message;}}
 let suggestion='';try{suggestion=mode==='amount'?suggestedPhysical(cleaningPreview):'';}catch(e){cleaningError=e.message;}
 const confirmed=physicalEdited?manualPhysical:suggestion;
 function resetPhysical(){setManualPhysical('');setPhysicalEdited(false);}
 let servicePreview=null,serviceError='';
 if(tariff?.service&&value.trim()){try{if(custom&&tariff.service.id==='fc:service:especial'&&!description.trim())throw Error('Describe brevemente el trabajo.');servicePreview=makeLine(choice,tariff,custom?'amount':'quantity',value,'preview',null,{addons,description});}catch(e){serviceError=e.message;}}
 function select(c){setSelection(c.key);setTariffKey(c.tariffs.length===1?c.tariffs[0].key:'');setValue('');resetPhysical();setAddons([]);setDescription('');setMode(c.kind==='service'&&c.tariffs[0].service?.priceMode==='custom'?'amount':'quantity');setError('');}
 function clear(){setSelection(null);setQuery('');setMode('quantity');setValue('');resetPhysical();setAddons([]);setDescription('');}
 function add(){try{let line=!commercial&&cleaningPreview?{...cleaningPreview,id:crypto.randomUUID()}:makeLine(choice,tariff,custom?'amount':mode,value,crypto.randomUUID(),null,{addons,description});if(!commercial&&mode==='amount')line=withWebPhysical(line,confirmed,physicalEdited?'manual':'suggested');setLines(repriceLines([...lines,line]));setError('');clear();}catch(e){setError(e.message);}}
 async function save(){if(busy)return;setBusy(true);try{const body=requestBody({lines,payment},{...snapshot,pricingVersion:data.wholesalePricing?.version??'admin-sales-normal-v1'});body.items=body.items.map((row,n)=>({...row,...(lines[n].webPhysicalQuantity?{webPhysicalQuantity:lines[n].webPhysicalQuantity}:{})}));const result=await onSave({...body,commerceVersion:COMMERCE_VERSION,...(paymentPolicy?{webPaymentPolicyVersion:WEB_PAYMENT_POLICY}:{})});if(result.ok)onClose();else setError(result.message);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Dialog className="app-dialog" open fullWidth maxWidth="md" onClose={busy?undefined:onClose} PaperProps={{className:"sale-modal"}} aria-labelledby="commercial-sale-title"><ModalHeader titleId="commercial-sale-title" title="Registrar venta" subtitle="Productos y servicios en un solo ticket" onClose={busy?()=>{}:onClose}/><DialogContent className="sale-modal-body">
 {error&&<p role="alert" className="alert alert-danger">{error}</p>}
 {!choice?<><Autocomplete value={null} inputValue={query} onInputChange={(_,value)=>setQuery(value)} options={matches} filterOptions={options=>options} getOptionLabel={c=>c.name} getOptionKey={c=>c.key} isOptionEqualToValue={(a,b)=>a.key===b.key} onChange={(_,c)=>{if(c)select(c);}} noOptionsText={query.trim()?'Sin coincidencias':'Escribe para buscar'} renderOption={(props,c)=>{const {key,...rest}=props;return <li key={key} {...rest}><div>{c.name}<small className="d-block text-muted">{c.context}</small></div></li>;}} renderInput={params=><TextField {...params} autoFocus label="Buscar producto o servicio" placeholder="Escribe para buscar"/>}/></>:<section className="sale-section border rounded p-3 my-2"><button className="btn btn-link float-end" onClick={clear}>Cambiar concepto</button><h3 className="h5">{choice.name}</h3><p>{choice.context}</p>
 {tariff?.service?<LaundrySaleFields service={tariff.service} value={value} onValue={setValue} addons={addons} onAddons={setAddons} description={description} onDescription={setDescription} preview={servicePreview} error={serviceError}/>:<><p className="sale-price-information">Precio de venta: <strong>{money(cleaningPreview?.price??tariff?.price)} / {captureUnit(tariff)}</strong>{cleaningPreview?.priceTier==='wholesale'&&<small> · Mayoreo automático</small>}</p><div className={`sale-capture-grid ${commercial?'sale-capture-hardware':'sale-capture-cleaning'}`}>
 {!commercial?<CleaningSaleFields mode={mode} value={value} confirmed={confirmed} unit={tariff?.unit} onMode={next=>{setMode(next);setValue('');resetPhysical();}} onValue={setValue} onConfirmed={next=>{setManualPhysical(next);setPhysicalEdited(true);}} suggestion={suggestion} physicalEdited={physicalEdited} onRestore={resetPhysical}/>:<label className="d-block sale-capture-quantity">{custom||mode==='amount'?'Importe en pesos':`Cantidad (${captureUnit(tariff)||'unidad'})`}<input className="form-control" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder="" /></label>}
 </div>
 {cleaningError&&<p role="alert" className="form-text text-danger">{cleaningError}</p>}
 {tariff?.service?.addons?.map(a=><label key={a.id} className="d-block my-2"><input type="checkbox" checked={addons.includes(a.id)} onChange={e=>setAddons(e.target.checked?[...addons,a.id]:addons.filter(id=>id!==a.id))}/> {a.name} +{money(a.price)} por {tariff.unit}</label>)}
 {custom&&<label className="d-block">Concepto breve (opcional)<input className="form-control" maxLength={200} value={description} onChange={e=>setDescription(e.target.value)}/></label>}
 </>}
 <button disabled={busy||!tariff||!value.trim()||Boolean(tariff?.service&&!servicePreview)} className="btn btn-primary mt-2" onClick={add}>Agregar a la venta</button></section>}
 <div className="table-responsive sale-items mt-3"><table className="table align-middle"><thead><tr><th>Concepto</th><th>Cantidad</th><th>Importe</th><th/></tr></thead><tbody>{lines.map(l=><tr key={l.id}><td>{l.name}{l.addons?.length>0&&<small className="d-block">{l.addons.map(a=>a.name).join(', ')}</small>}{l.description&&<small className="d-block">{l.description}</small>}</td><td>{l.quantity} {l.unit}{l.webPhysicalQuantity&&<small className="d-block">Entregado: {l.webPhysicalQuantity.quantity} {l.unit}</small>}</td><td>{money(l.amount)}</td><td><button className="btn btn-sm btn-outline-danger" onClick={()=>{try{setLines(repriceLines(lines.filter(i=>i.id!==l.id)));}catch(e){setError(e.message);}}}>Quitar</button></td></tr>)}</tbody></table></div>
 <label>Forma de pago<select className="form-select" value={payment} onChange={e=>setPayment(e.target.value)}>{['Efectivo','Transferencia','Tarjeta'].map(p=><option key={p}>{p}</option>)}</select></label>
 </DialogContent><DialogActions className="sale-modal-actions"><div className="sale-footer-total"><span>{paymentPolicy?'Total a cobrar':'Total'}</span><WebMoneyBreakdown monetary={paymentPreview}/><strong>{money(paymentPreview?paymentPreview.collectedCents/100:total(lines))}</strong></div><Button disabled={busy} onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={busy||!!choice||!lines.length} onClick={save}>{busy?'Registrando…':'Registrar venta'}</Button></DialogActions></Dialog>;
}
