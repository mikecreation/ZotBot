import {runGearTests} from './gear-progression.js';
import {runIdleFiberTests} from './idle-fiber.js';
import {runSuite} from './suite.js';
import {runUpgradeTests} from './upgrades.js?v=3.23.0';
import {runPrimitiveTests} from './primitive-integration.js';
import {runMovementSafetyTests} from './movement-safety.js';
try{const base=await runSuite(window.__fogWorld,{only:new URL(parent.location.href).searchParams.get('only')||undefined,onResult:(last,count)=>parent.postMessage({type:'fog-test-progress',last,count},location.origin)}),extra=runUpgradeTests(window.__fogWorld);parent.postMessage({type:'fog-test-results',result:{results:[...base.results,...extra,...runPrimitiveTests(window.__fogWorld),...runMovementSafetyTests(window.__fogWorld),...await runIdleFiberTests(window.__fogWorld),...runGearTests(window.__fogWorld)],ms:base.ms}},location.origin)}catch(e){parent.postMessage({type:'fog-test-results',result:{results:[{name:'runner',pass:false,detail:e.stack}]}},location.origin)}
