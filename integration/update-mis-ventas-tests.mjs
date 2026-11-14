import {readFile,writeFile,cp} from 'node:fs/promises';
const root=new URL('file:///D:/ReactApps/calcQuim/'),url=new URL('tests/official-sales-history.test.mjs',root);
await cp(url,new URL('.artifacts/mis-ventas/baseline/official-sales-history.test.mjs',root));
let t=await readFile(url,'utf8');
t=t.replace("../.artifacts/official-sales-history/","../.artifacts/mis-ventas/");
t=t.replace('expected=[...before.data.sales].sort',`expected=before.data.sales.filter(s=>{const channels=(Array.isArray(s.history)?s.history:[]).filter(h=>h?.action==='created').map(h=>h.channel);return (s.origin==='MOVIL'||(s.origin==null&&channels.includes('MOVIL')))&&!channels.includes('WEB');}).sort`);
t=t.replace("for(const sale of expected){const r=",`for(const sale of before.data.sales.filter(s=>!expected.includes(s))){assert.equal((await get('/sales/history/'+sale.id)).status,404);if(sale.folio)assert.equal((await get('/sales/history?folio='+encodeURIComponent(sale.folio))).body.sales.length,0);}
   for(const sale of expected){const r=`);
t=t.replace("assert.equal(result.sales.length,1);assert.equal(result.sales[0].partial,true);assert.equal(result.sales[0].captureOrigin,null);assert.equal(result.sales[0].payment,null);assert.equal('notes' in result.sales[0],false);",`assert.equal(result.sales.length,0);await assert.rejects(readOfficialSale(c,prefix+'1',{},purpose),e=>e.status===404);
  for(const record of [{origin:'WEB'},{origin:'WEB',history:[{action:'created',channel:'MOVIL'}]},{origin:'MOVIL',history:[{action:'created',channel:'WEB'}]},{origin:'UNKNOWN',history:[{action:'created',channel:'MOVIL'}]}]){await c.query('UPDATE sales SET record=record||$2::jsonb WHERE id=$1',[prefix+'1',JSON.stringify(record)]);assert.equal((await readSalesHistory(c,{folio:prefix+'1'},purpose)).sales.length,0);await assert.rejects(readOfficialSale(c,prefix+'1',{},purpose),e=>e.status===404);}
  await c.query("UPDATE sales SET record=(record-'origin')||$2::jsonb WHERE id=$1",[prefix+'1',JSON.stringify({history:[{action:'created',channel:'MOVIL'}]})]);
  assert.equal((await readSalesHistory(c,{folio:prefix+'1'},purpose)).sales.length,1);
  await c.query("UPDATE sales SET record=(record-'history')||$2::jsonb WHERE id LIKE $1",[prefix+'%',JSON.stringify({origin:'MOVIL'})]);
  const verified=await readSalesHistory(c,{folio:prefix+'1'},purpose);assert.equal(verified.sales[0].captureOrigin,'MOVIL');assert.equal(verified.sales[0].partial,true);assert.equal('notes' in verified.sales[0],false);`);
t=t.replace("const conflict=await readOfficialSale(c,prefix+'1',{},purpose);assert.equal(conflict.sale.captureOrigin,null);assert.equal(conflict.sale.monetary.roundingCents,-10);",`await assert.rejects(readOfficialSale(c,prefix+'1',{},purpose),e=>e.status===404);assert.equal((await readSalesHistory(c,{folio:prefix+'1'},purpose)).sales.length,0);`);
await writeFile(url,t);
console.log('Existing history tests updated for verified-mobile scope.');
