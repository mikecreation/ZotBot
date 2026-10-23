/* Fog of Knowledge: The Game — procedural sound (WebAudio). Every sound is synthesised at runtime:
 * no audio files are loaded, so there is nothing to license. Ambience: wind, waves, rain, fire crackle.
 * One-shots: footsteps by surface, pickups, crafting, throws, hits, splashes, wolf howls, thunder (delayed by
 * distance / 343 m/s), eureka chime, warnings. Volume is stored in localStorage. */
const VKEY="fog-of-knowledge:game:volume";
let ctx=null,master=null,amb=null,noiseBuf=null,brownBuf=null,ok=false;
const L={wind:null,waves:null,rain:null,fire:null};
export let volume=(()=>{try{const v=parseFloat(localStorage.getItem(VKEY));return isFinite(v)?Math.min(1,Math.max(0,v)):.7}catch(_){return .7}})();
export const stats={oneShots:0,natureEvents:0,ambienceChanges:0,started:false,errors:0};
export function setVolume(v){volume=Math.min(1,Math.max(0,v));try{localStorage.setItem(VKEY,String(volume))}catch(_){}if(master)master.gain.setTargetAtTime(volume,ctx.currentTime,.05)}
function mkNoise(brown,seconds=17){const n=ctx.sampleRate*seconds,b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);let last=0;
  for(let i=0;i<n;i++){const w=Math.random()*2-1;if(brown){last=(last+.02*w)/1.02;d[i]=last*3.5}else d[i]=w}return b}
function loop(buf,type,freq,q){const s=ctx.createBufferSource();s.buffer=buf;s.loop=true;const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q||.7;const g=ctx.createGain();g.gain.value=0;s.connect(f);f.connect(g);g.connect(amb);s.start(0,Math.random()*buf.duration);return {s,f,g}}
export function init(){
  if(ctx){if(ctx.state==="suspended")ctx.resume().catch(()=>{});return ok}
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;ctx=new AC();
    master=ctx.createGain();master.gain.value=volume;master.connect(ctx.destination);
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.connect(master);
    amb=ctx.createGain();amb.gain.value=.9;amb.connect(comp);ctx._out=comp;
    noiseBuf=mkNoise(false,19);brownBuf=mkNoise(true,23);
    L.wind=loop(mkNoise(true,29),"bandpass",420,.5);L.waves=loop(mkNoise(true,31),"lowpass",520,.6);L.rain=loop(mkNoise(false,37),"highpass",1800,.5);L.fire=loop(brownBuf,"lowpass",260,.8);
    ok=true;stats.started=true;if(ctx.state==="suspended")ctx.resume().catch(()=>{});
  }catch(e){stats.errors++;ok=false}
  return ok;
}
const T=()=>ctx.currentTime;
function env(g,t0,a,peak,d){g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(peak,t0+a);g.gain.exponentialRampToValueAtTime(.0001,t0+a+d)}
function burst(o){ // filtered noise burst {freq,type,q,peak,a,d,delay,buf,rate}
  if(!ok)return;stats.oneShots++;const t0=T()+(o.delay||0),s=ctx.createBufferSource();s.buffer=o.buf||noiseBuf;s.playbackRate.value=o.rate||1;
  const f=ctx.createBiquadFilter();f.type=o.type||"bandpass";f.frequency.value=o.freq||1000;f.Q.value=o.q||1;const g=ctx.createGain();
  const pan=ctx.createStereoPanner();pan.pan.value=o.pan??(Math.random()*.9-.45);
  s.connect(f);f.connect(g);g.connect(pan);pan.connect(o.dest||ctx._out);env(g,t0,o.a||.005,o.peak||.3,o.d||.12);
  const dur=(o.a||.005)+(o.d||.12)+.05,offset=Math.random()*Math.max(0,s.buffer.duration-dur*(o.rate||1));
  s.start(t0,offset);s.stop(t0+dur);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();pan.disconnect()}}
