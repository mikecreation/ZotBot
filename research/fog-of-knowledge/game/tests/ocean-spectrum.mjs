import assert from 'node:assert/strict';
import {ifft1,ifft2,initialSpectrum,heightFieldFFT,makeWaveSampler,jonswap,jonswapParams,significantHeight,directional,cascadeBands,DEFAULT_OCEAN,G,omegaOf,LOOP_T} from '../ocean-spectrum.js';
const results=[];const test=(name,fn)=>{try{fn();results.push({name,pass:true})}catch(e){results.push({name,pass:false,error:e.message})}};
const close=(a,b,eps,msg)=>assert.ok(Math.abs(a-b)<=eps,`${msg||''} ${a} vs ${b}`);
test('IFFT of a single bin is a pure complex exponential',()=>{const N=64,re=new Float64Array(N),im=new Float64Array(N);re[5]=1;const [r,i]=ifft1(re,im);for(let j=0;j<N;j++){close(r[j],Math.cos(2*Math.PI*5*j/N),1e-9);close(i[j],Math.sin(2*Math.PI*5*j/N),1e-9)}});
test('Stockham IFFT matches a naive inverse DFT on random data',()=>{const N=32,re=new Float64Array(N).map((_,k)=>Math.sin(k*1.7)+.3),im=new Float64Array(N).map((_,k)=>Math.cos(k*k*.13));const [r,i]=ifft1(re,im);
  for(let j=0;j<N;j++){let sr=0,si=0;for(let n=0;n<N;n++){const a=2*Math.PI*n*j/N;sr+=re[n]*Math.cos(a)-im[n]*Math.sin(a);si+=re[n]*Math.sin(a)+im[n]*Math.cos(a)}close(r[j],sr,1e-9);close(i[j],si,1e-9)}});
test('2D IFFT of a delta at DC is constant',()=>{const N=16,re=new Float64Array(N*N),im=new Float64Array(N*N);re[0]=2;const [r,i]=ifft2(re,im,N);for(let k=0;k<N*N;k++){close(r[k],2,1e-12);close(i[k],0,1e-12)}});
test('JONSWAP peaks at ωp and has the fetch-limited Hs',()=>{const p=jonswapParams({windSpeed:10,fetch:50000});let best=0,bw=0;for(let w=.2;w<5;w+=.001){const s=jonswap(w,p);if(s>best){best=s;bw=w}}close(bw,p.wp,.01);const hs=significantHeight(p);assert.ok(hs>.9&&hs<2.2,'Hs '+hs);assert.equal(jonswap(0,p),0)});
test('directional spreading integrates to 1',()=>{for(const s of [1,4,12]){let a=0;const d=.001;for(let t=-Math.PI;t<Math.PI;t+=d)a+=directional(t,s)*d;close(a,1,2e-3,'s='+s)}});
test('cascade bands are contiguous and resolvable',()=>{const b=cascadeBands(DEFAULT_OCEAN);for(let i=1;i<b.length;i++)assert.equal(b[i][0],b[i-1][1]);DEFAULT_OCEAN.cascades.forEach((c,i)=>{if(i<b.length-1)assert.ok(b[i][1]<Math.PI*64/c.L)})});
test('spectrum generation is deterministic per seed',()=>{const band=cascadeBands(DEFAULT_OCEAN)[1];const a=initialSpectrum(32,64,band),b=initialSpectrum(32,64,band);assert.deepEqual(a,b);const c=initialSpectrum(32,64,band,{...DEFAULT_OCEAN,seed:7});assert.notDeepEqual(a,c)});
test('FFT height field is real-valued, time-deterministic and equals the CPU direct sum (buoyancy sampler)',()=>{const N=32,L=64,band=cascadeBands(DEFAULT_OCEAN)[1],h0=initialSpectrum(N,L,band);
  const f1=heightFieldFFT(h0,N,L,3.25),f2=heightFieldFFT(h0,N,L,3.25);assert.deepEqual(f1,f2);
  const samp=makeWaveSampler(h0,N,L,1e9);let rms=0;for(let m=0;m<N;m+=3)for(let n=0;n<N;n+=5){close(samp(n*L/N,m*L/N,3.25),f1[m*N+n],1e-6);rms+=f1[m*N+n]**2}assert.ok(rms>0);
  // h(k) hermitian ⇒ imaginary part of the IFFT vanishes
  const dk=2*Math.PI/L,re=new Float64Array(N*N),im=new Float64Array(N*N);for(let i=0;i<N*N;i++){const n=i%N,m=(i/N)|0,w=omegaOf(Math.hypot((n-N/2)*dk,(m-N/2)*dk)),c=Math.cos(w),s=Math.sin(w);re[i]=h0[i*4]*c-h0[i*4+1]*s+h0[i*4+2]*c+h0[i*4+3]*s;im[i]=h0[i*4]*s+h0[i*4+1]*c-h0[i*4+2]*s+h0[i*4+3]*c}
  const [,ii]=ifft2(re,im,N);let mx=0;for(let k=0;k<N*N;k++){if(((k%N)===0)||(((k/N)|0)===0))continue;mx=Math.max(mx,Math.abs(ii[k]))}assert.ok(mx<1e-6,'imag '+mx)});
test('surface loops exactly every LOOP_T seconds',()=>{const N=16,L=64,h0=initialSpectrum(N,L,cascadeBands(DEFAULT_OCEAN)[1]);const a=heightFieldFFT(h0,N,L,12.5),b=heightFieldFFT(h0,N,L,12.5+LOOP_T);for(let i=0;i<N*N;i++)close(a[i],b[i],1e-6)});
test('swell sampler with few modes stays close to the full sum',()=>{const N=64,L=420,band=cascadeBands(DEFAULT_OCEAN)[0],h0=initialSpectrum(N,L,band),full=makeWaveSampler(h0,N,L,1e9),fast=makeWaveSampler(h0,N,L,800);let e=0,s=0;for(let i=0;i<50;i++){const x=i*13.7,z=i*-7.1,t=i*.9;e+=(full(x,z,t)-fast(x,z,t))**2;s+=full(x,z,t)**2}assert.ok(e/s<.2,'rel err '+e/s)});
console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,failed:results.filter(r=>!r.pass)},null,2));if(results.some(r=>!r.pass))process.exitCode=1;
