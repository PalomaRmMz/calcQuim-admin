import { cloneElement,useRef,useState } from 'react';
import { Button } from '@mui/material';
import { faBox } from '@fortawesome/free-solid-svg-icons';
import AppModal from './AppModal';
import ConfirmDialog from './ConfirmDialog';
import FormLabel from './FormLabel';
import InventoryReasonFields from './InventoryReasonFields';
import InventoryReasonSummary from './InventoryReasonSummary';
import { emptyInventoryReason,inventoryReasonPayload,movementReasonContext } from '../services/inventoryReasons.js';
import ClassificationBadge from './ClassificationBadge';
import {inventoryMovementClassification} from '../services/inventoryClassification.js';
import { UNITS,normalizeUnit,unitLabel } from '../utils/units.js';
import { getProductDisplayName } from '../utils/catalogUtils.js';
import { inventoryKinds,inventoryStatus } from '../services/inventoryPresentation.js';
import { inventoryDecimal,inventoryText } from '../services/inventoryUnits.js';

function Field({id,label,required=false,children}){
    return <div className="mb-3"><FormLabel htmlFor={id} required={required}>{label}</FormLabel>{cloneElement(children,{id,required,className:children.type==='select'?'form-select':'form-control'})}</div>;
}
export default function InventoryProductModal({product,view,data,categories,productLines,onClose,onSave}){
    const [tab,setTab]=useState(product.quantity===null?'estimate':'movement');
    const [kind,setKind]=useState('prepared'),[quantity,setQuantity]=useState(''),[unit,setUnit]=useState(product.unit);
    const [reason,setReason]=useState(emptyInventoryReason),[occurredAt,setOccurredAt]=useState(''),[baseline,setBaseline]=useState('');
    const [minimum,setMinimum]=useState(product.minimum??''),[batch,setBatch]=useState(product.usualBatch??'');
    const [purchaseId,setPurchaseId]=useState(''),[purchaseOrdinal,setPurchaseOrdinal]=useState(''),[saleId,setSaleId]=useState('');
    const [reverseId,setReverseId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const saving=useRef(false);
    const [initial]=useState(()=>({minimum:product.minimum??'',batch:product.usualBatch??'',unit:product.unit}));
    const [discardAction,setDiscardAction]=useState(null);
    const dirty=kind!=='prepared'||quantity!==''||Object.values(reason).some(Boolean)||occurredAt!==''||baseline!==''||unit!==initial.unit||minimum!==initial.minimum||batch!==initial.batch||purchaseId!==''||saleId!==''||reverseId!=='';
    function leave(action){if(saving.current)return;if(dirty)setDiscardAction(()=>action);else action();}
    const requestClose=()=>leave(onClose);
    const name=getProductDisplayName(product,categories,productLines),movements=view.movements.filter(m=>m.product_id===String(product.productId));
    const purchase=data.procurement.purchases.find(p=>String(p.id)===purchaseId);
    const changes=view.changes.filter(c=>String(c.reference.productId)===String(product.productId));
    function switchTab(next){if(next===tab)return;leave(()=>{setKind('prepared');setMinimum(initial.minimum);setBatch(initial.batch);setPurchaseId('');setPurchaseOrdinal('');setSaleId('');setTab(next);setQuantity('');setReason(emptyInventoryReason());setOccurredAt('');setBaseline('');setReverseId('');setError('');setUnit(product.unit);});}
    const reasonContext=tab==='estimate'?'initial':tab==='initialCorrection'?'initial_correction':tab==='movement'&&kind==='count'?'count':tab==='replenishment'?'replenishment':tab==='history'?'reversal':movementReasonContext(['outflow','positive_adjustment'].includes(kind)?'adjustment':kind,quantity,kind==='outflow'?{entryType:'justified_outflow'}:kind==='positive_adjustment'?{entryType:'positive_adjustment'}:null);
    async function submit(){
        if(saving.current)return;saving.current=true;setBusy(true);setError('');
        let committed=false;
        try{
            let command,input;
            if(tab==='replenishment'){command='inventoryReplenishment';input={productId:product.productId,unit:product.unit,minimum,usualBatch:batch,reason};}
            else if(tab==='initialCorrection'){command='inventoryCorrectInitial';input={productId:product.productId,initialMovementId:product.initialMovementId,previousQuantity:product.initialQuantity,quantity,unit:product.unit};}
            else if(tab==='history'){command='inventoryReverse';input={movementId:reverseId,reason,baselineTreatment:baseline};}
            else {
                const movementKind=tab==='estimate'||kind==='count'?'estimate':['outflow','positive_adjustment','waste'].includes(kind)?(kind==='waste'?'waste':'adjustment'):kind;
                command=tab==='estimate'?'inventoryInitial':kind==='count'?'inventoryCount':'inventoryMovement';
                input={productId:product.productId,kind:movementKind,quantity,unit,reason,baselineTreatment:baseline};
                if(tab==='movement'&&['outflow','waste'].includes(kind)){
                    const amount=inventoryDecimal(quantity);if(amount<=0n)throw new Error('Indica una cantidad de salida positiva.');
                    input.quantity=inventoryText(-amount);if(kind==='outflow')input.reference={entryType:'justified_outflow'};
                }
                if(tab==='movement'&&kind==='positive_adjustment'){if(inventoryDecimal(quantity)<=0n)throw new Error('Indica una cantidad de entrada positiva.');input.reference={entryType:'positive_adjustment'};}
                if(tab!=='estimate'&&kind!=='count'&&occurredAt)input.occurredAt=new Date(occurredAt).toISOString();
                if(movementKind==='receipt'&&purchaseId){input.purchaseId=purchaseId;input.purchaseOrdinal=Number(purchaseOrdinal);}
                if(movementKind==='return')input.saleId=saleId;
            }
            input={...input,...inventoryReasonPayload(tab==='estimate'?{...reason,reasonCode:'initial_inventory',reasonExplanation:''}:tab==='initialCorrection'?{...reason,reasonCode:'initial_correction',reasonExplanation:''}:reason,reasonContext)};
            const result=await onSave(command,input);
            if(!result.ok)throw new Error(result.message||'No se pudo guardar en PostgreSQL.');
            committed=true;onClose();
        }catch(e){setError(e.message);}finally{if(!committed){saving.current=false;setBusy(false);}}
    }
    const baselineField=<Field id="inventory-baseline" label="Relación con la última estimación"><select value={baseline} onChange={e=>setBaseline(e.target.value)}><option value="">Sin confirmar (solo necesario para operaciones anteriores)</option><option value="already_included">Ya estaba incluido: no volver a sumar o restar</option><option value="apply_now">Debe aplicarse ahora al saldo</option></select></Field>;
    const reasonField=tab==='estimate'||tab==='initialCorrection'?<><p>{tab==='estimate'?'Clasificaci\u00f3n: INVENTARIO_INICIAL':'Motivo: Correcci\u00f3n de inventario inicial'}</p><Field id="inventory-observations" label="Observaciones (opcional)"><textarea maxLength={2000} value={reason.observations} onChange={e=>setReason({...reason,observations:e.target.value})}/></Field></>:<InventoryReasonFields context={reasonContext} value={reason} onChange={setReason} disabled={busy}/>;
    const canSubmit=(tab!=='history'||!!reverseId)&&(tab!=='estimate'||(!product.initialMovementId&&view.initialCaptureMode==='automatic'))&&(tab!=='initialCorrection'||(product.initialCorrectionAllowed&&view.initialCaptureMode==='automatic'))&&!(tab==='movement'&&kind==='count'&&(!product.initialMovementId||view.initialCaptureMode!=='automatic'));
    const submitLabel=tab==='estimate'?'Registrar inventario inicial':tab==='initialCorrection'?'Guardar corrección del inicial':tab==='movement'&&kind==='count'?'Guardar conteo físico':tab==='replenishment'?'Guardar reposición':tab==='history'?'Registrar compensación':'Registrar movimiento';
    return <><AppModal title={`Inventario · ${name}`} subtitle="Existencia aproximada y movimientos del producto" icon={faBox} maxWidth="md" onClose={requestClose} onSubmit={canSubmit?submit:undefined} actions={<><Button color="inherit" disabled={busy} onClick={requestClose}>Cerrar</Button>{canSubmit&&<Button type="submit" variant="contained" disableElevation disabled={busy}>{busy?'Guardando…':submitLabel}</Button>}</>}>
        <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <ClassificationBadge product={product} categories={categories} productLines={productLines}/>
        <div className="inventory-stock-summary mt-3" role="status"><span>Saldo aproximado actual</span><strong>{product.quantity===null?'Sin determinar':`${product.quantity} ${unitLabel(product.unit)}`}</strong><small>{inventoryStatus[product.status]}</small>{product.negative&&<p className="text-danger mb-0">Saldo negativo: revisa la estimación.</p>}{product.low&&<p className="text-warning mb-0">En punto de reposición.</p>}</div>
        <p className="mt-2">Inventario inicial: <strong>{product.initialQuantity==null?'Sin determinar':`${product.initialQuantity} ${unitLabel(product.unit)}`}</strong>{product.initialMovementId&&<small className="d-block">Inicial registrado · Original: {product.initialOriginalQuantity} {unitLabel(product.unit)}</small>}</p>
        {view.initialCaptureMode!=='automatic'&&<p className="alert alert-warning">La separación del inventario inicial está pendiente de recargar Express. No captures correcciones hasta su activación.</p>}
        {!product.initialMovementId&&<h3 className="h6 mt-3">Registrar inventario inicial</h3>}{product.initialMovementId&&<nav className="inventory-modal-tabs page-tabs" aria-label="Ficha de inventario">{(product.initialMovementId?[['estimate','Inventario inicial'],['movement','Movimientos'],['initialCorrection','Correcciones'],['history','Historial'],['replenishment','Reposici\u00f3n']]:[['estimate','Registrar inventario inicial']]).map(([id,label])=><button type="button" key={id} className={`btn btn-sm ${tab===id?'btn-primary':'btn-outline-secondary'}`} aria-current={tab===id?'page':undefined} disabled={busy} onClick={()=>switchTab(id)}>{label}</button>)}</nav>}
        {error&&<p className="alert alert-danger" role="alert">{error}</p>}
        {tab==='estimate'&&product.initialMovementId?<p>El inventario inicial ya está registrado. Para corregir un error utiliza Correcciones. Para actualizar el saldo actual utiliza Movimientos / Conteo físico.</p>:(tab==='estimate'||tab==='movement')&&<>
            {tab==='estimate'?<p>Registra una sola vez el punto de partida aproximado. No es una entrada. Vacío significa sin determinar; cero se registra únicamente si lo capturas expresamente.</p>:<Field id="inventory-kind" label="Tipo de movimiento" required><select value={kind} onChange={e=>{setKind(e.target.value);setReason(emptyInventoryReason());setQuantity('');setPurchaseId('');setPurchaseOrdinal('');setSaleId('');setBaseline('');setOccurredAt('');}}>{Object.entries(inventoryKinds).filter(([k])=>!['estimate','sale','reversal'].includes(k)).map(([id,label])=><option key={id} value={id}>{label}</option>)}<option value="count">Conteo físico del saldo actual</option><option value="positive_adjustment">Ajuste positivo (entrada)</option><option value="outflow">Salida justificada</option></select></Field>}
            <div className="row"><div className="col-sm-7"><Field id="inventory-quantity" label="Cantidad" required><input type="number" min={tab==='estimate'||kind==='count'?'0':['prepared','receipt','outflow','waste','positive_adjustment','return'].includes(kind)?'0.000001':undefined} step="0.000001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field></div><div className="col-sm-5"><Field id="inventory-unit" label="Unidad" required><select value={unit} onChange={e=>setUnit(e.target.value)}>{UNITS.map(u=><option value={u.id} key={u.id}>{u.label}</option>)}</select></Field></div></div>
            {tab==='movement'&&kind==='waste'&&<p>Indica la cantidad positiva perdida. Se restará del saldo actual.</p>}
            {tab==='movement'&&kind==='outflow'&&<p>Indica la cantidad positiva que sale. Se guardará como un ajuste negativo con el motivo indicado.</p>}
            {tab==='movement'&&kind==='receipt'&&<><Field id="inventory-purchase" label="Compra de origen (opcional)"><select value={purchaseId} onChange={e=>{setPurchaseId(e.target.value);setPurchaseOrdinal('');}}><option value="">Recepción manual sin compra relacionada</option>{data.procurement.purchases.filter(p=>!p.voidedAt).map(p=><option key={p.id} value={p.id}>{p.date} · {p.reference||p.id}</option>)}</select></Field>{purchase&&<Field id="inventory-purchase-item" label="Renglón recibido" required><select value={purchaseOrdinal} onChange={e=>setPurchaseOrdinal(e.target.value)}><option value="">Selecciona</option>{purchase.items.map((item,i)=><option key={i} value={i}>Renglón {i+1} · {item.quantity} {item.unit}</option>)}</select></Field>}<p>Confirma el terminado recibido. Una compra de base o concentrado no se convierte automáticamente en producto terminado.</p></>}
            {tab==='movement'&&kind==='return'&&<Field id="inventory-sale" label="Venta de origen" required><select value={saleId} onChange={e=>setSaleId(e.target.value)}><option value="">Selecciona</option>{data.sales.map(s=><option key={s.id} value={s.id}>{s.folio} · {s.date}</option>)}</select></Field>}
            {tab==='movement'&&kind==='count'&&<p>Captura lo que hay ahora, no una diferencia. El conteo ajusta el saldo actual y conserva el inventario inicial.</p>}
            {tab==='movement'&&kind!=='count'&&<><Field id="inventory-date" label="Fecha del movimiento (vacío: ahora)"><input type="datetime-local" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)}/></Field>{baselineField}</>}{reasonField}
        </>}
        {tab==='initialCorrection'&&<>
            {!product.initialMovementId?<p>Registra primero el inventario inicial.</p>:<>
                <p>Original registrado: {product.initialOriginalQuantity} {unitLabel(product.unit)} · Inicial vigente: {product.initialQuantity} {unitLabel(product.unit)}</p>
                {!product.initialCorrectionAllowed?<p role="alert" className="alert alert-warning">{product.initialCorrectionBlockedReason}</p>:<>
                    <Field id="inventory-initial-correction" label="Nuevo inventario inicial aproximado" required><input type="number" min="0" step="0.000001" value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field>
                    <InitialCorrectionPreview quantity={quantity} product={product}/>
                    <p>Se conserva el registro original y todos los movimientos posteriores. La diferencia no se registra como entrada, venta ni merma.</p>{reasonField}
                </>}
            </>}
        </>}
        {tab==='replenishment'&&<><p>Unidad: {unitLabel(product.unit)}. El lote habitual no es una existencia máxima. Vacío significa sin configurar.</p><Field id="inventory-minimum" label="Punto de reposición"><input type="number" min="0" step="0.000001" value={minimum} onChange={e=>setMinimum(e.target.value)}/></Field>{normalizeUnit(product.unit)==='litro'&&<button type="button" className="btn btn-link mb-3" onClick={()=>setMinimum('5')}>Usar sugerencia de 5 L</button>}<Field id="inventory-batch" label="Lote habitual"><input type="number" min="0.000001" step="0.000001" value={batch} onChange={e=>setBatch(e.target.value)}/></Field>{reasonField}</>}
        {tab==='history'&&<>
            {!movements.length?<p>No hay movimientos registrados para este producto.</p>:<div className="table-responsive"><table className="table"><thead><tr><th>Fecha</th><th>Movimiento</th><th>Cantidad</th><th>Motivo / origen</th><th>Corrección</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{new Date(m.occurred_at).toLocaleString('es-MX')}</td><td>{m.kind==='estimate'?(m.id===product.initialMovementId?'Inventario inicial':'Conteo / estimación posterior'):m.reference.userReference?.entryType==='justified_outflow'?'Salida justificada':inventoryKinds[m.kind]}<small className="d-block">{m.certainty==='estimated'?'Estimado':'Confirmado'}</small></td><td>{m.quantity} {unitLabel(m.unit)}</td><td>{inventoryMovementClassification(m,view.changes)&&<small className="d-block">Clasificación: {inventoryMovementClassification(m,view.changes)}</small>}<InventoryReasonSummary reference={m.reference} legacyReason={m.reason}/>{m.reference.includedInAnchorId&&<small className="d-block">Ya incluido en estimación: sin doble efecto</small>}{m.sale_id&&<small className="d-block">Venta {data.sales.find(s=>String(s.id)===m.sale_id)?.folio}</small>}{m.purchase_id&&<small className="d-block">Compra {data.procurement.purchases.find(p=>String(p.id)===m.purchase_id)?.date}</small>}</td><td>{!['estimate','sale','reversal'].includes(m.kind)&&!movements.some(r=>r.reversal_of===m.id)&&<button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy} onClick={()=>{setReverseId(m.id);setReason(emptyInventoryReason());setBaseline('');setError('');}}>Compensar movimiento</button>}</td></tr>)}</tbody></table></div>}
            {reverseId&&<section className="batch-review"><h3 className="h6">Compensar movimiento seleccionado</h3>{reasonField}{baselineField}<button type="button" className="btn btn-link" onClick={()=>setReverseId('')}>Cancelar compensación</button></section>}
            <h3 className="h6 mt-3">Correcciones del inventario inicial</h3>{changes.filter(c=>c.action==='initial_correction').map(c=><p key={c.seq}>{new Date(c.recorded_at).toLocaleString('es-MX')} | {c.reference.previousQuantity} a {c.reference.nextQuantity} {unitLabel(product.unit)} | Diferencia: {c.reference.difference} | <InventoryReasonSummary reference={c.reference} legacyReason={c.reference.reason}/></p>)}
            <h3 className="h6 mt-3">Historial de reposición</h3>{changes.filter(c=>c.action==='replenishment').map(c=><p key={c.seq}>{new Date(c.recorded_at).toLocaleString('es-MX')} · Punto: {c.reference.next.minimum??'Sin configurar'} · Lote: {c.reference.next.batch??'Sin configurar'} {unitLabel(c.reference.next.unit)} · <InventoryReasonSummary reference={c.reference} legacyReason={c.reference.reason}/></p>)}
            <p className="text-muted">El inicial se corrige desde Correcciones. Los conteos posteriores ajustan solamente el saldo actual. Las salidas por venta se corrigen mediante su anulación o devolución física confirmada.</p>
        </>}
        </fieldset>
    </AppModal>{discardAction&&<ConfirmDialog title="Descartar cambios" confirmText="Descartar" onClose={()=>setDiscardAction(null)} onConfirm={()=>{discardAction();}}>Hay cambios sin guardar. ¿Quieres descartarlos?</ConfirmDialog>}</>;
}

function InitialCorrectionPreview({quantity,product}){
    if(quantity==='')return <p>Captura el valor corregido para ver la diferencia.</p>;
    let difference,result;
    try{difference=inventoryDecimal(quantity)-inventoryDecimal(product.initialQuantity);result=inventoryText(inventoryDecimal(product.quantity)+difference);}catch{return <p>Revisa la cantidad.</p>;}
    return <p role="status">Inicial anterior: {product.initialQuantity} → Nuevo: {quantity} · Diferencia: {inventoryText(difference)} · Saldo actual resultante: {result} {unitLabel(product.unit)}</p>;
}
