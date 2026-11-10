import {operationsReport} from '../src/domain/operationsReport.mjs';
const count=1000,salesCount=10000;
const products=Array.from({length:count},(_,i)=>({id:i+1,name:'Producto sintético '+i,unit:'litro',active:true}));
const sales=Array.from({length:salesCount},(_,i)=>({id:'s'+i,folio:'QA-'+i,date:'2026-11-06',createdAt:'2026-11-06T15:00:00Z',items:[{productId:i%count+1,activity:'LIMPIEZA',lineType:'physical',unit:'litro',amount:20,quantity:1}]}));
const input={data:{products,sales,categories:[],productLines:[],procurement:{purchases:[]}},inventory:{products:products.map(p=>({productId:p.id,name:p.name,quantity:'20',minimum:'5',usualBatch:'20',unit:p.unit})),pending:[],movements:sales.map(s=>({id:s.id,sale_id:s.id,sale_ordinal:0,product_id:String(s.items[0].productId),kind:'sale',quantity:'-1'}))},purchases:{enabled:true,rows:products.map(p=>({product_id:p.id,activity:'LIMPIEZA',state:'applied',actual_quantity:'20',source:{total:100},unit:'litro',updated_at:'2026-11-05T10:00:00Z',date:'2026-11-05',purchase_id:'p'+p.id}))}};
const measurements=[];
for(let i=0;i<3;i++){const start=performance.now(),report=operationsReport(input,{from:'2026-11-01',to:'2026-11-06'});measurements.push({ms:Math.round((performance.now()-start)*100)/100,margins:report.margins.length,rotation:report.rotation.length});}
console.log(JSON.stringify({synthetic:true,products:count,sales:salesCount,measurements}));
