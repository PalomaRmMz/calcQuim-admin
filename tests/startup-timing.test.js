import test from 'node:test';
import assert from 'node:assert/strict';
import {startupTiming} from '../scripts/startup-timing.mjs';
test('startup captures successful and failed phases without swallowing failures',async()=>{
 let time=10;const timer=startupTiming(()=>time);
 assert.equal(await timer.measure('database',async()=>{time=40;return 'ready';}),'ready');
 await assert.rejects(timer.measure('frontend',async()=>{time=55;throw Error('MISMATCH');}),/MISMATCH/);
 assert.deepEqual(timer.snapshot(),{database:30,frontend:15,totalMs:45});
});
