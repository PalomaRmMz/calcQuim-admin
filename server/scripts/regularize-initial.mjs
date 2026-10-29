import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig,requireActivation} from '../src/config/operational.mjs';
import {readDataset} from '../src/repositories/dataset.mjs';
import {readInventory} from '../src/repositories/inventory.mjs';
import {initialRegularizationPlan,applyInitialRegularization,regularizationHash} from '../src/services/initialRegularization.mjs';
import {verifyPgArchive} from '../src/db/pgTools.mjs';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),value=name=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const directory=fileURLToPath(new URL('../artifacts/inventory/',import.meta.url));
function privatePath(root,input){if(!input)throw new Error('PRIVATE_FILE_REQUIRED');const path=resolve(input),rel=relative(root,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new Error('PRIVATE_PATH_INVALID');return path;}
let pool,c;
try{
  await requireActivation();const config=await loadOperationalConfig();pool=new pg.Pool(config.database);c=await pool.connect();
  const apply=args.includes('--apply');
  if(apply&&(!args.includes('--authorize-operational')||!args.includes('--closed-window-confirmed')))throw new Error('EXPLICIT_AUTHORIZATION_AND_CLOSED_WINDOW_REQUIRED');
  await c.query(apply?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query('SET LOCAL search_path TO calcquim_operational,pg_catalog');
  const dataset=await readDataset(c,apply,'operational'),inventory=await readInventory(c,dataset.data);
  if(!apply){
    const plan=initialRegularizationPlan(dataset,inventory),planSha256=regularizationHash(plan);await mkdir(directory,{recursive:true});
    const path=resolve(directory,`initial-regularization-${randomUUID()}.private.json`);await writeFile(path,JSON.stringify({planSha256,plan},null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({mode:'READ_ONLY',affected:plan.candidates.length,ambiguous:plan.ambiguous.length,potentialDuplicates:plan.potentialDuplicates.length,planSha256,privatePlan:path}));
  }else{
    const stored=JSON.parse(await readFile(privatePath(directory,value('--plan')),'utf8'));
    if(stored.planSha256!==value('--expected-plan-sha256')||regularizationHash(stored.plan)!==stored.planSha256)throw new Error('PLAN_HASH_MISMATCH');
    const backupRoot=fileURLToPath(new URL('../artifacts/operational/backups/',import.meta.url)),dump=privatePath(backupRoot,value('--backup'));
    if(!dump.endsWith('.dump'))throw new Error('DUMP_REQUIRED');
    const bytes=await readFile(dump),manifest=JSON.parse(await readFile(dump.replace(/\.dump$/,'.private.json'),'utf8'));
    if(manifest.database!=='calcquim_operational'||manifest.bytes!==bytes.length||manifest.sha256!==createHash('sha256').update(bytes).digest('hex'))throw new Error('BACKUP_INTEGRITY_FAILED');verifyPgArchive(dump);
    if(manifest.snapshotSha256!==stored.plan.datasetSha256||manifest.inventorySha256!==stored.plan.inventorySha256)throw new Error('BACKUP_NOT_FOR_REVIEWED_PLAN');
    const active=(await c.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='calcquim-operational' AND pid<>pg_backend_pid() AND (state='active' OR xact_start IS NOT NULL)")).rows[0].n;
    if(active)throw new Error('ACTIVE_OPERATIONS');
    const result=await applyInitialRegularization(c,dataset,inventory,stored.plan);
    const after=await readDataset(c,false,'operational');if(regularizationHash(after.data)!==regularizationHash(dataset.data)||regularizationHash(after.counters)!==regularizationHash(dataset.counters))throw new Error('BUSINESS_DATA_CHANGED');
    console.log(JSON.stringify({mode:'AUTHORIZED_APPLY',...result,businessAmountsAndBalancesUnchanged:true}));
  }
  await c.query('COMMIT');
}catch(error){if(c)await c.query('ROLLBACK');console.error(/^[A-Z_]+$/.test(error.message)?error.message:'REGULARIZATION_FAILED');process.exitCode=1;}
finally{c?.release();await pool?.end();}