function tone(o){ // {f,f2,type,peak,a,d,delay,detune}
  if(!ok)return;stats.oneShots++;const t0=T()+(o.delay||0),os=ctx.createOscillator();os.type=o.type||"sine";os.frequency.setValueAtTime(o.f,t0);
  if(o.f2)os.frequency.exponentialRampToValueAtTime(o.f2,t0+(o.glide||o.d||.2));const g=ctx.createGain(),pan=ctx.createStereoPanner();pan.pan.value=o.pan||0;os.connect(g);g.connect(pan);pan.connect(o.dest||ctx._out);
  if(o.vib){const l=ctx.createOscillator(),lg=ctx.createGain();l.frequency.value=o.vib;lg.gain.value=o.vibAmt||8;l.connect(lg);lg.connect(os.frequency);l.start(t0);l.stop(t0+(o.a||.01)+(o.d||.2)+.1)}
  env(g,t0,o.a||.01,o.peak||.2,o.d||.2);os.start(t0);os.stop(t0+(o.a||.01)+(o.d||.2)+.1);os.onended=()=>{os.disconnect();g.disconnect();pan.disconnect()}}
/* ---- Evolving ambience: independent long noise beds, irregular smooth gusts,
 * shifting spectra and nonperiodic contextual events. Never a short repeating loop. */
let nextGust=0,nextNature=8,nextDrop=0,gust=.8,swell=.8,color=1,lastAmb=0;
export function ambience(o){
  if(!ok)return;const t=T(),dt=Math.min(.3,Math.max(0,t-lastAmb));lastAmb=t;
  const quiet=o.paused||o.under,k=o.paused?.10:o.slow?.45:o.under?.3:1,rate=o.slow?.55:1;
  if(t>=nextGust){nextGust=t+2+Math.random()*6;gust=.45+Math.random()*.85;swell=.35+Math.random()*.8;color=.65+Math.random()*.8;stats.ambienceChanges++}
  const set=(l,v,f,speed=1)=>{l.g.gain.setTargetAtTime(v*k,t,1.3);l.s.playbackRate.setTargetAtTime(rate*speed,t,2);l.f.frequency.setTargetAtTime(f*(o.slow?.6:1),t,1.5)};
  set(L.wind,(.20*o.wind+.02)*gust,(250+480*o.wind)*color,.85+gust*.17);
  set(L.waves,.35*o.waves*swell,o.under?180:390+220*color,.7+swell*.25);
  set(L.rain,.17*o.rain*(.8+.2*gust),1300+1100*color,.85+color*.12);
  set(L.fire,.22*o.fire,200+100*color,.8+gust*.2);
  if(quiet)return; // no new chirps, drips or crackles scheduled while paused/submerged
  if(o.fire>.05&&Math.random()<dt*o.fire*5)burst({freq:1800+Math.random()*3200,q:2+Math.random()*3,peak:.03+Math.random()*.1*o.fire,d:.02+Math.random()*.06});
  if(o.rain>.1&&t>=nextDrop){nextDrop=t+.12+Math.random()*1.1;stats.natureEvents++;burst({freq:700+Math.random()*3500,q:.5+Math.random()*3,peak:.012+Math.random()*.026*o.rain,d:.025+Math.random()*.1,pan:Math.random()*2-1})}
  if(t>=nextNature){nextNature=t+12+Math.random()*28;
    // Fair weather: varied birds by day, insects by night. Rain: foliage gusts.
    if(o.rain>.3){burst({freq:450+Math.random()*1100,q:.5,peak:.02+o.wind*.03,a:.3,d:.6+Math.random()*1.2,buf:brownBuf});stats.natureEvents++}
    else if(!o.night&&o.biome!=="snow"&&o.biome!=="desert"){
      const n=2+Math.floor(Math.random()*3),base=1800+Math.random()*2200,pan=Math.random()*1.8-.9;
      for(let i=0;i<n;i++)tone({f:base*(.85+Math.random()*.3),f2:base*(.7+Math.random()*.8),type:"sine",peak:(o.night?.009:.022)*(1-o.wind*.5),a:.008,d:.04+Math.random()*.10,delay:i*(.08+Math.random()*.14),pan});
      stats.natureEvents++;
    }
  }
}
/* ---- one-shots ---- */
const SURF={grass:[700,.6,.09],forest:[600,.6,.1],sand:[2600,.5,.14],beach:[2400,.5,.13],desert:[2600,.5,.13],snow:[1300,.9,.16],rock:[1700,1.6,.05],water:[900,.5,.22]};
export function step(surface,speed,swim){if(!ok)return;if(swim)return burst({freq:600,q:.6,peak:.08,d:.25,type:"lowpass",buf:brownBuf});
  const s=SURF[surface]||SURF.grass;burst({freq:s[0]*(.9+Math.random()*.2),q:s[1],peak:Math.min(.22,.06+speed*.025),d:s[2]})}
