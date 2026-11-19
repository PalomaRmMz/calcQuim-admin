// Preview: node server/scripts/catalog-inventory-minimums.mjs
// After explicit authorization: node server/scripts/catalog-inventory-minimums.mjs --apply REVIEWED_HASH NEW_BACKUP_PATH
import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {inventoryChange} from '../src/repositories/inventory.mjs';
import {productActivity} from '../../src/domain/activityScope.mjs';
import {normalizeUnit} from '../../src/utils/units.js';
import {inventoryConvert,inventoryDecimal} from '../../src/services/inventoryUnits.js';

const args=process.argv.slice(2);
const apply=args[0]==='--apply';
if(args.length&&(!apply||args.length!==3||!/^[a-f0-9]{64}$/.test(args[1])))throw Error('Indica la huella revisada y una ruta nueva para el respaldo.');
const target='calcquim_operational';
const config=await loadOperationalConfig(target);
const pool=new pg.Pool(config.database);
const client=await pool.connect().catch(async error=>{await pool.end();throw error;});
try{
 await client.query(apply?'BEGIN ISOLATION LEVEL REPEATABLE READ':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await client.query('SET LOCAL search_path TO calcquim_operational, pg_catalog');
 if((await client.query('SELECT current_database() AS name')).rows[0].name!==target)throw Error('Base de datos distinta a la operativa esperada.');
 const state=(await client.query(`SELECT generation,revision,purpose FROM dataset_state WHERE singleton=true${apply?' FOR UPDATE':''}`)).rows[0];
 if(state?.purpose!=='operational')throw Error('El conjunto de datos no es operativo.');
 const catalog=(await client.query(`
  SELECT p.id,p.record,a.unit AS account_unit,
    CASE WHEN r.product_id IS NOT NULL THEN jsonb_build_object(
      'product_id',r.product_id,'minimum',r.minimum::text,'usual_batch',r.usual_batch::text,'unit',r.unit
    ) END AS previous
  FROM products p
  LEFT JOIN inventory_accounts a ON a.product_id=p.id
  LEFT JOIN inventory_replenishment r ON r.product_id=p.id
  ORDER BY p.id
 `)).rows;
 const changes=[],excluded=[];
 let alreadyConfigured=0;
 for(const {id,record,account_unit,previous} of catalog){
  const activity=productActivity(record),unit=normalizeUnit(record.unit);
  const item={id,name:record.name,activity,unit:unit??record.unit};
  const eligible=activity==='JARCERIA'?unit==='pieza':['litro','mililitro'].includes(unit);
  if(!eligible||account_unit&&account_unit!==unit||previous&&previous.unit!==unit){
   excluded.push({...item,reason:eligible?'Unidad de inventario o reposición distinta':'Unidad especial sin equivalencia aplicable'});
   continue;
  }
  const minimum=activity==='JARCERIA'?'3':inventoryConvert('3','litro',unit);
  if(previous?.minimum!=null&&inventoryDecimal(previous.minimum)===inventoryDecimal(minimum)){
   alreadyConfigured++;
   continue;
  }
  changes.push({...item,previous,minimum});
 }
 const plan={database:target,generation:state.generation,revision:state.revision,alreadyConfigured,excluded,changes};
 const hash=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
 if(!apply){
  console.log(JSON.stringify({...plan,hash},null,2));
  await client.query('ROLLBACK');
 }else{
  if(hash!==args[1])throw Error('El catálogo o la reposición cambió. Genera y revisa otra vista previa.');
  if(!changes.length)throw Error('La vista previa no tiene cambios por aplicar.');
  const backup=await open(args[2],'wx',0o600);
  try{
   await backup.writeFile(JSON.stringify({...plan,hash},null,2));
   await backup.sync();
  }finally{await backup.close();}
  for(const {id,unit,minimum,previous} of changes){
   const updated=await client.query(`
    INSERT INTO inventory_replenishment(product_id,minimum,unit) VALUES($1,$2,$3)
    ON CONFLICT(product_id) DO UPDATE SET minimum=EXCLUDED.minimum
    WHERE inventory_replenishment.unit=EXCLUDED.unit
    RETURNING minimum::text,usual_batch::text,unit
   `,[id,minimum,unit]);
   const row=updated.rows[0];
   if(!row||inventoryDecimal(row.minimum)!==inventoryDecimal(minimum)||row.unit!==unit||row.usual_batch!==(previous?.usual_batch??null))throw Error(`No se pudo verificar la reposición de ${id}.`);
   await inventoryChange(client,'replenishment',{
    productId:id,previous,next:{minimum,batch:row.usual_batch,unit},
    reason:'Configuración de reposición del catálogo existente',
    reasonCode:'replenishment_configuration',reasonCatalogVersion:1,planHash:hash
   });
  }
  await client.query('UPDATE dataset_state SET revision=revision+1 WHERE singleton=true');
  await client.query('COMMIT');
  console.log(JSON.stringify({updated:changes.length,excluded:excluded.length,hash}));
 }
}catch(error){
 await client.query('ROLLBACK');
 throw error;
}finally{
 client.release();
 await pool.end();
}
