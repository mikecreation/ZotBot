/* Ocean wave spectrum + FFT reference (pure JS, no three.js) for the FFT ocean in ocean.js.
 * Our own implementation of published methods:
 *  - J. Tessendorf, "Simulating Ocean Water" (SIGGRAPH course notes, 2001): h̃(k,t)=h̃0(k)e^{iωt}+conj(h̃0(−k))e^{−iωt},
 *    choppy displacement D=iλ(k/|k|)h̃, Jacobian J=(1+∂Dx/∂x)(1+∂Dz/∂z)−(∂Dx/∂z)².
 *  - JONSWAP (Hasselmann et al. 1973): S(ω)=αg²ω⁻⁵ exp(−5/4(ωp/ω)⁴) γ^r, α=0.076(U²/(Fg))^0.22, ωp=22(g²/(UF))^(1/3).
 *  - Directional spreading D(θ)∝|cos((θ−θw)/2)|^{2s} (Mitsuyasu/Hasselmann), normalized over θ.
 *  - Deep-water dispersion ω²=gk.
 * Radix-2 Stockham autosort IFFT: the same per-texel gather the GPU shader runs (see stockhamGather). */
export const G=9.81;
/** Looping dispersion (Tessendorf §4.3): ω quantised to multiples of 2π/LOOP_T so the surface repeats every LOOP_T seconds
 *  and the GPU can run on t mod LOOP_T in float32 without phase drift. */
