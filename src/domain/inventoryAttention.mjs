import {inventoryDecimal} from '../services/inventoryUnits.js';
import {getProductChoiceLabels,normalizeText} from '../utils/catalogUtils.js';
import {unitLabel} from '../utils/units.js';

function decimal(value){
 try{return inventoryDecimal(value);}catch{return null;}
}

export function inventoryAttention(product, pack) {
 const raw=pack?.known&&pack.total!=null?pack.total:product.quantity;
 const amount=decimal(raw),minimum=decimal(product.minimum);
 const quantity=amount===null?null:Number(raw);
 if(amount===null)return {key:'unknown',label:'Inventario desconocido',tone:'secondary',quantity};
 if(amount<0n)return {key:'negative',label:'Cantidad por revisar',tone:'danger',quantity};
 if(amount===0n)return {key:'empty',label:'Agotado',tone:'danger',quantity};
 if(minimum===null)return {key:'unconfigured',label:'Mínimo sin configurar',tone:'secondary',quantity};
 if(amount<=minimum)return {key:'low',label:'Inventario bajo',tone:'warning',quantity,belowMinimum:amount<minimum};
 return {key:'sufficient',label:'Existencia suficiente',tone:'success',quantity};
}

const compact=value=>String(value??'').trim().replace(/\s+/g,' ');
const formatQuantity=new Intl.NumberFormat('es-MX',{maximumFractionDigits:6});

export function filterInventoryProducts(products,{activity,category,line,productId,only},attention){
 const hardware=activity==='JARCERIA';
 return products.filter(product=>(!category||String(hardware?product.hardwareCategoryId:product.categoryId)===category)&&
  (hardware||!line||String(product.lineId)===line)&&(!productId||String(product.productId)===productId)&&
  (!only||(only==='attention'?attention(product).key!=='sufficient':attention(product).key===only)));
}

export function inventoryShoppingList(rows,{activity,catalogRows=rows,categories=[],productLines=[],presentations=[],packs=[]}){
 const packById=new Map(packs.map(pack=>[String(pack.productId),pack]));
 const hardware=activity==='JARCERIA';
 const labels=getProductChoiceLabels(catalogRows.map(p=>({...p,id:String(p.productId),categoryId:hardware?p.hardwareCategoryId:p.categoryId})),categories,productLines);
 const labelCounts=new Map();
 for(const label of labels.values()){
  const key=normalizeText(label);
  labelCounts.set(key,(labelCounts.get(key)??0)+1);
 }
 const names=new Map();
 const nameCounts=new Map();
 for(const [id,label] of labels){
  let name=compact(label);
  if(labelCounts.get(normalizeText(label))>1){
   const options=presentations.filter(p=>p.active&&String(p.productId)===id&&compact(p.name))
    .map(p=>compact(p.name));
   if(options.length)name+=` (${[...new Set(options)].join(' / ')})`;
  }
  names.set(id,name);
  const key=normalizeText(name);
  nameCounts.set(key,(nameCounts.get(key)??0)+1);
 }
 const groups={empty:[],low:[]};
 for(const product of rows){
  const id=String(product.productId),state=inventoryAttention(product,packById.get(id));
  if(state.key!=='empty'&&!state.belowMinimum)continue;
  const label=names.get(id)??compact(product.name);
  const name=nameCounts.get(normalizeText(label))>1?`${label} (#${id})`:label;
  const unit=unitLabel(product.unit);
  const stock=`${formatQuantity.format(state.quantity)} ${unit}`;
  const minimum=decimal(product.minimum)===null?'':` · mín. ${formatQuantity.format(product.minimum)} ${unit}`;
  groups[state.key].push({name,detail:stock+minimum});
 }
 if(!groups.empty.length&&!groups.low.length)return '';
 const section=(title,items)=>items.length?`\n\n*${title}*\n`+items
  .sort((a,b)=>a.name.localeCompare(b.name,'es'))
  .map(item=>`• ${item.name} · ${item.detail}`).join('\n'):'';
 return `*Lista de compras · ${activity==='JARCERIA'?'Jarcería':'Limpieza'}*`+
  section('Agotados',groups.empty)+section('Por debajo del mínimo',groups.low);
}
export function packDescription(pack,unit='piezas') {
 if(!pack?.known)return 'Desglose de paquetes y sueltos sin confirmar.';
 unit=({pieza:'piezas',rollo:'rollos',unidad:'unidades'}[unit]||unit);
 return `${pack.closedPackages} paquetes cerrados + ${pack.looseUnits} ${unit} ${['piezas','unidades'].includes(unit)?'sueltas':'sueltos'} = ${pack.total} ${unit} disponibles.`;
}