let lastPickup=-Infinity,lastHowl=-Infinity;
export function pickup(){if(!ok||T()-lastPickup<1.5)return;lastPickup=T();burst({freq:700+Math.random()*300,q:.6,peak:.035,d:.07,buf:brownBuf})}
export function craft(){burst({freq:900,q:2,peak:.15,d:.06});burst({freq:1400,q:3,peak:.12,d:.05,delay:.09});tone({f:660,f2:990,type:"triangle",peak:.07,d:.12,delay:.15})}
export function place(){burst({freq:300,q:.8,peak:.25,d:.18,type:"lowpass",buf:brownBuf})}
export function whoosh(fast){burst({freq:fast?1600:900,q:.9,peak:.12,a:.04,d:fast?.12:.22})}
export function twang(){bowRelease()}
export function bowRelease(){if(!ok)return;
  // orgasmic release: crisp string crack + descending thwip + air tear
  burst({freq:3200,q:10,peak:.32,a:.001,d:.045,type:"bandpass"});
  burst({freq:2100,q:6,peak:.22,a:.001,d:.07,type:"bandpass",delay:.008});
  burst({freq:1400,q:3,peak:.14,a:.002,d:.1,type:"bandpass",delay:.02,buf:brownBuf});
  tone({f:520,f2:95,type:"sawtooth",peak:.16,a:.001,d:.26});
  tone({f:980,f2:180,type:"triangle",peak:.1,a:.001,d:.14,delay:.004});
  tone({f:220,f2:70,type:"sine",peak:.08,a:.002,d:.2,delay:.01});
  whoosh(true)}
export function arrowThump(){if(!ok)return;
  // deep body THUMP + mid punch + high air-crack on pierce
  burst({freq:70,q:.6,peak:.62,a:.001,d:.22,type:"lowpass",buf:brownBuf});
  burst({freq:140,q:1.1,peak:.45,a:.001,d:.14,type:"lowpass",buf:brownBuf,delay:.012});
  burst({freq:280,q:1.4,peak:.28,a:.001,d:.1,type:"lowpass",buf:brownBuf,delay:.02});
  tone({f:48,f2:22,type:"sine",peak:.42,a:.001,d:.32});
  tone({f:96,f2:40,type:"triangle",peak:.22,a:.001,d:.18,delay:.006});
  burst({freq:3800,q:7,peak:.28,a:.001,d:.035,type:"bandpass",delay:.004});
  burst({freq:5600,q:9,peak:.16,a:.001,d:.028,type:"highpass",delay:.014});
  burst({freq:2400,q:4,peak:.12,a:.001,d:.05,type:"bandpass",delay:.022})}
