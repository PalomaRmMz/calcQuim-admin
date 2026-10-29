import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePrivateValues,reconcileDatasets,reconcileRelationalColumns,summarizeDataset,sourceFreshness } from '../src/services/reconciliation.mjs';
import { readRehearsalConfig } from '../src/config/rehearsal.mjs';

const empty=()=>({categories:[],productLines:[],priceGroups:[],products:[],sales:[],procurement:{version:1,supplyConfigurationVersion:3,supplyModelVersion:2,suppliers:[],purchasedItems:[],supplyItems:[],supplyConversions:[],supplierPrices:[],purchases:[]}});

test('conciliación detecta tipos, presencia, null, orden y cero negativo',()=>{
  for(const [a,b]of [[{id:1},{id:'1'}],[{x:null},{}],[[],null],[[1,2],[2,1]],[{x:-0},{x:0}]]) assert.equal(comparePrivateValues(a,b).equal,false);
  assert.equal(comparePrivateValues({x:[null,1]},{x:[null,1]}).equal,true);
});
test('diagnósticos no filtran nombres, valores, IDs o claves privadas',()=>{
  const secret='synthetic-sensitive-label';
  const result=comparePrivateValues({[secret]:{id:secret,price:123.456}},{[secret]:{id:'different',price:0}});
  assert.equal(result.equal,false);assert.ok(result.mismatches>=2);
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(JSON.stringify(result).includes('123.456'),false);
  for(const diagnostic of result.diagnostics)assert.match(diagnostic.pathHash,/^[a-f0-9]{64}$/);
});
test('conciliación económica evalúa Maps, fechas, reportes y exportación',()=>{
  assert.equal(comparePrivateValues(new Map([[1,new Date('2026-01-01')]]),new Map([[1,new Date('2026-01-02')]])).equal,false);
  const result=reconcileDatasets(empty(),empty());
  assert.equal(result.equal,true);assert.equal(result.evaluations.length,2);assert.equal(result.exportParity.equal,true);assert.equal(result.cutoverEnabled,false);
});
test('historia y fotos se cuentan por ocurrencia sin sumarlas como compras nuevas',()=>{
  const data=empty(),receipt={name:'synthetic.jpg',dataUrl:'data:image/jpeg;base64,/9j/2Q=='};
  data.procurement.purchases=[{id:'synthetic',items:[{conversionSnapshots:[{}]}],receipt,revisions:[{items:[{}],receipt}],voidedAt:'2026-01-01'}];
  const {counts,photos}=summarizeDataset(data);
  assert.equal(counts.purchaseItems,1);assert.equal(counts.revisions,1);assert.equal(counts.revisionItems,1);assert.equal(counts.receiptOccurrences,2);assert.equal(counts.voidedPurchases,1);assert.equal(photos[0].bytesHash,photos[1].bytesHash);
  const freshness=sourceFreshness({capturedAt:'2026-01-01T00:00:00Z'},{createdAt:'2026-01-02T00:00:00Z'});assert.equal(freshness.timestampsAfterCapture,1);assert.equal(freshness.browserCurrentStateVerified,false);
});
test('columnas numeric se comparan sin ocultar pérdida por conversión a Number',async()=>{
  const data=empty();data.products=[{id:7,name:'Synthetic',unit:'litro',price:20}];
  const client={async query(sql){if(sql.includes('FROM pg_constraint'))return {rows:[{count:0}]};if(/FROM products\b/.test(sql))return {rows:[{id:'7',category_id:null,line_id:null,price_group_id:null,unit:'litro',price:'20.0000000000000000000000000000001'}]};return {rows:[]};}};
  const result=await reconcileRelationalColumns(client,data);assert.equal(result.equal,false);assert.equal(result.failed,1);
});
test('credenciales de ensayo nunca admiten dev, test, administrador o interfaz remota',()=>{
  const values={PGHOST:'127.0.0.1',PGPORT:'5432',PGUSER:'calcquim_migration_app',PGPASSWORD:'synthetic-password'};
  for(const name of ['calcquim_dev','calcquim_test','postgres','arbitrary'])assert.throws(()=>readRehearsalConfig(values,name));
  assert.throws(()=>readRehearsalConfig({...values,PGUSER:'postgres'},'calcquim_migration_check'));
  assert.throws(()=>readRehearsalConfig({...values,PGHOST:'0.0.0.0'},'calcquim_migration_check'));
  assert.throws(()=>readRehearsalConfig({...values,PGPASSWORD:''},'calcquim_migration_restore'));
  assert.equal(readRehearsalConfig(values,'calcquim_migration_restore').database,'calcquim_migration_restore');
});
