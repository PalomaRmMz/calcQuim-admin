import {quantityLabel} from '../utils/salesUtils.js';
import { categoryStyle } from '../utils/categoryColors.js';
import { getProductDisplayName } from '../utils/catalogUtils.js';
import { unitLabel } from '../utils/units.js';
import { inventoryStatus } from '../services/inventoryPresentation.js';
import DataTable from './DataTable';
import InventoryShoppingList from './InventoryShoppingList';
import '../styles/components/Inventory.css';
import {inventoryAttention,packDescription} from '../domain/inventoryAttention.mjs';

export default function InventoryProductList({rows,catalogRows,categories,productLines,onSelect,activity='LIMPIEZA',presentations=[],packs=[]}){
    // Mismo orden y configuración inicial que ProductsPage, sin agrupación visual.
    const products=rows.map(p=>({...p,id:p.productId})).sort((a,b)=>getProductDisplayName(a,categories,productLines).localeCompare(getProductDisplayName(b,categories,productLines),'es'));
    const displayUnit=p=>presentations.some(r=>String(r.productId)===String(p.productId)&&r.active&&r.key==='rollo'&&Number(r.factor)===1)?'rollo':p.unit;
    const category=p=>categories.find(c=>String(c.id)===String(activity==='JARCERIA'?p.hardwareCategoryId:p.categoryId));
    const packById=new Map(packs.map(pack=>[String(pack.productId),pack]));
    const packFor=p=>packById.get(String(p.productId));
    const stateFor=p=>inventoryAttention(p,packFor(p));
    const columns=[
        {id:'name',header:'Producto',size:200,accessorFn:p=>getProductDisplayName(p,categories,productLines),Cell:({cell,row})=><button type="button" className="inventory-product-button" onClick={()=>onSelect(row.original.productId)}><span className="table-text-primary category-accent" style={categoryStyle(category(row.original))}>{cell.getValue()}</span></button>},
        {id:'quantity',header:'Disponible',size:230,accessorFn:p=>stateFor(p).quantity,sortUndefined:'last',Cell:({row})=>{const p=row.original,pack=packFor(p),state=stateFor(p);return <div className="inventory-availability"><strong>{state.quantity===null?'Desconocido':quantityLabel(state.quantity,displayUnit(p))}</strong><small className="d-block text-muted">{inventoryStatus[p.status]}</small>{pack&&<small className="d-block">{packDescription(pack,displayUnit(p))}</small>}</div>;}},
        {id:'status',header:'Estado',size:170,accessorFn:p=>stateFor(p).label,Cell:({row})=>{const state=stateFor(row.original);return <span className={`badge text-bg-${state.tone}`}>{state.label}</span>;}},
        {id:'minimum',header:'Mínimo de reposición',size:145,accessorFn:p=>p.minimum==null||p.minimum===''?null:Number(p.minimum),Cell:({cell,row})=>cell.getValue()===null?<span className="table-text-muted">Sin configurar</span>:`${row.original.minimum} ${unitLabel(row.original.unit)}`},
        {id:'actions',header:'Acciones',size:170,enableSorting:false,Cell:({row})=><button className="btn btn-sm btn-outline-primary" onClick={()=>onSelect(row.original.productId)}>Ver / ajustar</button>},
        {id:'category',header:'Categoría',size:180,accessorFn:p=>category(p)?.name||'Sin categoría',Cell:({cell,row})=><span className="classification-label category-accent" style={categoryStyle(category(row.original))}>{cell.getValue()}</span>},
    ];
    if(activity==='JARCERIA'){
        columns.push({id:'presentations',header:'Presentaciones',accessorFn:p=>presentations.filter(r=>String(r.productId)===String(p.productId)&&r.active).map(r=>r.name+' ('+r.factor+' '+r.baseUnit+')').join(' · ')||'Sin presentaciones'});
    }else{
        columns.push({id:'line',header:'Línea',accessorFn:p=>productLines.find(l=>l.id===p.lineId)?.name||'---'});
    }
    return <DataTable columns={columns} data={products} getRowId={p=>String(p.productId)}
        columnOrder={['name','quantity','status','minimum','actions','category',activity==='JARCERIA'?'presentations':'line']}
        columnVisibility={{line:false,category:false,presentations:false}} searchPlaceholder="Buscar producto..." initialSorting={[{id:'name',desc:false}]}
        renderTopToolbarCustomActions={({table})=><InventoryShoppingList table={table} options={{activity,catalogRows,categories,productLines,presentations,packs}}/>}/>;
}
