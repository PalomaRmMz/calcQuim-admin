// Preview: node server/scripts/catalog-inventory-minimums.mjs
// After explicit authorization: node server/scripts/catalog-inventory-minimums.mjs --apply REVIEWED_HASH NEW_BACKUP_PATH QA_RESTORE_PROOF
import {createHash} from 'node:crypto';
import {open,readFile} from 'node:fs/promises';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {productActivity} from '../../src/domain/activityScope.mjs';
import {normalizeUnit} from '../../src/utils/units.js';
import {inventoryConvert,inventoryDecimal,inventoryText} from '../../src/services/inventoryUnits.js';

const args=process.argv.slice(2);
const apply=args[0]==='--apply';
if(args.length&&(!apply||args.length!==4||!/^[a-f0-9]{64}$/.test(args[1])))throw Error('Indica la huella revisada, la ruta del respaldo y la evidencia de restauración QA.');
const target='calcquim_operational';
const config=await loadOperationalConfig(target);
const pool=new pg.Pool(config.database);
const client=await pool.connect().catch(async error=>{await pool.end();throw error;});
async function protectedState(){
 const tables=['inventory_accounts','inventory_movements','inventory_pack_accounts','inventory_pack_events','inventory_changes','purchases','sales'];
 return (await client.query(tables.map(table=>
  `SELECT '${table}' AS name,count(*)::text AS count,md5(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text)) AS hash FROM ${table} AS t`
 ).join(' UNION ALL '))).rows;
}
try{
 await client.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await client.query('SET LOCAL search_path TO calcquim_operational, pg_catalog');
 if((await client.query('SELECT current_database() AS name')).rows[0].name!==target)throw Error('Base de datos distinta a la operativa esperada.');
 const state=(await client.query(`SELECT generation,revision,purpose FROM dataset_state WHERE singleton=true${apply?' FOR UPDATE':''}`)).rows[0];
 if(state?.purpose!=='operational')throw Error('El conjunto de datos no es operativo.');
 const catalog=(await client.query(`
  SELECT p.id,p.record,a.unit AS account_unit,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',cp.id,'factor',cp.factor::text,'baseUnit',cp.record->>'baseUnit','integerOnly',cp.record->'integerOnly'
      ,'unit',cp.unit
    ) ORDER BY cp.id) FROM commercial_presentations cp
      WHERE cp.product_id=p.id AND cp.record->'active'='true'::jsonb),'[]'::jsonb) AS active_presentations,
    CASE WHEN r.product_id IS NOT NULL THEN jsonb_build_object(
      'product_id',r.product_id,'minimum',r.minimum::text,'usual_batch',r.usual_batch::text,'unit',r.unit
    ) END AS previous
  FROM products p
  LEFT JOIN inventory_accounts a ON a.product_id=p.id
  LEFT JOIN inventory_replenishment r ON r.product_id=p.id
  ORDER BY p.id
 `)).rows;
 const changes=[],excluded=[];
 let alreadyConfigured=0,customMinimums=0;
 for(const {id,record,account_unit,previous,active_presentations} of catalog){
  const activity=productActivity(record),unit=normalizeUnit(record.unit);
  const item={id,name:record.name,activity,unit:unit??record.unit};
  const piece_presentations=active_presentations.filter(p=>p.unit==='pieza').map(({unit,...piece})=>piece);
  const [piece]=piece_presentations;
  const [container]=active_presentations;
  const directContainer=activity==='JARCERIA'&&unit==='envase'&&account_unit==='envase'&&
   active_presentations.length===1&&container.unit==='envase'&&container.baseUnit==='envase'&&
   container.integerOnly===true&&inventoryDecimal(container.factor)===inventoryDecimal('1');
  const equivalent=activity==='JARCERIA'&&unit&&unit!=='pieza'&&piece_presentations.length===1&&
   piece.integerOnly===true&&piece.baseUnit===unit&&/^\d+(?:\.\d{1,6})?$/.test(piece.factor)&&inventoryDecimal(piece.factor)>0n;
  const minimum=activity==='JARCERIA'?(unit==='pieza'||directContainer?'3':equivalent?inventoryText(inventoryDecimal(piece.factor)*3n):null):
   ['litro','mililitro'].includes(unit)?inventoryConvert('3','litro',unit):null;
  if(!minimum||account_unit&&account_unit!==unit||previous&&previous.unit!==unit){
   excluded.push({...item,reason:minimum?'Unidad de inventario o reposición distinta':'Sin presentación activa de pieza con equivalencia inequívoca'});
   continue;
  }
  if(previous?.minimum!=null){
   if(Number(previous.minimum)===Number(minimum))alreadyConfigured++;
   else customMinimums++;
   continue;
  }
  changes.push({...item,previous,minimum,...(directContainer?{presentation:container}:equivalent?{presentation:piece}:{})});
 }
 const plan={database:target,generation:state.generation,revision:state.revision,alreadyConfigured,customMinimums,excluded,changes};
 const hash=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
 if(!apply){
  console.log(JSON.stringify({...plan,hash},null,2));
  await client.query('ROLLBACK');
 }else{
  if(hash!==args[1])throw Error('El catálogo o la reposición cambió. Genera y revisa otra vista previa.');
  if(!changes.length)throw Error('La vista previa no tiene cambios por aplicar.');
  const proof=JSON.parse(await readFile(args[3],'utf8'));
  if(proof.database!==target||proof.restoreTarget!=='calcquim_activation_test'||proof.restoreVerified!==true||
     proof.generation!==state.generation||String(proof.revision)!==String(state.revision)||typeof proof.dump!=='string')throw Error('La restauración QA no corresponde a la revisión operativa.');
  const archive=await readFile(proof.dump);
  if(createHash('sha256').update(archive).digest('hex')!==proof.dumpSha256)throw Error('El respaldo difiere del que se restauró en QA.');
  const protectedBefore=await protectedState();
  if(Number(protectedBefore.find(row=>row.name==='inventory_movements').count)!==proof.movements)throw Error('El respaldo difiere en movimientos.');
  const backup=await open(args[2],'wx',0o600);
  try{
   await backup.writeFile(JSON.stringify({...plan,hash},null,2));
   await backup.sync();
  }finally{await backup.close();}
  for(const {id,unit,minimum,previous} of changes){
   const updated=await client.query(`
    INSERT INTO inventory_replenishment(product_id,minimum,unit) VALUES($1,$2,$3)
    ON CONFLICT(product_id) DO UPDATE SET minimum=EXCLUDED.minimum
    WHERE inventory_replenishment.unit=EXCLUDED.unit AND inventory_replenishment.minimum IS NULL
    RETURNING minimum::text,usual_batch::text,unit
   `,[id,minimum,unit]);
   const row=updated.rows[0];
   if(!row||inventoryDecimal(row.minimum)!==inventoryDecimal(minimum)||row.unit!==unit||row.usual_batch!==(previous?.usual_batch??null))throw Error(`No se pudo verificar la reposición de ${id}.`);
  }
  if(JSON.stringify(await protectedState())!==JSON.stringify(protectedBefore))throw Error('Cambió un registro protegido; se revierte la operación.');
  await client.query('COMMIT');
  console.log(JSON.stringify({updated:changes.length,alreadyConfigured,customMinimums,excluded:excluded.length,protectedUnchanged:true,hash}));
 }
}catch(error){
 await client.query('ROLLBACK');
 throw error;
}finally{
 client.release();
 await pool.end();
}
