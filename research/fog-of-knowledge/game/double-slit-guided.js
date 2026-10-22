// Guided "Eureka" double-slit lab: an additional mode beside the classic lab.
// Geometry and statistics live in double-slit-guided-model.js; the drawn screen line is,
// point for point, the model intensity seen on the detector and in the histogram below it.
import {mountDoubleSlit} from './double-slit.js?v=3.29.0';
import {SLIT_DEFAULTS,DOUBLE_SLIT_LAB,slitSettings,slitDistribution,sampleSlit} from './double-slit-model.js?v=3.29.0';
import {WINDOW_MM,GUIDE_LAYOUT,guidedGeometry,slitWaveAt,screenPattern,mmToX,measuredSpacing,predictedSpacingMm} from './double-slit-guided-model.js?v=3.29.0';
const L_=GUIDE_LAYOUT;
// Guided mode always uses symmetric slits; drop any stored custom positions so 'slits' is honoured.
const S=o=>{const {positions,...r}=o;return slitSettings(r)};

const STEPS=[
 ['Predict','Draw where you think single photons will land. Drag across the graph under the detector, or use the common guess.'],
 ['Fire','Photons are sent one at a time. Each makes exactly one dot. Watch what thousands of single dots build.'],
 ['Reveal','Now the wave picture. The drawn screen line is the same detector, seen from above.'],
 ['Twist','Mark which slit each photon used with orthogonal polarizers. Nothing else changes.'],
 ['One slit','Close one slit for comparison: only the diffraction envelope remains.']];
const RATES=[1,5,20,100,500,2000];

