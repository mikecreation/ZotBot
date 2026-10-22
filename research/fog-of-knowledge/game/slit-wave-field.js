import {slitAmplitudes} from './double-slit-model.js?v=3.29.0';

// A phase illustration of the scalar far-field approximation used by the lab.
// Transverse scale expands toward the screen; the aperture is magnified.
// The visible carrier is enlarged, not a claim to resolve optical wavelengths.
export function buildWaveField(settings,cols=152,rows=100){
 const re=new Float32Array(cols*rows),im=new Float32Array(cols*rows),power=new Float32Array(cols*rows);
 for(let x=0;x<cols;x++){
  const z=settings.distance*(.25+.75*x/(cols-1));
  for(let j=0;j<rows;j++){
   const y=(-.02+(j+.5)/rows*.04)*z/settings.distance;
   const a=slitAmplitudes(y,{...settings,distance:z}),k=j*cols+x;
   re[k]=a.re*a.aperture/settings.slits;
   im[k]=a.im*a.aperture/settings.slits;
   power[k]=a.intensity/settings.slits;
  }
 }
 return{cols,rows,re,im,power};
}

export function paintWaveField(state,now){
 if(!state.waveField){state.waveField=buildWaveField(state.settings);state.waveCanvas=document.createElement('canvas');state.waveCanvas.width=state.waveField.cols;state.waveCanvas.height=state.waveField.rows;state.wavePixels=state.waveCanvas.getContext('2d').createImageData(state.waveField.cols,state.waveField.rows)}
 const f=state.waveField,p=state.wavePixels.data,packets=state.events?.packets||[],fronts=[];
 for(const packet of packets){const age=now-packet.start;if(age>=400&&age<1400)fronts.push((age-400)/1000)}
 // Each event is one finite broad pulse. Multiple events do not coherently interfere.
 // At high rate this is an occupancy view, not a sum of independent photon amplitudes.
 const occupancy=new Float32Array(f.cols);
 for(let x=0;x<f.cols;x++){const u=x/(f.cols-1);for(const t of fronts)occupancy[x]=Math.min(1,occupancy[x]+Math.exp(-(((u-t)/.14)**2)));}
 for(let x=0;x<f.cols;x++){
  const phase=x*.36-now*.012,cs=Math.cos(phase),sn=Math.sin(phase);
  for(let y=0;y<f.rows;y++){
   const k=y*f.cols+x,o=k*4,amplitude=f.re[k]*cs+f.im[k]*sn;
   const strength=state.settings.detector?Math.sqrt(f.power[k])*.65:Math.abs(amplitude),v=occupancy[x];
   const positive=amplitude>=0;p[o]=positive?65:241;p[o+1]=positive?220:172;p[o+2]=positive?239:81;p[o+3]=Math.round(210*v*Math.min(1,strength));
  }
 }
 state.waveCanvas.getContext('2d').putImageData(state.wavePixels,0,0);
 return state.waveCanvas;
}

// A profile made only from actual detections, not a path or a probability guide.
export function observedProfile(bins){return Array.from(bins,(_,i)=>(2*bins[i]+(bins[i-1]||0)+(bins[i+1]||0))/4)}

// A teaching readiness rule, not a declaration of statistical completion.
// Check every 250 dots: sufficient sample size, agreement with predicted CDF,
// and two successive stable comparisons. The resulting curve uses counts only.
export function profileReady(bins,expected,sample,tracker){
 if(sample<250||sample%250)return false;
 let sum=0,want=0,fit=0,drift=0;const cdf=[];
 for(let i=0;i<bins.length;i++){
  sum+=bins[i]/sample;for(let k=i*10;k<(i+1)*10;k++)want+=expected[k];
  cdf.push(sum);fit=Math.max(fit,Math.abs(sum-want));
  if(tracker.previous)drift=Math.max(drift,Math.abs(sum-tracker.previous[i]));
 }
 tracker.stable=sample>=2000&&tracker.previous&&fit<.04&&drift<.02?(tracker.stable||0)+1:0;
 tracker.previous=cdf;return tracker.stable>=2;
}
