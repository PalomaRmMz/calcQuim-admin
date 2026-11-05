import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {inspectWholesaleActivation,activateWholesale,recoverUnusedWholesale} from '../src/services/wholesaleActivation.mjs';
const args=process.argv.slice(2),arg=key=>args[args.indexOf(key)+1];
const database=args.includes('--database')?arg('--database'):'calcquim_operational',schema=database==='calcquim_operational'?'calcquim_operational':arg('--schema');
const write=args.includes('--apply')||args.includes('--recover-unused');
if((args.includes('--apply')&&args.includes('--recover-unused'))||(write&&args.includes('--dry-run')))throw new Error('CONFLICTING_EXECUTION_MODES');
if(write&&database==='calcquim_operational'&&!args.includes('--authorize-operational'))throw new Error('EXPLICIT_OPERATIONAL_AUTHORIZATION_REQUIRED');
const config=await loadOperationalConfig(database),pool=new pg.Pool({...config.database,...(!write?{options:'-c default_transaction_read_only=on'}:{})});
try{const options={clientsReady:args.includes('--clients-ready'),runId:arg('--run-id')};const result=args.includes('--apply')?await activateWholesale(pool,schema,options):args.includes('--recover-unused')?await recoverUnusedWholesale(pool,schema,options):await inspectWholesaleActivation(pool,schema);console.log(JSON.stringify({dryRun:!write,...result}));}finally{await pool.end();}