export function mountGuidedSlit(host){
 const st={p:slitSettings(SLIT_DEFAULTS),step:0,pred:new Float32Array(160),predSet:false,hits:[],bins:new Uint32Array(160),rate:500,ramp:true,run:false,acc:0,reveal:0,flash:[],t0:performance.now(),popup:null};
 let g,dist,field=null,dead=false,raf=0,last=performance.now(),fpsN=0,fpsT=0;
 host.innerHTML=`<div class="gs"><ol class="gsSteps" role="tablist">${STEPS.map((s,i)=>`<li><button data-gs-step="${i}" role="tab">${i+1} · ${s[0]}</button></li>`).join('')}</ol>
 <div class="gsBar"><p class="gsSay" data-gs-say aria-live="polite"></p><div class="gsActs" data-gs-acts></div></div>
 <div class="gsStage"><canvas data-gs-canvas width="960" height="640" aria-label="Top-down wave view above a face-on detector and a count histogram, sharing one horizontal position axis"></canvas><div class="gsPop" data-gs-pop hidden role="dialog" aria-modal="false"></div></div>
 <div class="gsCtl">
  ${[['wavelength','Wavelength','nm',400,700,10],['separation','Slit separation d','µm',100,400,10],['width','Slit width w','µm',20,80,5],['distance','Screen distance L','m',.5,3,.1]].map(([k,l,u,a,b,s])=>`<label>${l} <output data-gs-out="${k}"></output><input type="range" data-gs-in="${k}" min="${a}" max="${b}" step="${s}" aria-label="${l} in ${u}"></label>`).join('')}
  <label>Rate <select data-gs-rate aria-label="Photons per second">${RATES.map(r=>`<option value="${r}" ${r===500?'selected':''}>${r}/s</option>`).join('')}</select></label>
  <div class="gsBtns"><button data-gs-run>▶ Fire</button><button data-gs-det aria-pressed="false">Which-path marker: OFF</button><button data-gs-slits>Slits: 2</button><button data-gs-reset>Reset dots</button><button data-gs-replay>Replay guide</button></div>
  <p class="gsRead" data-gs-read aria-live="polite"></p></div></div>`;
 const $=q=>host.querySelector(q),cv=$('[data-gs-canvas]'),cx=cv.getContext('2d'),dots=document.createElement('canvas');dots.width=960;dots.height=L_.detH;const dx=dots.getContext('2d');
 const img=document.createElement('canvas'),COLS=440,ROWS=106;img.width=COLS;img.height=ROWS;const ix=img.getContext('2d'),pix=ix.createImageData(COLS,ROWS);
 const dpr=()=>Math.min(2,window.devicePixelRatio||1);
 function resize(){const r=dpr();if(cv.width!==960*r){cv.width=960*r;cv.height=640*r}}
 function rebuild(){
  g=guidedGeometry(st.p);dist=slitDistribution(st.p,800);
  // precompute per-slit complex amplitude on the wave grid
  const n=g.slitX.length,re=new Float32Array(COLS*ROWS*n),im=new Float32Array(COLS*ROWS*n),fade=new Float32Array(COLS*ROWS);
  for(let j=0;j<ROWS;j++){const z=(j+.5)/ROWS*g.Lp;for(let i=0;i<COLS;i++){const u=L_.x0-20+(i+.5)/COLS*(L_.x1-L_.x0+40)-(L_.x0+L_.x1)/2,w=slitWaveAt(g,u,z),k=j*COLS+i;let f=1;
   w.forEach((t,s)=>{re[k*n+s]=t.re;im[k*n+s]=t.im;f=Math.min(f,Math.max(0,Math.min(1,(1.45-t.freq*(L_.x1-L_.x0+40)/COLS)/.5)))});fade[k]=f*Math.min(1,z/10)}}
  field={n,re,im,fade};
 }
 function setP(k,v){st.p=S({...st.p,[k]:v});rebuild();clearDots();sync()}
 function clearDots(){st.hits=[];st.bins.fill(0);dx.clearRect(0,0,960,L_.detH);st.acc=0;st.flash=[]}
 function emit(){const i=sampleSlit(dist.cdf,Math.random()),mm=-WINDOW_MM+(i+Math.random())*2*WINDOW_MM/dist.cdf.length;st.hits.push(mm);const b=Math.floor((mm+WINDOW_MM)/(2*WINDOW_MM)*160);if(b>=0&&b<160)st.bins[b]++;
  const x=mmToX(mm),y=6+Math.random()*(L_.detH-12);dx.fillStyle='rgba(206,246,255,.85)';dx.beginPath();dx.arc(x,y,1.25,0,7);dx.fill();if(st.flash.length<40)st.flash.push({x,y,t:performance.now()})}
 const rateNow=()=>!st.ramp?st.rate:st.hits.length<12?2:st.hits.length<80?20:st.rate;
 function say(t){$('[data-gs-say]').innerHTML=t}
 function acts(html){$('[data-gs-acts]').innerHTML=html;host.querySelectorAll('[data-gs-act]').forEach(b=>b.onclick=()=>ACT[b.dataset.gsAct]())}
 const ACT={
  guess:()=>{for(let i=0;i<160;i++){const mm=-WINDOW_MM+(i+.5)/4;st.pred[i]=Math.exp(-(((mm-4)/2.2)**2))+Math.exp(-(((mm+4)/2.2)**2))}st.predSet=true;sync()},
  clearPred:()=>{st.pred.fill(0);st.predSet=false;sync()},
  fire:()=>go(1),reveal:()=>go(2),twist:()=>go(3),single:()=>go(4),
  free:()=>{st.step=5;st.ramp=false;closePop();sync()},
  skip:()=>{st.step=5;st.ramp=false;st.reveal=1;closePop();sync()},
 };
 function go(n){closePop();st.step=n;st.run=false;
  if(n===0){st.reveal=0;st.p=S({...st.p,detector:0,slits:2});rebuild();clearDots()}
  if(n===1){st.reveal=0;st.p=S({...st.p,detector:0,slits:2});rebuild();clearDots();st.ramp=true;st.run=true}
  if(n===2){st.revealT=performance.now();if(st.hits.length<1500){st.ramp=false;st.run=true}setTimeout(()=>{if(!dead&&st.step===2)eureka(1)},2600)}
  if(n===3){st.reveal=1;st.p=S({...st.p,detector:1,slits:2});rebuild();clearDots();st.ramp=true;st.run=true;st.twistT=performance.now()}
  if(n===4){st.reveal=1;st.p=S({...st.p,detector:0,slits:1});rebuild();clearDots();st.ramp=false;st.run=true}
  sync()}
 function closePop(){$('[data-gs-pop]').hidden=true;st.popup=null}
 function eureka(which){
  const sp=predictedSpacingMm(st.p),m=measuredSpacing(st.bins),pop=$('[data-gs-pop]');st.popup=which;
  pop.innerHTML=which===1?`<h3>Eureka: every photon is one dot, yet the dots obey a wave.</h3>
  <p>Each photon was detected as a <b>single localized event</b>, never a smear. The odds of a dot at position x are</p>
  <p class="gsEq">P(x) ∝ |ψ<sub>1</sub>(x) + ψ<sub>2</sub>(x)|²</p>
  <p>The amplitudes for the two open slits are <b>added first, then squared</b>. Where they arrive in step, the probability is enhanced (bright fringes); where they arrive half a wavelength out of step, they cancel (dark fringes). That is why the bright bands on the wave view's screen line fall exactly on the stacked dots.</p>
  <p>Fringe spacing Δx ≈ λL/d = ${sp.toFixed(2)} mm${m?` · measured from your dots: ${m.toFixed(2)} mm`:''}.</p>
  <p class="gsFine">The model does not assign a trajectory to any individual photon; it predicts where detections are likely.</p>
  <div class="gsPopActs"><a href="../index.html?node=${encodeURIComponent(DOUBLE_SLIT_LAB.atlas)}" target="_blank" rel="noopener">Explore in the atlas: Quantum mechanics ↗</a><button data-gs-act="twist">Next: the twist →</button></div>`
  :`<h3>Eureka: path information removes the interference.</h3>
  <p>Orthogonal polarizers (H at one slit, V at the other) leave a <b>physical record</b> of which slit each photon used. The two alternatives are now distinguishable, so <b>probabilities add instead of amplitudes</b>:</p>
  <p class="gsEq">P(x) ∝ |ψ<sub>1</sub>(x)|² + |ψ<sub>2</sub>(x)|²</p>
  <p>The cross term that made the fringes is gone. At this distance the two single-slit patterns overlap almost completely, so one broad diffraction hump remains, not two sharp bumps behind the slits.</p>
  <p>No one has to read the record; its existence is enough. This is <b>complementarity</b>: complete which-path information and full fringe visibility cannot coexist.</p>
  <div class="gsPopActs"><button data-gs-act="single">Compare: one slit →</button><button data-gs-act="free">Free play</button></div>`;
  pop.hidden=false;pop.querySelectorAll('[data-gs-act]').forEach(b=>b.onclick=()=>ACT[b.dataset.gsAct]());
 }
 function sync(){
  const s=st.p,sp=predictedSpacingMm(s);
  host.querySelectorAll('[data-gs-step]').forEach(b=>{const i=+b.dataset.gsStep;b.setAttribute('aria-selected',i===st.step);b.classList.toggle('on',i===st.step);b.classList.toggle('done',i<st.step);b.onclick=()=>go(i)});
  for(const k of ['wavelength','separation','width','distance']){$(`[data-gs-in="${k}"]`).value=s[k];$(`[data-gs-out="${k}"]`).textContent=k==='wavelength'?`${s[k]} nm`:k==='distance'?`${s[k].toFixed(1)} m`:`${s[k]} µm`}
  $('[data-gs-det]').textContent='Which-path marker: '+(s.detector?'ON':'OFF');$('[data-gs-det]').setAttribute('aria-pressed',!!s.detector);$('[data-gs-slits]').textContent='Slits: '+s.slits;$('[data-gs-run]').textContent=st.run?'❚❚ Pause':'▶ Fire';
  const step=st.step;
  if(step===0){say(`<b>1 · Predict.</b> ${STEPS[0][1]}`);acts(`<button data-gs-act="guess">Use the common guess (two bumps)</button><button data-gs-act="clearPred">Clear</button><button class="primary" data-gs-act="fire" ${st.predSet?'':'disabled'}>Fire photons →</button><button data-gs-act="skip">Skip guide</button>`)}
  else if(step===1)say(`<b>2 · Fire.</b> ${STEPS[1][1]} Your prediction is the dashed gold line.`),acts(`<button class="primary" data-gs-act="reveal" ${st.hits.length>=400?'':'disabled'}>Reveal the wave picture →</button><button data-gs-act="skip">Skip guide</button>`);
  else if(step===2)say(`<b>3 · Reveal.</b> ${STEPS[2][1]} Bright bands (amplitudes in step) line up with the piles of dots.`),acts(`<button data-gs-act="twist">Next: the twist →</button>`);
  else if(step===3)say(`<b>4 · Twist.</b> ${STEPS[3][1]} Cyan: H-marked path. Amber: V-marked path. Orthogonal records do not interfere.`),acts(`<button data-gs-act="single">Compare: one slit →</button><button data-gs-act="free">Free play</button>`);
  else if(step===4)say(`<b>5 · One slit.</b> ${STEPS[4][1]} First dark points near x ≈ ±λL/w = ±${(s.wavelength*1e-9*s.distance/(s.width*1e-6)*1000).toFixed(1)} mm.`),acts(`<button data-gs-act="free">Free play</button>`);
  else say('<b>Free play.</b> Change λ, d, w and L, toggle the which-path marker, and compare measured fringe spacing with λL/d.'),acts('');
 }
 function readout(){
  const s=st.p,sp=predictedSpacingMm(s),m=s.slits===2&&!s.detector&&st.hits.length>=1500?measuredSpacing(st.bins):null;
  $('[data-gs-read]').textContent=`${st.hits.length.toLocaleString()} detections · ${rateNow()}/s · ${s.slits===2&&!s.detector?`predicted spacing λL/d = ${sp.toFixed(2)} mm · measured ${m?m.toFixed(2)+' mm':'— (need ≥1,500 dots)'}`:s.detector?'which-path marked: no interference term':'single slit: envelope only'}`;
 }
 // ---------- drawing ----------
 function drawWave(t,alpha){
  const n=field.n,ph=(t/1000)*2*Math.PI*0.9,c=Math.cos(ph),sn=Math.sin(ph),d=pix.data,det=st.p.detector;
  for(let k=0;k<COLS*ROWS;k++){const o=k*4,f=field.fade[k];let r=0,gg=0,b=0;
   if(!det){let re=0,im=0;for(let s=0;s<n;s++){re+=field.re[k*n+s];im+=field.im[k*n+s]}const v=(re*c+im*sn)/n,a=Math.sqrt(re*re+im*im)/n;
    const cr=Math.max(0,v),tr=Math.max(0,-v);r=40*a+150*cr*cr+10*tr;gg=70*a+170*cr+30*tr;b=110*a+140*cr+80*tr}
   else for(let s=0;s<n;s++){const re=field.re[k*n+s],im=field.im[k*n+s],v=Math.max(0,re*c+im*sn)/n,a=Math.sqrt(re*re+im*im)/n;
    if(s===0){r+=20*a+60*v;gg+=60*a+190*v;b+=80*a+200*v}else{r+=80*a+210*v;gg+=55*a+150*v;b+=15*a+40*v}}
   d[o]=r*f;d[o+1]=gg*f;d[o+2]=b*f;d[o+3]=255*alpha}
  ix.putImageData(pix,0,0);cx.imageSmoothingEnabled=true;cx.drawImage(img,L_.x0-20,L_.barY,L_.x1-L_.x0+40,g.Lp);
  // incoming plane wave above the barrier
  for(let y=L_.srcY+8;y<L_.barY;y+=1){const v=Math.cos(g.kV*(y-L_.barY)-ph);if(v>0){cx.fillStyle=`rgba(120,220,240,${(.55*v*v*alpha).toFixed(3)})`;cx.fillRect(L_.x0+300,y,L_.x1-L_.x0-600,1)}}
 }
 function draw(t){
  resize();const r=dpr();cx.setTransform(r,0,0,r,0,0);cx.fillStyle='#050b14';cx.fillRect(0,0,960,640);
  const s=st.p,rv=st.step>=2||st.step===5?Math.min(1,st.reveal):0;
  // wave area frame
  cx.fillStyle='#07131f';cx.fillRect(L_.x0-20,L_.srcY-6,L_.x1-L_.x0+40,L_.scrY-L_.srcY+12);
  if(rv>0)drawWave(t,rv);
  if(rv<1){cx.fillStyle=`rgba(7,19,31,${1-rv})`;cx.fillRect(L_.x0-20,L_.srcY+4,L_.x1-L_.x0+40,L_.scrY-L_.srcY-6);if(rv<.05){cx.fillStyle='#5f7e95';cx.font='600 15px system-ui';cx.textAlign='center';cx.fillText('Top-down wave view hidden until you have seen the dots',480,190)}}
  // source, barrier, slits
  cx.fillStyle='#ffe28a';cx.fillRect(470,L_.srcY-4,20,8);cx.font='600 11px system-ui';cx.textAlign='left';cx.fillStyle='#9fb6c9';cx.fillText('SOURCE · single photons, λ = '+s.wavelength+' nm',498,L_.srcY+4);
  cx.fillStyle='#6f8798';cx.fillRect(L_.x0-20,L_.barY-3,L_.x1-L_.x0+40,6);cx.fillStyle='#050b14';
  g.slitX.forEach((x,i)=>{const c=480+x;cx.fillRect(c-g.slitW/2,L_.barY-4,g.slitW,8);if(s.detector){cx.fillStyle=i?'#f0b04a':'#5fdcf0';cx.fillRect(c-g.slitW/2-1,L_.barY-8,g.slitW+2,3);cx.fillStyle='#050b14'}});
  cx.fillStyle='#9fb6c9';cx.fillText(s.slits===1?'ONE SLIT':`BARRIER · d = ${s.separation} µm, w = ${s.width} µm${s.detector?' · H/V path markers':''}`,L_.x0-14,L_.barY-9);
  // screen line coloured by model intensity
  const pat=screenPattern(s,440),pm=Math.max(...pat);
  for(let i=0;i<440;i++){const v=pat[i]/pm;cx.fillStyle=`rgba(${120+135*v|0},${200+55*v|0},255,${(.15+.85*v*rv+.15).toFixed(3)})`;cx.fillRect(L_.x0+i*2,L_.scrY-3,2,6)}
  cx.fillStyle='#9fb6c9';cx.textAlign='right';cx.fillText(`SCREEN LINE (seen from above) · L = ${s.distance.toFixed(1)} m`,L_.x1+16,L_.scrY-8);cx.textAlign='left';
  cx.fillStyle='#5f7e95';cx.font='10px system-ui';cx.textAlign='right';cx.fillText('not to scale: wavelength and angles magnified · paraxial wavefronts',L_.x1+16,L_.barY+16);cx.textAlign='left';
  // detector face-on
  cx.fillStyle='#0b1724';cx.fillRect(L_.x0,L_.detY,L_.x1-L_.x0,L_.detH);cx.strokeStyle='#2b4a61';cx.strokeRect(L_.x0+.5,L_.detY+.5,L_.x1-L_.x0-1,L_.detH-1);
  cx.drawImage(dots,0,0,960,L_.detH,0,L_.detY,960,L_.detH);
  const now=performance.now();st.flash=st.flash.filter(f=>now-f.t<450);for(const f of st.flash){const a=1-(now-f.t)/450;cx.strokeStyle=`rgba(255,240,170,${a})`;cx.beginPath();cx.arc(f.x,L_.detY+f.y,2+10*(1-a),0,7);cx.stroke()}
  cx.font='600 11px system-ui';cx.fillStyle='#9fb6c9';cx.fillText('DETECTOR · the same screen seen face-on · one dot = one detected photon',L_.x0,L_.detY-6);
  // histogram
  const hy=L_.hisY,hh=L_.hisH,bmax=Math.max(4,...st.bins),bw=(L_.x1-L_.x0)/160;cx.fillStyle='#0b1724';cx.fillRect(L_.x0,hy,L_.x1-L_.x0,hh);
  cx.fillStyle='#5fc8e6';for(let i=0;i<160;i++){const h=st.bins[i]/bmax*(hh-8);cx.fillRect(L_.x0+i*bw+.5,hy+hh-h,bw-1,h)}
  // expected counts |psi1+psi2|^2 (or sum of squares) curve in reveal
  if(rv>0&&st.hits.length){const e=new Float64Array(160);for(let i=0;i<800;i++)e[i/5|0]+=dist.pdf[i]*st.hits.length;cx.strokeStyle=`rgba(255,255,255,${.9*rv})`;cx.lineWidth=2;cx.beginPath();for(let i=0;i<160;i++){const x=L_.x0+(i+.5)*bw,y=hy+hh-e[i]/bmax*(hh-8);i?cx.lineTo(x,y):cx.moveTo(x,y)}cx.stroke();cx.lineWidth=1}
  if(st.predSet){const pmx=Math.max(...st.pred)||1,scale=st.hits.length?Math.max(...st.bins)/pmx:(hh-8)/pmx/((hh-8)/bmax);cx.setLineDash([6,4]);cx.strokeStyle='#ffc857';cx.lineWidth=2;cx.beginPath();for(let i=0;i<160;i++){const v=st.hits.length?st.pred[i]*scale/bmax:st.pred[i]/pmx,x=L_.x0+(i+.5)*bw,y=hy+hh-v*(hh-8);i?cx.lineTo(x,y):cx.moveTo(x,y)}cx.stroke();cx.setLineDash([]);cx.lineWidth=1}
  cx.fillStyle='#9fb6c9';cx.fillText(st.step===0?'YOUR PREDICTION · drag here to draw where dots will pile up':'COUNTS PER 0.25 mm'+(rv>0?(s.detector?'  ·  white: |ψ₁|² + |ψ₂|²':s.slits===1?'  ·  white: single-slit envelope':'  ·  white: |ψ₁ + ψ₂|² prediction'):''),L_.x0,hy-6);
  // shared axis
  cx.fillStyle='#7f95ab';cx.font='10px system-ui';cx.textAlign='center';for(let mm=-20;mm<=20;mm+=5){const x=mmToX(mm);cx.fillRect(x,hy+hh,1,4);cx.fillText(mm+' mm',x,hy+hh+15)}cx.textAlign='left';
  // "this line = that screen" links at model maxima
  if(rv>.3&&s.slits===2&&!s.detector){const sp=predictedSpacingMm(s);cx.setLineDash([3,5]);cx.strokeStyle=`rgba(255,226,138,${.5*rv})`;for(let m=-3;m<=3;m++){const x=mmToX(m*sp);if(x<L_.x0||x>L_.x1)continue;cx.beginPath();cx.moveTo(x,L_.scrY+4);cx.lineTo(x,hy+hh);cx.stroke()}cx.setLineDash([])}
  else{cx.strokeStyle='rgba(127,149,171,.35)';cx.setLineDash([2,6]);for(const x of [L_.x0,L_.x1]){cx.beginPath();cx.moveTo(x,L_.scrY);cx.lineTo(x,L_.detY);cx.stroke()}cx.setLineDash([])}
 }
 function tick(now){if(dead||!host.isConnected)return;const dt=Math.min(100,now-last);last=now;
  if(st.run&&!document.hidden){st.acc+=dt/1000*rateNow();let k=0;while(st.acc>=1&&k<400){st.acc--;k++;emit()}if(st.hits.length>=60000)st.run=false;
   if(st.step===1&&st.hits.length>=400&&$('[data-gs-act="reveal"]')?.disabled)sync();
   if(st.step===2&&st.hits.length>=4000)st.run=false;
   if(st.step===3&&st.hits.length>=3000&&!st.popup&&st.p.detector){st.run=false;eureka(2)}
   if(st.step===4&&st.hits.length>=4000)st.run=false;
   if(st.step===1&&st.hits.length>=3000)st.run=false;
   $('[data-gs-run]').textContent=st.run?'❚❚ Pause':'▶ Fire';}
  if(st.step>=2&&st.reveal<1)st.reveal=Math.min(1,st.reveal+dt/1600);
  readout();draw(now-st.t0);fpsN++;fpsT+=dt;if(fpsT>1000){host.dataset.fps=Math.round(fpsN*1000/fpsT);fpsN=0;fpsT=0}
  raf=requestAnimationFrame(tick)}
 // prediction drawing
 let drawing=false,lastBin=-1;
 const predAt=e=>{const b=cv.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*960,y=(e.clientY-b.top)/b.height*640;if(y<L_.detY-10)return;const i=Math.max(0,Math.min(159,Math.floor((x-L_.x0)/((L_.x1-L_.x0)/160)))),v=Math.max(0,Math.min(1,(L_.hisY+L_.hisH-y)/(L_.hisH-8)));
  if(lastBin<0)lastBin=i;const a=Math.min(i,lastBin),c=Math.max(i,lastBin);for(let k=a;k<=c;k++)st.pred[k]=v;lastBin=i;st.predSet=true};
 cv.addEventListener('pointerdown',e=>{if(st.step!==0)return;drawing=true;lastBin=-1;cv.setPointerCapture?.(e.pointerId);predAt(e)});
 cv.addEventListener('pointermove',e=>{if(drawing)predAt(e)});
 cv.addEventListener('pointerup',()=>{if(drawing){drawing=false;sync()}});
 host.querySelectorAll('[data-gs-in]').forEach(el=>el.oninput=()=>setP(el.dataset.gsIn,+el.value));
 $('[data-gs-rate]').onchange=e=>{st.rate=+e.target.value;st.ramp=false};
 $('[data-gs-run]').onclick=()=>{st.run=!st.run;sync()};
 $('[data-gs-det]').onclick=()=>{setP('detector',st.p.detector?0:1);if(st.step<3){st.step=5;st.reveal=1}st.run=true;sync()};
 $('[data-gs-slits]').onclick=()=>{setP('slits',st.p.slits===2?1:2);st.run=true;sync()};
 $('[data-gs-reset]').onclick=()=>{clearDots();sync()};
 $('[data-gs-replay]').onclick=()=>{st.pred.fill(0);st.predSet=false;go(0)};
 rebuild();sync();raf=requestAnimationFrame(tick);
 const api={go,eureka,state:st,emit:n=>{for(let i=0;i<n;i++)emit()}};host._guided=api;
 return()=>{dead=true;cancelAnimationFrame(raf)};
}

// Mode switch: Classic lab (unchanged, default) | Guided Eureka (new).
export function mountSlitModes(host,opts){
 host.innerHTML='<div class="gsModes" role="tablist" aria-label="Double-slit lab mode"><button role="tab" data-gs-mode="classic" aria-selected="true">Classic lab</button><button role="tab" data-gs-mode="guided" aria-selected="false">Guided Eureka <small>new</small></button></div><div data-gs-body></div>';
 const body=host.querySelector('[data-gs-body]');let dispose=null,mode='';
 const show=m=>{if(m===mode)return;mode=m;dispose?.();body.innerHTML='';dispose=m==='guided'?mountGuidedSlit(body):mountDoubleSlit(body,opts);host.querySelectorAll('[data-gs-mode]').forEach(b=>b.setAttribute('aria-selected',b.dataset.gsMode===m))};
 host.querySelectorAll('[data-gs-mode]').forEach(b=>b.onclick=()=>show(b.dataset.gsMode));show('classic');
 return()=>dispose?.();
}
