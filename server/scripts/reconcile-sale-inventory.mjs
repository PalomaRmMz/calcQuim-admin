import fs from 'node:fs/promises';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {readDataset} from '../src/repositories/dataset.mjs';
import {readInventory} from '../src/repositories/inventory.mjs';
import {planInventoryReconciliation,applyInventoryReconciliation} from '../src/services/inventoryReconciliation.mjs';
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
const database=args.includes('--database')?value('--database'):'calcquim_activation_test';
const apply=args.includes('--apply');
if(apply&&args.includes('--dry-run'))throw new Error('CONFLICTING_EXECUTION_MODES');
if(apply&&database==='calcquim_operational'&&!args.includes('--authorize-operational-reconciliation'))throw new Error('La conciliación operativa requiere autorización expresa y dry-run revisado.');
if(database==='calcquim_operational_restore')throw new Error('La base de restauración está protegida.');
const config=await loadOperationalConfig(database);
const schema=database==='calcquim_operational'?'calcquim_operational':value('--schema');
if(!(schema==='calcquim_operational'&&database==='calcquim_operational')&&!/^calcquim_test_[a-z0-9_]+$/.test(schema??''))throw new Error('Se requiere un esquema de ensayo explícito.');
const approved=args.includes('--plan')?JSON.parse(await fs.readFile(value('--plan'),'utf8')):null;
if(apply&&(!approved||!args.includes('--run-id')||!args.includes('--reason')))throw new Error('Aplicar requiere --plan, --run-id y --reason.');
const confirmations=args.includes('--confirmations')?JSON.parse(await fs.readFile(value('--confirmations'),'utf8')):approved?.options.confirmations??{};
const cutoff=approved?.options.cutoff??new Date().toISOString();
const pool=new pg.Pool({...config.database,...(!apply?{options:'-c default_transaction_read_only=on'}:{}),application_name:apply?'calcquim-approved-reconciliation':'calcquim-audit-readonly'}),c=await pool.connect();
try{
  await c.query(apply?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
  const snapshot=await readDataset(c,apply,database==='calcquim_operational'?'operational':false),view=await readInventory(c,snapshot.data);
  if(!view.enabled||!view.policy.sales_enabled)throw new Error('Inventario no activo; no se regulariza por suposición.');
  const options={cutoff,confirmations},plan=planInventoryReconciliation(snapshot.data,view,options);
  if(apply){const result=await applyInventoryReconciliation(c,snapshot.data,plan,{expectedPlanHash:approved.plan.planHash,runId:value('--run-id'),reason:value('--reason')});await c.query('COMMIT');console.log(JSON.stringify(result));}
  else {await c.query('COMMIT');if(args.includes('--out'))await fs.writeFile(value('--out'),JSON.stringify({options,plan},null,2));console.log(JSON.stringify({dryRun:true,database,cutoff,counts:plan.counts,pendingSales:plan.pendingSales,pendingRows:plan.pendingRows,ready:plan.ready,planHash:plan.planHash}));}
}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await pool.end();}