export function hit(heavy){burst({freq:heavy?280:600,q:1.2,peak:heavy?.35:.22,d:.1,type:"lowpass",buf:brownBuf});tone({f:heavy?90:140,f2:50,peak:.15,d:.12})}
export function chop(){burst({freq:420,q:2,peak:.3,d:.07});tone({f:180,f2:110,type:"triangle",peak:.1,d:.08})}
export function strike(){burst({freq:4200,q:4,peak:.2,d:.03});burst({freq:3000,q:6,peak:.1,d:.06,delay:.03})}
export function splash(big){burst({freq:big?700:1200,q:.5,peak:big?.35:.2,a:.01,d:big?.6:.3,type:"lowpass"});burst({freq:2500,q:.7,peak:.08,d:.25,delay:.05})}
export function eat(){for(let i=0;i<3;i++)burst({freq:1500+Math.random()*900,q:2,peak:.08,d:.05,delay:i*.13})}
export function drink(){for(let i=0;i<3;i++)tone({f:300+i*40,f2:200,peak:.06,d:.08,delay:i*.18})}
export function hurt(){tone({f:220,f2:140,type:"square",peak:.06,d:.15});burst({freq:400,q:1,peak:.2,d:.08,type:"lowpass",buf:brownBuf})}
export function ignite(){burst({freq:500,q:.6,peak:.3,a:.05,d:.6,type:"lowpass",buf:brownBuf})}
// Sustained synthetic calls removed: they sounded like unexplained ghost events.
export function howl(){}
export function growl(){burst({freq:250,q:.7,peak:.06,d:.2,type:"lowpass",buf:brownBuf})}
export function thunder(dist){if(!ok)return;const near=dist<600,k=Math.max(.08,Math.min(1,800/Math.max(200,dist))),pan=Math.random()*1.6-.8;
  if(near)burst({freq:1400+Math.random()*2200,q:.4,peak:.3*k,a:.003,d:.12+Math.random()*.2,pan});
  const rolls=3+Math.floor(Math.random()*4);
  for(let i=0;i<rolls;i++)burst({freq:65+Math.random()*(near?210:95),q:.4+Math.random()*.4,peak:(.2+Math.random()*.35)*k/(1+i*.2),a:near?.02+Math.random()*.1:.2+Math.random()*.3,d:1.4+Math.random()*2.8,type:"lowpass",buf:brownBuf,delay:i*(.2+Math.random()*.45),rate:.65+Math.random()*.5,pan:Math.max(-1,Math.min(1,pan+(Math.random()-.5)*.4))});
}
function celebration(){if(!ok)return;const notes=[523.25,659.25,783.99,1046.5,1318.5];
  notes.forEach((f,i)=>{tone({f,type:"sine",peak:.12,a:.005,d:1.4,delay:i*.09});tone({f:f*2.01,type:"sine",peak:.03,a:.005,d:.8,delay:i*.09})});
  burst({freq:6000,q:.8,peak:.05,a:.2,d:1.2,delay:.2})}
// Reward sounds have one explicit entry point. Routine percentages, stamina,
// warnings, curiosity, UI and repeated interactions cannot trigger it.
const milestones=new Set();
export function resetMilestones(){milestones.clear()}
export function milestone(kind,id){if(!ok||!['discovery','level_up'].includes(kind)||!id)return false;const k=kind+':'+id;if(milestones.has(k))return false;milestones.add(k);celebration();return true}
export function chime(){} // legacy routine UI calls are deliberately silent
export function warn(){} // warnings stay visible; no repeating warning bells
export function tick(){} // no periodic UI/pendulum ticks

/* ---- companions (all synthesised) ---- */
export function purr(len=1.4){if(!ok)return;const n=Math.round(len/.11);for(let i=0;i<n;i++)burst({freq:120,q:.8,peak:.07*(i%2?.7:1),a:.03,d:.08,type:"lowpass",buf:brownBuf,delay:i*.11})}
export function meow(){tone({f:520,f2:880,type:"sawtooth",peak:.035,a:.05,d:.18,glide:.14});tone({f:880,f2:430,type:"triangle",peak:.05,d:.32,delay:.16,glide:.3});burst({freq:1800,q:5,peak:.03,d:.3,delay:.05})}
export function snort(){burst({freq:380,q:1.4,peak:.22,a:.01,d:.09,type:"bandpass",buf:brownBuf});burst({freq:520,q:1.2,peak:.16,a:.01,d:.07,delay:.13,buf:brownBuf})}
export function snore(){}
export function boof(){tone({f:300,f2:180,type:"square",peak:.06,d:.1});burst({freq:600,q:1,peak:.12,d:.08,buf:brownBuf})}
export function whine(){}
export function chirp(){for(let i=0;i<4;i++)tone({f:2600+Math.random()*600,f2:3400,type:"sine",peak:.035,d:.04,delay:i*.07})}
export function caw(){for(let i=0;i<2;i++){tone({f:480,f2:380,type:"sawtooth",peak:.05,a:.02,d:.22,delay:i*.32});burst({freq:1100,q:3,peak:.06,d:.22,delay:i*.32})}}
export function heart(){tone({f:784,type:"sine",peak:.05,d:.18});tone({f:1047,type:"sine",peak:.05,d:.3,delay:.12})}
