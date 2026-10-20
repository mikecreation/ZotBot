global.window=globalThis;require('./discoveries.js');require('./engine.js');
const E=window.FogGameEngine;const s=E.newGame(1);
for(let i=0;i<24&&!s.over;i++){const L=s.log.length;E.endTurn(s,null);console.log(s.turn,'pop',s.pop,'food',s.food.toFixed(1),'df',s.lastFood.toFixed(1),'sh',s.shelter.toFixed(1),'h',s.health.toFixed(0),'m',s.morale.toFixed(0),'ins',s.lastInsight.toFixed(2),s.log.slice(L).map(x=>x.m).join(' | '))}
