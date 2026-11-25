import '../styles/components/SupplyInventoryModal.css';
import {useMemo,useState} from 'react';
import AppModal from './AppModal';
import ContentPanel from './ContentPanel';
import DataTable from './DataTable';
import ValidatedForm from './ValidatedForm';
import {Field} from './ProcurementFields';
import {supplyInventoryHistory,supplyInventoryRows,supplyStates,supplyTypes} from '../domain/supplyInventoryView.mjs';
import {SOURCING_TYPES} from '../utils/procurementUtils.js';
import {normalizeText} from '../utils/catalogUtils.js';
import {unitLabel} from '../utils/units.js';
import {money} from '../utils/salesUtils.js';

const dateFormat=new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short',timeZone:'America/Mexico_City'});
const stateLabels={empty:'Agotados',low:'Bajos',sufficient:'Suficientes',unknown:'Sin inventario configurado',unconfigured:'Sin mínimo configurado'};
const numberField={required:true,type:'number',min:'0',step:'1'};
const fieldOptions=values=>values.map(([id,label])=><option key={id} value={id}>{label}</option>);

function costLabel(cost){
  if(cost?.price==null||cost.priceQuantity==null||!cost.priceUnit)return 'Sin costo registrado';
  return <>{money(cost.price)} / {cost.priceQuantity} {unitLabel(cost.priceUnit)}<small className="d-block text-muted">{cost.source} · {cost.date}{cost.expired?' · Vencido':''}</small></>;
}

