import {FieldError,RequiredMark} from './FormLabel';
import {money} from '../utils/salesUtils.js';
import {unitCostText} from '../utils/purchaseUtils.js';

export function PurchaseLines({children,showKnownCost=true}){
 return <div className="table-responsive sale-items"><table className="table align-middle small">
  <thead><tr><th>Artículo comprado / producto final</th><th>Cantidad<RequiredMark /></th>{showKnownCost&&<th>Costo conocido</th>}<th>Valor</th><th>Importe<RequiredMark /></th><th>Costo total</th><th aria-label="Acciones" /></tr></thead>
  {children}
 </table></div>;
}

export function PurchaseLineGroup({name,style,children,columnCount=7}){
 return <tbody><tr className="sale-group-heading"><th scope="rowgroup" colSpan={columnCount} style={style}>{name}</th></tr>{children}</tbody>;
}

export function PurchaseLineQuantity({id,name,unit,value,onChange,min='0',step='any'}){
 const inputId='purchase-quantity-'+id;
 return <><div className="input-group flex-nowrap" style={{width:'max-content'}}>
  <input id={inputId} data-inline-error="true" aria-label={'Cantidad de '+name} style={{width:'calc(5ch + 2.5rem)',flex:'0 0 auto'}} required aria-required="true" className="form-control" type="number" min={min} data-positive="true" step={step} placeholder="Cantidad" value={value} onChange={event=>onChange(event.target.value)}/>
  <span className="input-group-text">{unit}</span>
 </div><FieldError id={inputId}/></>;
}

export function PurchaseLineCostMode({id,name,value,onChange}){
 return <div className="d-flex flex-nowrap align-items-center gap-3" role="group" aria-label={'Tipo de costo de '+name}>
  {[['total','Total'],['unit','Unitario']].map(([mode,label])=><label key={mode} className="sale-entry-checkbox">
   <input type="radio" name={'purchase-mode-'+id} className="form-check-input" checked={value===mode} onChange={()=>onChange(mode)}/>
   <span>{label}</span>
  </label>)}
 </div>;
}

export function PurchaseLineCost({id,name,mode,value,onChange,min='0',step=mode==='total'?'0.01':'any'}){
 const inputId='purchase-cost-'+id;
 return <><input id={inputId} data-inline-error="true" aria-label={`Costo ${mode==='total'?'total':'unitario'} de ${name}`} style={{width:'calc(5ch + 2.5rem)'}} required aria-required="true" className="form-control" type="number" min={min} step={step} value={value} onChange={event=>onChange(event.target.value)}/>
  <FieldError id={inputId}/>
 </>;
}

export function PurchaseLineTotal({total,unitCost,unit}){
 return total==null?'—':<><strong>{money(total)}</strong><small className="d-block text-muted">{unitCostText(unitCost)} / {unit}</small></>;
}
