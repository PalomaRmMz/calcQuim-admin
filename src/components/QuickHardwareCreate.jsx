import {useState} from 'react';
import {Button} from '@mui/material';
import AppModal from './AppModal';
import Feedback from './Feedback';
import InitialInventoryFields,{emptyProductInitial,productInitialPayload} from './InitialInventoryFields';
import {Field} from './ProcurementFields';
import {hardwareCreationBundle,hardwarePresentationUnits,wholeSaleUnit} from '../domain/hardwareCreation.mjs';
import {productInitialInventory} from '../domain/productInitialInventory.mjs';

const newPresentation=()=>({id:crypto.randomUUID(),name:'',unit:'pieza',factor:'1',price:''});
const modes=[['piece','Solo por pieza'],['pack','Solo por paquete'],['both','Por paquete y pieza'],['advanced','Más opciones']];

export default function QuickHardwareCreate({categories,onClose,onSave,purchaseDraft=false,initialName=''}){
 const [form,setForm]=useState(()=>({
  name:initialName,unit:'pieza',saleMode:'piece',piecePrice:'',packPrice:'',packSize:'',minimum:'',
  initialEnabled:false,closedPackages:'',looseUnits:'0',openPackages:'0',openPackagePieces:'',
  quantity:'',pricePending:false,presentations:[newPresentation()]
 }));
 const [specialInitial,setSpecialInitial]=useState(emptyProductInitial);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(key,value)=>setForm(current=>({...current,[key]:value}));
 const advanced=form.saleMode==='advanced';
 const packaged=['pack','both'].includes(form.saleMode);
 const baseUnit=advanced?form.unit:'pieza';
 const whole=wholeSaleUnit(baseUnit);
 const canOpen=advanced&&baseUnit==='pieza'&&form.presentations.some(row=>row.unit==='paquete');
 const open=Number(form.openPackages)>0;

 function changePresentation(index,patch){
  set('presentations',form.presentations.map((row,i)=>i===index?{...row,...patch}:row));
 }
 function removePresentation(index){
  set('presentations',form.presentations.filter((_,i)=>i!==index));
  setSpecialInitial(emptyProductInitial());
 }
 async function submit(){
  if(busy)return;
  setError('');
  setBusy(true);
  try{
   const bundle=hardwareCreationBundle(advanced?{...form,initialEnabled:false}:form);
   let initialQuantity=bundle.initialInventory?.quantity;
   if(advanced){
    bundle.presentations=bundle.presentations.map((row,index)=>({...row,id:form.presentations[index].id}));
    if(specialInitial.enabled){
     bundle.initialInventory=productInitialPayload(specialInitial,baseUnit,bundle.presentations);
     const definitions=bundle.presentations.map(row=>({...row,productId:'draft',baseUnit}));
     initialQuantity=productInitialInventory(bundle.initialInventory,{id:'draft',unit:baseUnit},definitions).quantity;
    }
   }
   if(initialQuantity!==undefined&&Number(initialQuantity)===0&&!window.confirm('¿Confirmas el inventario inicial en cero?'))return;
   const result=await onSave(bundle);
   if(!result.ok)setError(result.message);
  }catch(error){setError(error.message);}
  finally{setBusy(false);}
 }
 const number=(key,label,{min='0',step='1',required=false,placeholder}={})=>
  <Field label={label} type="number" inputMode={step==='1'?'numeric':'decimal'} min={min} step={step} required={required} placeholder={placeholder} value={form[key]} onChange={e=>set(key,e.target.value)}/>;
 const price=(key,label)=>number(key,label,{min:'0.01',step:'0.01',required:true});
 const close=()=>{if(!busy)onClose();};

 return <AppModal title="Agregar producto" onClose={close} onSubmit={submit}
  actions={<><Button color="inherit" disabled={busy} onClick={close}>Cancelar</Button><Button type="submit" variant="contained" disableElevation disabled={busy}>{purchaseDraft?'Agregar a la compra':busy?'Guardando…':'Guardar producto'}</Button></>}>
  <fieldset disabled={busy}>
   <Field label="Nombre comercial" required maxLength={200} value={form.name} onChange={e=>set('name',e.target.value)}/>
   <div className="row gx-2">
    <div className="col-sm-6"><Field label="Categoría" required={purchaseDraft} value={form.hardwareCategoryId??''} onChange={e=>set('hardwareCategoryId',e.target.value||null)}>
     <option value="">{purchaseDraft?'Selecciona categoría':'Sin categoría'}</option>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </Field></div>
    <div className="col-sm-6"><Field label="Forma de venta" value={form.saleMode} onChange={e=>{
     setForm(current=>({...current,saleMode:e.target.value,...(current.unit!=='pieza'?{minimum:''}:{})}));
    }}>
     {modes.filter(([value])=>!purchaseDraft||value!=='advanced').map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </Field></div>
   </div>
   {packaged&&number('packSize','Piezas por paquete',{min:'2',required:true})}
   {!purchaseDraft&&<label className="form-check mb-2"><input className="form-check-input" type="checkbox" checked={form.pricePending} onChange={e=>set('pricePending',e.target.checked)}/>Precio pendiente</label>}
   {!advanced&&!form.pricePending&&<div className="row gx-2">
    {packaged&&<div className="col-sm">{price('packPrice','Precio por paquete (MXN)')}</div>}
    {form.saleMode!=='pack'&&<div className="col-sm">{price('piecePrice','Precio por pieza (MXN)')}</div>}
   </div>}
   {advanced&&<>
    <Field label="Unidad de inventario" value={form.unit} onChange={e=>{
     setForm(current=>({...current,unit:e.target.value,minimum:''}));
     setSpecialInitial(emptyProductInitial());
    }}>
     {hardwarePresentationUnits.filter(unit=>unit!=='paquete').map(unit=><option key={unit}>{unit}</option>)}
    </Field>
    {form.presentations.map((row,index)=><section key={row.id} className="border rounded p-2 mb-2" aria-label={`Presentación ${index+1}`}>
     <Field label="Nombre de presentación (opcional)" value={row.name} onChange={e=>changePresentation(index,{name:e.target.value})}/>
     <div className="row gx-2">
      <div className="col-sm"><Field label="Unidad de venta" value={row.unit} onChange={e=>changePresentation(index,{unit:e.target.value})}>
       {hardwarePresentationUnits.map(unit=><option key={unit}>{unit}</option>)}
      </Field></div>
      <div className="col-sm"><Field label={`Contenido en ${baseUnit}`} required type="number" inputMode="decimal" min="0.000001" step="0.000001" value={row.factor} onChange={e=>changePresentation(index,{factor:e.target.value})}/></div>
      {!form.pricePending&&row.saleEnabled!==false&&<div className="col-sm"><Field label="Precio (MXN)" required type="number" inputMode="decimal" min="0.01" step="0.01" value={row.price} onChange={e=>changePresentation(index,{price:e.target.value})}/></div>}
     </div>
     <label className="form-check"><input className="form-check-input" type="checkbox" checked={row.saleEnabled!==false} onChange={e=>changePresentation(index,{saleEnabled:e.target.checked})}/>Disponible para venta</label>
     {form.presentations.length>1&&<button type="button" className="btn btn-sm btn-outline-secondary" onClick={()=>removePresentation(index)}>Quitar presentación</button>}
    </section>)}
    <button type="button" className="btn btn-sm btn-outline-primary mb-2" onClick={()=>set('presentations',[...form.presentations,newPresentation()])}>Agregar presentación</button>
    {canOpen&&<label className="form-check mb-2"><input className="form-check-input" type="checkbox" checked={form.autoOpenPackages===true} onChange={e=>set('autoOpenPackages',e.target.checked)}/>Abrir paquetes para atender piezas</label>}
   </>}
   {number('minimum',`Inventario mínimo (${packaged?'piezas equivalentes':baseUnit}, opcional)`,{step:whole?'1':'0.000001',placeholder:'Sin configurar'})}
   {!purchaseDraft&&(advanced?<InitialInventoryFields value={specialInitial} onChange={setSpecialInitial} unit={baseUnit}
    presentations={form.presentations.map(row=>({...row,baseUnit,integerOnly:whole||wholeSaleUnit(row.unit)}))}/>:<>
   <label className="form-check mb-2"><input className="form-check-input" type="checkbox" checked={form.initialEnabled} onChange={e=>set('initialEnabled',e.target.checked)}/>Registrar inventario inicial</label>
   {form.initialEnabled&&(packaged?<>
    <div className="row gx-2">
     <div className="col-sm">{number('closedPackages','Paquetes completos',{required:true})}</div>
     <div className="col-sm">{number('looseUnits','Piezas sueltas',{required:true})}</div>
     <div className="col-sm">{number('openPackages','Paquetes abiertos',{required:true})}</div>
    </div>
    {open&&number('openPackagePieces','Piezas restantes en los paquetes abiertos',{min:'1',required:true})}
    <p className="form-text">Total equivalente: {Number(form.closedPackages||0)*Number(form.packSize||0)+Number(form.looseUnits||0)+(open?Number(form.openPackagePieces||0):0)} piezas</p>
   </>:number('quantity',`Cantidad inicial (${baseUnit})`,{step:whole?'1':'0.000001',required:true}))}
   </>)}
   <Feedback message={error}/>
  </fieldset>
 </AppModal>;
}
