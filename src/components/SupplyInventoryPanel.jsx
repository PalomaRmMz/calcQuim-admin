import {useState} from 'react';
import AppModal from './AppModal';
import ContentPanel from './ContentPanel';
import ValidatedForm from './ValidatedForm';
import {Field} from './ProcurementFields';

export default function SupplyInventoryPanel({supplies,sales,busy,error,onSave}){
  const [selected,setSelected]=useState(null);
  const [action,setAction]=useState('countSupplyInventory');
  const [draft,setDraft]=useState({});
  const supply=supplies.find(row=>row.purchasedItemId===selected);
  const start=(row,command)=>{
    setSelected(row.purchasedItemId);
    setAction(command);
    setDraft({expectedVersion:row.version,closed:row.closed,inputLiters:'',quantity:'',saleId:'',disposition:'',reason:''});
  };
  const field=(key,label,options={})=><Field label={label} value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})} {...options}/>;
  const decimal={required:true,type:'number',min:'0',step:'0.000001'};
  async function submit(){
    const ok=await onSave(action,{...draft,purchasedItemId:selected,unit:'litro'});
    if(ok)setSelected(null);
  }
  return <ContentPanel title="Insumos">
    <div className="table-responsive"><table className="table">
      <thead><tr><th>Insumo</th><th>Botellas de 1 litro</th><th>Acciones</th></tr></thead>
      <tbody>{supplies.map(row=><tr key={row.purchasedItemId}>
        <td>{row.name}</td><td>{row.closed}</td>
        <td className="d-flex gap-2 flex-wrap">
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>start(row,'countSupplyInventory')}>Registrar conteo</button>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>start(row,'prepareFromSupplyInventory')}>Elaborar</button>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>start(row,'returnSupplyInventory')}>Registrar devoluci&oacute;n</button>
        </td>
      </tr>)}</tbody>
    </table></div>
    {supply&&<AppModal title={supply.name} onClose={()=>setSelected(null)}>
      <ValidatedForm onSubmit={submit}><fieldset disabled={busy}>
        {action==='countSupplyInventory'&&<>
          {field('closed','Botellas cerradas',{...decimal,step:'1'})}
        </>}
        {action==='prepareFromSupplyInventory'&&<>
          {field('inputLiters','Botellas de 1 litro utilizadas',{...decimal,min:'1',step:'1'})}
          {field('quantity','Producto terminado obtenido (litros)',{...decimal,min:decimal.step})}
        </>}
        {action==='returnSupplyInventory'&&<>
          <Field label="Venta original" required value={draft.saleId} onChange={e=>setDraft({...draft,saleId:e.target.value})}>
            <option value="">Selecciona una venta</option>
            {sales.filter(s=>s.items.some(i=>String(i.productId)===supply.productId)).map(s=><option key={s.id} value={s.id}>{s.folio} / {s.date}</option>)}
          </Field>
          <Field label="Condici&oacute;n f&iacute;sica confirmada" required value={draft.disposition} onChange={e=>setDraft({...draft,disposition:e.target.value})}>
            <option value="">Selecciona la condici&oacute;n</option>
            <option value="sealed">Botella original cerrada</option>
          </Field>
          {field('quantity','Botellas de 1 litro devueltas',{...decimal,min:'1',step:'1'})}
        </>}
        {field('reason','Motivo y evidencia',{required:true,maxLength:1000})}
        {error&&<p role="alert" className="alert alert-danger">{error}</p>}
        <button type="submit" className="btn btn-primary mt-3">Guardar</button>
      </fieldset></ValidatedForm>
    </AppModal>}
  </ContentPanel>;
}