export default function SupplyInventoryPanel({data,inventory,params,onChange,busy,error,onSave}){
  const rows=useMemo(()=>supplyInventoryRows(data,inventory),[data,inventory]);
  const [action,setAction]=useState(null);
  const [draft,setDraft]=useState({});
  const selected=rows.find(row=>row.id===params.get('insumo'));
  const minimumsEnabled=Boolean(inventory.policy?.policy?.supplyMinimums);
  const state=params.get('estado')||'';
  const type=params.get('tipo')||'';
  const supplier=params.get('proveedor')||'';
  const product=params.get('producto')||'';
  const query=params.get('buscar')||'';
  const visible=rows.filter(row=>(!state||state===row.state)&&(!type||type===row.sourcingType)&&
    (!supplier||row.sources.some(source=>String(source.supplierId)===supplier))&&
    (!product||row.outputs.some(link=>String(link.outputProductId)===product))&&normalizeText(row.name).includes(normalizeText(query.trim())));
  const suppliers=[...new Map(rows.flatMap(row=>row.sources.map(source=>[source.supplierId,source.supplierName])))].sort((a,b)=>a[1].localeCompare(b[1],'es'));
  const products=[...new Map(rows.flatMap(row=>row.outputs.map(link=>[link.outputProductId,link.name])))].sort((a,b)=>a[1].localeCompare(b[1],'es'));
  const eligibleSources=selected?.sources.filter(source=>source.eligible)??[];
  const eligibleOutputs=selected?.outputs.filter(output=>output.active)??[];
  const packageUnit=selected?.stock?.packageLabel?'envases':'botellas';
  const start=command=>{
    setAction(command);
    setDraft({expectedVersion:selected.stock?.version,previousClosed:selected.stock?.closed,closed:selected.stock?.closed??'',
      sourceId:eligibleSources[0]?.id??'',outputProductId:eligibleOutputs.length===1?String(eligibleOutputs[0].outputProductId):'',
      minimum:selected.minimum??'',reason:''});
  };
  const field=(key,label,options={})=><Field label={label} value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value,...(key==='closed'?{zeroConfirmed:false}:{})})} {...options}/>;
  const initial=action==='enableSupplyInventory';
  const confirmZero=initial&&String(draft.closed??'').trim()!==''&&Number(draft.closed)===0;
  async function submit(){
    const input=action==='configureSupplyMinimum'?
      {purchasedItemId:selected.id,minimum:draft.minimum}:
      {...draft,confirmed:initial&&(!confirmZero||draft.zeroConfirmed===true),purchasedItemId:selected.id,unit:action==='prepareFromSupplyInventory'?(selected.stock.outputUnit??'litro'):'litro'};
    if(await onSave(action,input))setAction(null);
  }
  const difference=draft.previousClosed!=null&&/^\d+$/.test(draft.closed??'')?BigInt(draft.closed)-BigInt(draft.previousClosed):null;
  const columns=[
    {accessorKey:'name',header:'Insumo'},
    {id:'type',header:'Tipo',accessorFn:row=>SOURCING_TYPES[row.sourcingType]},
    {id:'sources',header:'Proveedor y presentación',accessorFn:row=>row.sources.map(s=>s.supplierName+' · '+s.presentationText).join(' / ')||'Sin proveedor configurado',Cell:({row,cell})=>row.original.sources.length?row.original.sources.map(s=><div key={s.id} className="mb-2">{s.supplierName}{!s.active?' (inactivo)':''}<small className="d-block">{s.presentationText}</small></div>):cell.getValue()},
    {id:'cost',header:'Costo de adquisición',enableSorting:false,Cell:({row})=>row.original.sources.length?row.original.sources.map(s=><div key={s.id} className="mb-2">{row.original.sources.length>1&&<small className="d-block">{s.supplierName}</small>}{costLabel(s.cost)}</div>):'Sin costo registrado'},
    {id:'outputs',header:'Producto final y rendimiento',accessorFn:row=>row.outputs.map(link=>link.name).join(', ')||'Sin producto vinculado',Cell:({row,cell})=>row.original.outputs.length?row.original.outputs.map(link=><div key={link.id}>{link.name}{!link.active?' (inactivo)':''}<small className="d-block">{link.expected}</small>{link.overrides.map(o=><small className="d-block" key={o.id}>{o.supplier} · {o.expected}</small>)}</div>):cell.getValue()},
    {id:'stock',header:'Existencia física',accessorFn:row=>row.stock?row.stock.closed+(row.stock.packageLabel?' envases':' botellas'):'Desconocida · '+unitLabel(row.unit)},
    {id:'minimum',header:'Mínimo',accessorFn:row=>row.minimum==null?'Sin configurar':row.minimum+' envases'},
    {id:'state',header:'Estado',accessorFn:row=>supplyStates[row.state]},
    {id:'actions',header:'Acciones',enableSorting:false,Cell:({row})=><button type="button" className="btn btn-outline-primary btn-sm" aria-label={'Ver detalle de '+row.original.name} onClick={()=>{setAction(null);onChange('insumo',row.original.id);}}>Ver detalle</button>},
  ];
  const history=selected?supplyInventoryHistory(selected,inventory,data):[];
  return <>
    <section className="inventory-overview" aria-label="Resumen de insumos">
      {Object.entries(stateLabels).map(([key,label])=><button key={key} type="button" className={`inventory-summary-card inventory-summary-${key}${state===key?' active':''}`} aria-pressed={state===key} onClick={()=>onChange('estado',state===key?'':key)}><strong>{rows.filter(row=>row.state===key).length}</strong><span>{label}</span></button>)}
    </section>
    <ContentPanel title="Insumos" subtitle={`${visible.length} de ${rows.length} insumos`}>
      <div className="inventory-filters">
        <Field label="Buscar insumo" type="search" value={query} onChange={e=>onChange('buscar',e.target.value)}/>
        <Field label="Tipo de insumo" value={type} onChange={e=>onChange('tipo',e.target.value)}><option value="">Todos</option>{fieldOptions(supplyTypes.map(id=>[id,SOURCING_TYPES[id]]))}</Field>
        <Field label="Proveedor" value={supplier} onChange={e=>onChange('proveedor',e.target.value)}><option value="">Todos</option>{fieldOptions(suppliers)}</Field>
        <Field label="Estado del inventario" value={state} onChange={e=>onChange('estado',e.target.value)}><option value="">Todos</option>{fieldOptions(Object.entries(supplyStates))}</Field>
        <Field label="Producto final" value={product} onChange={e=>onChange('producto',e.target.value)}><option value="">Todos</option>{fieldOptions(products)}</Field>
      </div>
      <DataTable data={visible} columns={columns} getRowId={row=>row.id} mobileCards enableGlobalFilter={false}/>
    </ContentPanel>
    {selected&&<AppModal title={selected.name} maxWidth="md" actions={action?<>
      <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={()=>setAction(null)}>Cancelar</button>
      <button type="submit" form="supply-inventory-form" className="btn btn-primary" disabled={busy}>Guardar</button>
    </>:undefined} onClose={()=>{if(!busy){setAction(null);onChange('insumo','');}}}>
      <div className="supply-modal-content">
      <div className="supply-modal-summary"><p><strong>{selected.stock?`${selected.stock.closed} ${packageUnit} de ${selected.stock.bottleLiters} L · ${supplyStates[selected.state]}`:'Existencia desconocida · Sin inventario configurado'}</strong></p>
      <p>Mínimo {selected.minimum==null?'sin configurar':selected.minimum+' envases completos'}</p>
      {selected.sale&&<p>Venta directa {money(selected.sale.price)} por {unitLabel(selected.sale.unit)}</p>}
      </div>
      {selected.formatPending&&<p>Define la presentación física en Abastecimiento antes de convertir el mínimo a una unidad de inventario.</p>}
      <section className="supply-modal-context">
        <div><h3>Proveedores y presentaciones</h3>
        {selected.sources.length?<ul>{selected.sources.map(source=><li key={source.id}>{source.supplierName} · {source.presentationText}{!source.active?' (inactivo)':''}</li>)}</ul>:<p>Sin proveedor configurado.</p>}
        </div><div><h3>Producto final y rendimiento</h3>
        {selected.outputs.length?<ul>{selected.outputs.map(output=><li key={output.id}>{output.name} · {output.expected}{!output.active?' (inactivo)':''}</li>)}</ul>:<p>Sin producto final vinculado.</p>}
        </div>
      </section>
      {!action&&<div className="supply-modal-buttons">
        {minimumsEnabled&&<button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>start('configureSupplyMinimum')}>Configurar mínimo</button>}
      {!selected.stock&&(inventory.supplyActivationEnabled&&selected.active&&eligibleSources.length>0&&eligibleOutputs.length>0?
        <button type="button" className="btn btn-primary" onClick={()=>start('enableSupplyInventory')}>Registrar inventario inicial</button>:
        <p>{inventory.supplyActivationEnabled?'Se requiere un insumo activo con presentación y producto final configurados.':'Habilitación de otras cuentas pendiente de actualización del servidor y migración 017.'}</p>)}
      {selected.stock&&<>
        {[['countSupplyInventory','Registrar conteo físico'],['prepareFromSupplyInventory','Elaborar'],['returnSupplyInventory','Registrar devolución']].map(([command,label])=><button key={command} type="button" className="btn btn-outline-primary btn-sm" onClick={()=>start(command)}>{label}</button>)}
      </>}
      </div>}
      {action&&(selected.stock||action==='enableSupplyInventory'||action==='configureSupplyMinimum')&&<ValidatedForm id="supply-inventory-form" className="supply-modal-form" onSubmit={submit}><fieldset disabled={busy}>
        {initial&&<>
          <div className="supply-modal-selectors"><Field label="Presentación del conteo" required value={draft.sourceId} onChange={e=>setDraft({...draft,sourceId:e.target.value})}>{fieldOptions(eligibleSources.map(source=>[source.id,source.supplierName+' · '+source.presentationText]))}</Field>
          <Field label="Producto final" required value={draft.outputProductId} onChange={e=>setDraft({...draft,outputProductId:e.target.value})}><option value="">Selecciona un producto final</option>{fieldOptions(eligibleOutputs.map(output=>[output.outputProductId,output.name]))}</Field></div>
          <div className="supply-modal-quantity">{field('closed','Envases completos contados',numberField)}</div>
          {confirmZero&&<label className="supply-modal-confirm"><input type="checkbox" required checked={draft.zeroConfirmed===true} onChange={e=>setDraft({...draft,zeroConfirmed:e.target.checked})}/> Confirmo que el inventario inicial es de cero envases.</label>}
        </>}
        {action==='countSupplyInventory'&&<>
          <div className="supply-modal-count">
            <div className="supply-modal-quantity">{field('closed',selected.stock.packageLabel?'Envases contados':'Botellas contadas',numberField)}</div>
            <div><p>Saldo anterior {draft.previousClosed} {packageUnit}</p>
              <p>Diferencia prevista {difference===null?'—':difference>0n?'+'+difference:String(difference)}</p></div>
          </div>
        </>}
        {action==='configureSupplyMinimum'&&<div className="supply-modal-quantity">{field('minimum','Mínimo de envases completos',numberField)}</div>}
        {action==='prepareFromSupplyInventory'&&<>
          {field('inputPackages',selected.stock.packageLabel?'Envases completos utilizados':'Botellas de 1 litro utilizadas',{...numberField,min:'1'})}
          {field('quantity','Producto terminado obtenido ('+unitLabel(selected.stock.outputUnit??'litro')+')',{...numberField,min:'0.000001',step:'0.000001'})}
        </>}
        {action==='returnSupplyInventory'&&<>
          <Field label="Venta original" required value={draft.saleId??''} onChange={e=>setDraft({...draft,saleId:e.target.value})}><option value="">Selecciona una venta</option>{fieldOptions(data.sales.filter(s=>s.items.some(i=>String(i.productId)===String(selected.stock.productId))).map(s=>[s.id,s.folio+' / '+s.date]))}</Field>
          <Field label="Condición física confirmada" required value={draft.disposition??''} onChange={e=>setDraft({...draft,disposition:e.target.value})}><option value="">Selecciona la condición</option><option value="sealed">Botella original cerrada</option></Field>
          {field('quantity','Botellas devueltas',{...numberField,min:'1'})}
        </>}
        {action!=='configureSupplyMinimum'&&<div className="supply-modal-reason">{field('reason','Motivo y evidencia',{required:true,maxLength:1000})}</div>}
        {error&&<p role="alert" className="alert alert-danger">{error}</p>}
      </fieldset></ValidatedForm>}
      {selected.stock&&!action&&<section className="supply-modal-history">
        <h3>Historial de movimientos</h3>
        {history.length?<table className="supply-history-table">
          <thead><tr><th scope="col">Fecha</th><th scope="col">Movimiento</th><th scope="col">Cantidad</th><th scope="col">Referencia</th><th scope="col">Motivo</th></tr></thead>
          <tbody>{history.map(row=><tr key={row.id}>
            <td>{dateFormat.format(new Date(row.date))}</td><td>{row.type}</td>
            <td>{row.quantity} {unitLabel(row.unit)}</td><td>{row.reference}</td><td>{row.reason}</td>
          </tr>)}</tbody>
        </table>:<p>Sin movimientos registrados.</p>}
      </section>}
      </div>
    </AppModal>}
  </>;
}