export const LOOP_T=600;const W0=2*Math.PI/LOOP_T;
export function omegaOf(k){return Math.floor(Math.sqrt(G*k)/W0)*W0}
export function mulberry32(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function gaussPair(r){const u=Math.max(1e-12,r()),v=r(),m=Math.sqrt(-2*Math.log(u));return [m*Math.cos(2*Math.PI*v),m*Math.sin(2*Math.PI*v)]}
function lgamma(x){const g=7,c=[0.99999999999980993,676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
  if(x<.5)return Math.log(Math.PI/Math.abs(Math.sin(Math.PI*x)))-lgamma(1-x);x-=1;let a=c[0];const t=x+g+.5;for(let i=1;i<9;i++)a+=c[i]/(x+i);return .5*Math.log(2*Math.PI)+(x+.5)*Math.log(t)-t+Math.log(a)}
/** JONSWAP frequency spectrum S(ω) [m²·s]. o: {windSpeed U10 m/s, fetch m, gamma, peakOmega (optional override), alpha (optional override)} */
export function jonswapParams(o){const U=o.windSpeed,F=o.fetch;
  const wp=o.peakWavelength?Math.sqrt(2*Math.PI*G/o.peakWavelength):22*Math.cbrt(G*G/(U*F));
  const alpha=o.alpha??.076*Math.pow(U*U/(F*G),.22);return {wp,alpha,gamma:o.gamma??3.3}}
export function jonswap(w,p){if(w<=1e-6)return 0;const s=w<=p.wp?.07:.09,r=Math.exp(-((w-p.wp)**2)/(2*s*s*p.wp*p.wp));
  return p.alpha*G*G/w**5*Math.exp(-1.25*(p.wp/w)**4)*Math.pow(p.gamma,r)}
/** spreading exponent s(ω) (Hasselmann 1980 fit), scaled by `spread` (1 = nominal, larger = narrower) */
export function spreadS(w,wp,spread=1){const x=w/wp;return Math.max(.5,(x<=1?6.97*Math.pow(x,4.06):9.77*Math.pow(x,-2.5))*spread)}
export function directional(theta,s){const c=Math.abs(Math.cos(theta/2));const norm=Math.exp(lgamma(s+1)-lgamma(s+.5))/(2*Math.sqrt(Math.PI));return norm*Math.pow(c,2*s)}
/** significant wave height Hs=4√m0 of a JONSWAP spectrum (numeric integral) */
export function significantHeight(p){let m0=0;const dw=.002;for(let w=dw;w<12;w+=dw)m0+=jonswap(w,p)*dw;return 4*Math.sqrt(m0)}
/** default spectrum: local wind sea + a long, narrow swell (scaled to a target Hs) */
export const DEFAULT_OCEAN={seed:1337,windSpeed:7.5,fetch:40000,windDir:.55,spread:1,gamma:3.3,
  swell:{peakWavelength:140,height:.35,dir:.9,spread:12},choppy:[.75,1.0,.9],
  cascades:[{L:420},{L:64},{L:9.5}]};
export function cascadeBands(cfg){const Ls=cfg.cascades.map(c=>c.L);const b=[];for(let i=0;i<Ls.length;i++){const lo=i===0?0:2*Math.PI/Ls[i]*4,hi=i===Ls.length-1?Infinity:2*Math.PI/Ls[i+1]*4;b.push([lo,hi])}return b}
/** Wave-number spectrum density Ψ(kx,kz) [m⁴]: S(ω)D(θ)·(dω/dk)/k */
export function makeSpectrum(cfg=DEFAULT_OCEAN){
  const wind=jonswapParams({windSpeed:cfg.windSpeed,fetch:cfg.fetch,gamma:cfg.gamma});
  let swell=null;if(cfg.swell&&cfg.swell.height>0){swell=jonswapParams({windSpeed:cfg.windSpeed,fetch:cfg.fetch,gamma:cfg.gamma,peakWavelength:cfg.swell.peakWavelength,alpha:1});
    swell.alpha=(cfg.swell.height/significantHeight(swell))**2}
  return (kx,kz)=>{const k=Math.hypot(kx,kz);if(k<1e-6)return 0;const w=Math.sqrt(G*k),dwdk=G/(2*w),th=Math.atan2(kz,kx);
    let E=jonswap(w,wind)*directional(th-cfg.windDir,spreadS(w,wind.wp,cfg.spread));
    if(swell)E+=jonswap(w,swell)*directional(th-cfg.swell.dir,spreadS(w,swell.wp,cfg.swell.spread));
    return E*dwdk/k*Math.exp(-k*k*.0004)}}   // capillary damping of the tiniest wavelengths
/** Initial spectrum h̃0 for one cascade: Float32Array N*N*4 = (h0.re,h0.im, conj(h0(−k)).re, conj(h0(−k)).im).
 *  Texel (n,m) ↔ k=(2π(n−N/2)/L, 2π(m−N/2)/L). Deterministic for a given seed. */
export function initialSpectrum(N,L,band,cfg=DEFAULT_OCEAN,cascadeIndex=0,spec=makeSpectrum(cfg)){
  const r=mulberry32((cfg.seed*2654435761+cascadeIndex*97+N*13)>>>0),dk=2*Math.PI/L,h0=new Float32Array(N*N*2),out=new Float32Array(N*N*4);
  for(let m=0;m<N;m++)for(let n=0;n<N;n++){const kx=(n-N/2)*dk,kz=(m-N/2)*dk,k=Math.hypot(kx,kz);const [a,b]=gaussPair(r);
    const amp=k>=band[0]&&k<band[1]&&k>0?Math.sqrt(spec(kx,kz)*dk*dk/2):0;h0[(m*N+n)*2]=a*amp;h0[(m*N+n)*2+1]=b*amp}
  for(let m=0;m<N;m++)for(let n=0;n<N;n++){const i=m*N+n,j=((N-m)%N)*N+(N-n)%N;out[i*4]=h0[i*2];out[i*4+1]=h0[i*2+1];out[i*4+2]=h0[j*2];out[i*4+3]=-h0[j*2+1]}
  return out}
/** Stockham radix-2 gather for output index o at stage s (span p=2^s): returns [i0, i1, k, plusSign]. Mirrors the GLSL. */
export function stockhamGather(o,s,N){const p=1<<s,k=o&(p-1),q=o>>s,i=(q>>1)*p+k;return [i,i+N/2,k,(q&1)===0]}
/** in-place-free inverse FFT (no 1/N): x(j)=Σ X(n)e^{+2πinj/N}. re/im Float64Array */
export function ifft1(re,im){const N=re.length,S=Math.log2(N);let ar=Float64Array.from(re),ai=Float64Array.from(im);
  for(let s=0;s<S;s++){const br=new Float64Array(N),bi=new Float64Array(N),p=1<<s;
    for(let o=0;o<N;o++){const [i0,i1,k,plus]=stockhamGather(o,s,N),a=Math.PI*k/p,wr=Math.cos(a),wi=Math.sin(a),tr=wr*ar[i1]-wi*ai[i1],ti=wr*ai[i1]+wi*ar[i1];
      br[o]=plus?ar[i0]+tr:ar[i0]-tr;bi[o]=plus?ai[i0]+ti:ai[i0]-ti}ar=br;ai=bi}
  return [ar,ai]}
export function ifft2(re,im,N){let r=Float64Array.from(re),i=Float64Array.from(im);
  for(let y=0;y<N;y++){const [a,b]=ifft1(r.subarray(y*N,y*N+N),i.subarray(y*N,y*N+N));r.set(a,y*N);i.set(b,y*N)}
  for(let x=0;x<N;x++){const cr=new Float64Array(N),ci=new Float64Array(N);for(let y=0;y<N;y++){cr[y]=r[y*N+x];ci[y]=i[y*N+x]}const [a,b]=ifft1(cr,ci);for(let y=0;y<N;y++){r[y*N+x]=a[y];i[y*N+x]=b[y]}}
  return [r,i]}
/** Height field h(x_j,z_m) at texel grid (x=jL/N) and time t through the FFT path (same math as the GPU). */
export function heightFieldFFT(h0,N,L,t){const re=new Float64Array(N*N),im=new Float64Array(N*N),dk=2*Math.PI/L;
  for(let m=0;m<N;m++)for(let n=0;n<N;n++){const i=m*N+n,k=Math.hypot((n-N/2)*dk,(m-N/2)*dk),w=omegaOf(k),c=Math.cos(w*t),s=Math.sin(w*t);
    re[i]=h0[i*4]*c-h0[i*4+1]*s+h0[i*4+2]*c+h0[i*4+3]*s;im[i]=h0[i*4]*s+h0[i*4+1]*c-h0[i*4+2]*s+h0[i*4+3]*c}
  const [r]=ifft2(re,im,N);for(let m=0;m<N;m++)for(let n=0;n<N;n++)if((n+m)&1)r[m*N+n]*=-1;return r}
/** CPU sampler: direct sum over the strongest modes of a cascade (for buoyancy). Exact when count covers all non-zero modes. */
export function makeWaveSampler(h0,N,L,count=800){const dk=2*Math.PI/L,modes=[];
  for(let m=0;m<N;m++)for(let n=0;n<N;n++){const i=m*N+n,e=Math.hypot(h0[i*4],h0[i*4+1])+Math.hypot(h0[i*4+2],h0[i*4+3]);if(e>0)modes.push([e,(n-N/2)*dk,(m-N/2)*dk,h0[i*4],h0[i*4+1],h0[i*4+2],h0[i*4+3]])}
  modes.sort((a,b)=>b[0]-a[0]);const M=modes.slice(0,count),K=M.length,kx=new Float64Array(K),kz=new Float64Array(K),w=new Float64Array(K),HR=new Float64Array(K),HI=new Float64Array(K);
  M.forEach((m,i)=>{kx[i]=m[1];kz[i]=m[2];w[i]=omegaOf(Math.hypot(m[1],m[2]))});let lastT=NaN;
  // per time step: h̃(k,t) for every mode (cached), then per sample Σ Re(h̃ e^{ik·x})
  return (x,z,t)=>{if(t!==lastT){lastT=t;for(let i=0;i<K;i++){const m=M[i],c=Math.cos(w[i]*t),s=Math.sin(w[i]*t);HR[i]=m[3]*c-m[4]*s+m[5]*c+m[6]*s;HI[i]=m[3]*s+m[4]*c-m[5]*s+m[6]*c}}
    let h=0;for(let i=0;i<K;i++){const ph=kx[i]*x+kz[i]*z;h+=HR[i]*Math.cos(ph)-HI[i]*Math.sin(ph)}return h}}
