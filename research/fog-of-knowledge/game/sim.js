global.window=globalThis;require('./discoveries.js');require('./engine.js');
const E=window.FogGameEngine,fs=require('fs');
const d=JSON.parse(fs.readFileSync('/workspace/fog/data/atlas-display.json'));const n=JSON.parse(fs.readFileSync('/workspace/fog/data/atlas-navigation.json'));const f=JSON.parse(fs.readFileSync('/workspace/fog/data/atlas-families.json'));
const t0=Date.now();const A=E.buildAtlas(n,d.nodes,f);console.log('atlas',A.total,'build ms',Date.now()-t0);
for(const seed of [1,2,3,4,5,6]){
 const s=E.newGame(seed);const eraAt={};let t1=Date.now();
 for(let i=0;i<1600&&!s.over;i++){
   // simple strategy: adjust jobs by season and pressure
   const housed=s.shelter*(1+E.effects(s,A).capacity);
   s.jobs=s.food<s.pop*1.5?{gather:50,hunt:25,build:10,explore:5,research:10}:{gather:35,hunt:15,build:housed<s.pop*1.1?20:10,explore:8,research:housed<s.pop*1.1?22:32};
   E.endTurn(s,A);if(eraAt[s.era]===undefined)eraAt[s.era]=s.turn;if(s.complete)break;
 }
 console.log('seed',seed,'turns',s.turn,'over',s.over,'pop',s.pop,'era',s.era,'known',s.known.length,'revealed',s.revealed.length,'eraAt',JSON.stringify(eraAt),'ms',Date.now()-t1,'peak',s.stats.peak);
}
