import { categoryStyle } from '../utils/categoryColors.js';
import { getProductDisplayName } from '../utils/catalogUtils.js';
import { unitLabel } from '../utils/units.js';
import { inventoryStatus } from '../services/inventoryPresentation.js';
import DataTable from './DataTable';
import TableActions from './TableActions';
import '../styles/components/Inventory.css';

export default function InventoryProductList({rows,categories,productLines,onSelect}){
    // Mismo orden y configuración inicial que ProductsPage, sin agrupación visual.
    const products=rows.map(p=>({...p,id:p.productId})).sort((a,b)=>getProductDisplayName(a,categories,productLines).localeCompare(getProductDisplayName(b,categories,productLines),'es'));
    const category=p=>categories.find(c=>c.id===p.categoryId);
    const columns=[
        {id:'name',header:'Producto',size:200,accessorFn:p=>getProductDisplayName(p,categories,productLines),Cell:({cell,row})=><button type="button" className="inventory-product-button" onClick={()=>onSelect(row.original.productId)}><span className="table-text-primary category-accent" style={categoryStyle(category(row.original))}>{cell.getValue()}</span></button>},
        {id:'quantity',header:'Existencia aproximada',size:170,accessorFn:p=>p.quantity===null?null:Number(p.quantity),sortUndefined:'last',Cell:({row})=><>{row.original.quantity===null?<span className="table-text-muted">Sin determinar</span>:<span>{row.original.quantity} {unitLabel(row.original.unit)}</span>}{row.original.negative&&<small className="d-block text-danger">Saldo negativo: revisar estimación</small>}</>},
        {id:'status',header:'Estado',size:160,accessorFn:p=>inventoryStatus[p.status],Cell:({cell,row})=><>{cell.getValue()}{row.original.movementsWithoutBasis>0&&<small className="d-block text-muted">{row.original.movementsWithoutBasis} movimientos sin saldo inicial</small>}</>},
        {id:'minimum',header:'Reposición',size:140,accessorFn:p=>p.minimum===null?null:Number(p.minimum),Cell:({row})=><>{row.original.minimum===null?<span className="table-text-muted">Sin configurar</span>:`${row.original.minimum} ${unitLabel(row.original.unit)}`}{row.original.low&&<strong className="d-block text-warning">Reponer</strong>}</>},
        {id:'batch',header:'Lote habitual',size:140,accessorFn:p=>p.usualBatch===null?null:Number(p.usualBatch),Cell:({row})=>row.original.usualBatch===null?<span className="table-text-muted">Sin configurar</span>:`${row.original.usualBatch} ${unitLabel(row.original.unit)}`},
        {id:'actions',header:'Acciones',size:110,enableSorting:false,Cell:({row})=><TableActions label={getProductDisplayName(row.original,categories,productLines)} onEdit={()=>onSelect(row.original.productId)} showDelete={false}/>},
        {id:'category',header:'Categoría',size:180,accessorFn:p=>category(p)?.name||'Sin categoría',Cell:({cell,row})=><span className="classification-label category-accent" style={categoryStyle(category(row.original))}>{cell.getValue()}</span>},
        {id:'line',header:'Línea',accessorFn:p=>productLines.find(l=>l.id===p.lineId)?.name||'---'},
    ];
    return <DataTable columns={columns} data={products} getRowId={p=>String(p.productId)} columnOrder={['name','quantity','status','minimum','batch','actions','category','line']} columnVisibility={{line:false}} searchPlaceholder="Buscar producto..." initialSorting={[{id:'category',desc:false},{id:'line',desc:false}]}/>;
}
