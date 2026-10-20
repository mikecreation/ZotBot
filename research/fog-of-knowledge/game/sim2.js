global.window=globalThis;require('./discoveries.js');require('./engine.js');
const E=window.FogGameEngine,fs=require('fs');
const d=JSON.parse(fs.readFileSync('/workspace/fog/data/atlas-display.json'));const n=JSON.parse(fs.readFileSync('/workspace/fog/data/atlas-navigation.json'));const f=JSON.parse(fs.readFileSync('/workspace/fog/data/atlas-families.json'));
const A=E.buildAtlas(n,d.nodes,f);let dead=0,eras=[];
for(let seed=1;seed<=40;seed++){const s=E.newGame(seed);for(let i=0;i<400&&!s.over;i++)E.endTurn(s,A);if(s.over)dead++;eras.push(s.era)}
console.log('default jobs: dead',dead,'/40 eras',eras.join(','));
