// Pure geometry/statistics for the guided double-slit lab (no DOM). Physics from double-slit-model.js.
// Wave view: paraxial (Fresnel) wavefronts from each slit with magnified wavelength and angles, scaled
// so the phase difference at the drawn screen line equals the model's phase difference exactly.
import {slitSettings,slitAmplitudes,sampleSlit} from './double-slit-model.js?v=3.28.0';
export const WINDOW_MM=20; // detector half-width, matches the model's +/-20 mm window
export const GUIDE_LAYOUT={W:960,x0:40,x1:920,srcY:16,barY:84,scrY:300,detY:328,detH:118,hisY:476,hisH:120,H:640};
const L_=GUIDE_LAYOUT,PX_PER_M=(L_.x1-L_.x0)/(2*WINDOW_MM/1000);

// Virtual (drawn) geometry. dv: drawn slit spacing; lamV: drawn wavelength chosen so that
// kV*dv*u/Lp equals 2*pi*d*y/(lambda*L) with y=u/PX_PER_M.
export function guidedGeometry(p){
 const s=slitSettings(p),Lp=L_.scrY-L_.barY,dv=30+(s.separation-100)/300*60,scale=dv/s.separation; // px per micrometre of mask
 const lamV=scale*s.wavelength*1e-9*s.distance*PX_PER_M/(1e-6*Lp);
 return{s,Lp,scale,lamV,kV:2*Math.PI/lamV,slitX:s.positions.map(x=>x*scale),slitW:Math.max(3,s.width*scale),pxPerM:PX_PER_M};
}
export const xToMm=x=>(x-(L_.x0+L_.x1)/2)/PX_PER_M*1000;
export const mmToX=mm=>(L_.x0+L_.x1)/2+mm/1000*PX_PER_M;

// Complex amplitude of each slit's paraxial wave at drawn offset u (px, from centre) and depth z (px below barrier).
export function slitWaveAt(g,u,z){
 const Yp=u/z*g.Lp/g.pxPerM,sinPhys=Yp/Math.hypot(g.s.distance,Yp),beta=Math.PI*g.s.width*1e-6*sinPhys/(g.s.wavelength*1e-9),ap=Math.abs(beta)<1e-9?1:Math.sin(beta)/beta;
 const Y=u/z*g.Lp/g.pxPerM,c=1/Math.hypot(1,Y/g.s.distance);
 return g.slitX.map(x=>{const ph=g.kV*(z+(u*u+x*x)/(2*z)-x*u*c/z);return{re:ap*Math.cos(ph),im:ap*Math.sin(ph),freq:g.kV*Math.abs(u-x)/z}});
}
// Intensity along the drawn screen line computed from the drawn wave field.
export function drawnScreenIntensity(p,n=400){
 const g=guidedGeometry(p),out=[];
 for(let i=0;i<n;i++){const x=L_.x0+(i+.5)/n*(L_.x1-L_.x0),u=x-(L_.x0+L_.x1)/2,w=slitWaveAt(g,u,g.Lp);
  if(g.s.detector)out.push(w.reduce((a,t)=>a+t.re*t.re+t.im*t.im,0)/g.s.slits);
  else{const re=w.reduce((a,t)=>a+t.re,0),im=w.reduce((a,t)=>a+t.im,0);out.push((re*re+im*im)/g.s.slits)}}
 return out;
}
// Model intensity at the same n positions (relative units).
export function screenPattern(p,n=400){return Array.from({length:n},(_,i)=>slitAmplitudes((-WINDOW_MM+(i+.5)/n*2*WINDOW_MM)/1000,p).intensity)}
// Detection positions (mm) sampled from the model distribution.
export function sampleHitsMm(dist,n,rand=Math.random){const bins=dist.cdf.length,out=new Float64Array(n);for(let k=0;k<n;k++){const i=sampleSlit(dist.cdf,rand());out[k]=-WINDOW_MM+(i+rand())*2*WINDOW_MM/bins}return out}
export function binHits(hitsMm,bins=160){const h=new Uint32Array(bins);for(const y of hitsMm){const i=Math.floor((y+WINDOW_MM)/(2*WINDOW_MM)*bins);if(i>=0&&i<bins)h[i]++}return h}
const smooth=h=>Array.from(h,(_,i)=>((h[i-1]??h[i])+2*h[i]+(h[i+1]??h[i]))/4);
// Mean distance between neighbouring bright fringes, read only from counts. null when no fringes.
export function measuredSpacing(h,minFrac=.35){
 const s=smooth(smooth(h)),max=Math.max(...s),bw=2*WINDOW_MM/h.length,peaks=[];
 if(max<8)return null;
 for(let i=1;i<s.length-1;i++)if(s[i]>=s[i-1]&&s[i]>s[i+1]&&s[i]>minFrac*max){
  // a fringe peak must stand clearly above the valleys next to it
  let l=i,r=i;while(l>0&&s[l-1]<=s[l])l--;while(r<s.length-1&&s[r+1]<=s[r])r++;
  if(s[i]-Math.max(s[l],s[r])>.25*s[i]+2*Math.sqrt(s[i]))peaks.push(i+.5);}
 if(peaks.length<3)return null;
 return (peaks[peaks.length-1]-peaks[0])/(peaks.length-1)*bw;
}
// Fringe visibility (max-min)/(max+min) within +/- one predicted spacing of centre, after dividing
// counts by the shared single-slit envelope so only the interference term is measured.
export function centralVisibility(h,p){
 const n=h.length,env=screenPattern({...p,detector:1},n),tot=h.reduce((a,b)=>a+b,0),es=env.reduce((a,b)=>a+b,0),sp=predictedSpacingMm(p),bw=2*WINDOW_MM/n,c=n/2,k=Math.max(2,Math.round(sp/bw));
 const r=smooth(Array.from(h,(v,i)=>v/tot/(env[i]/es)));let mx=0,mn=Infinity;
 for(let i=Math.max(0,Math.floor(c-k));i<Math.min(n,Math.ceil(c+k));i++){mx=Math.max(mx,r[i]);mn=Math.min(mn,r[i])}
 return (mx-mn)/(mx+mn||1);
}
export function predictedSpacingMm(p){const s=slitSettings(p);return s.wavelength*1e-9*s.distance/(s.separation*1e-6)*1000}

