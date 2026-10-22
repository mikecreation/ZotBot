/* Fog of Knowledge: The Game — overshot water wheel physics (pure, no three.js).
 * A spring-fed flume drops water into the buckets at the top of the wheel; the weight of the
 * water on the down-going side turns the wheel, and three cam lugs on the axle lift a trip-hammer.
 *   flow    Q = Q0 · (1 + 1.5·rain) · gate                      m³/s   (gate 0 = sluice shut, 1 = open)
 *   power   P = ρ g Q H η                                       W      (H = head from flume to tailrace)
 *   torque  τ_in = m g R (2/π) η,  m = min(ρ Q π / ω, m_cap)   N·m    (water held in the loaded half)
 *   load    τ_load = τ0·sign(ω) + k·ω                           N·m    (hammer + bearing friction)
 *   steady  ω* = (−τ0 + √(τ0² + 4 k P)) / (2k)                  rad/s
 */
export const WHEEL={R:1.6,width:.6,cx:0,cy:1.85,spokes:8,buckets:24,lugs:3,axleR:.14,
 flumeY:3.55,head:3.3,eff:.7,Q0:.03,rho:1000,g:9.81,mcap:150,I:2000,tau0:300,k:1070,
 lugR:.30,lugPhase:.873,
 hammer:{pivot:[.88,2.08],tail:.28,head:[2.28,.82],drop:.23,rise:.417,fall:.47}};
export function flowOf(gate=1,rain=0,W=WHEEL){return W.Q0*(1+1.5*Math.max(0,Math.min(1,rain)))*Math.max(0,Math.min(1,gate))}
export function powerOf(Q,W=WHEEL){return W.rho*W.g*Q*W.head*W.eff}
export function torqueIn(Q,omega,W=WHEEL){if(Q<=0)return 0;const m=Math.min(W.rho*Q*Math.PI/Math.max(Math.abs(omega),.05),W.mcap);return m*W.g*W.R*(2/Math.PI)*W.eff}
export function loadTorque(omega,W=WHEEL){return (omega>1e-4?W.tau0:omega<-1e-4?-W.tau0:0)+W.k*omega}
export function steadyOmega(Q,W=WHEEL){const P=powerOf(Q,W);if(P<=0)return 0;return Math.max(0,(-W.tau0+Math.sqrt(W.tau0*W.tau0+4*W.k*P))/(2*W.k))}
export const rpm=omega=>omega*60/(2*Math.PI);
/* integrate the wheel one step: st = {omega, angle, strikes}; returns the number of hammer strikes this step */
export function stepWheel(st,dt,Q,W=WHEEL){st.omega=st.omega||0;st.angle=st.angle||0;let hits=0;const n=Math.max(1,Math.ceil(dt/.02)),h=dt/n;
 for(let i=0;i<n;i++){const tin=torqueIn(Q,st.omega,W);let net=tin-W.k*st.omega;
  // static friction: a stopped wheel starts only when the water torque beats τ0
  if(st.omega<=1e-4&&tin<=W.tau0){st.omega=0;continue}net-=W.tau0;
  st.omega=Math.max(0,st.omega+net/W.I*h);const a0=st.angle;st.angle+=st.omega*h;hits+=strikesBetween(a0,st.angle,W.lugs)}
 st.strikes=(st.strikes||0)+hits;return hits}
/* cam lift (0..1) of the helve tail for a wheel angle: a lug meets the tail 50° above horizontal and presses it down
 * until it points level (41.7% of each lug's 120° pitch), then slips off and the head drops. */
export function camLift(angle,lugs=WHEEL.lugs,H=WHEEL.hammer){const p=((angle*lugs/(2*Math.PI))%1+1)%1;return p<H.rise?p/H.rise:p<H.fall?1-(p-H.rise)/(H.fall-H.rise):0}
export function strikesBetween(a0,a1,lugs=WHEEL.lugs,H=WHEEL.hammer){const f=a=>Math.floor((a*lugs/(2*Math.PI))-H.fall);return Math.max(0,f(a1)-f(a0))}
/* the helve is a first-class lever: the cam presses the short tail (pivot → tail tip), the long arm lifts the head.
 * MA = tail/arm is the force ratio (<1: the cam pushes harder than the head weighs); arm/tail is how much farther the head moves. */
export function hammerLever(W=WHEEL){const px=W.hammer.pivot[0],tail=px-W.hammer.tail,arm=W.hammer.head[0]-px;return {tail,arm,MA:tail/arm,ratio:arm/tail}}
/* helve rotation (rad, + lifts the head) for a wheel angle */
export function helveAngle(angle,W=WHEEL){const {tail}=hammerLever(W);return Math.asin(Math.min(1,camLift(angle,W.lugs,W.hammer)*W.hammer.drop/tail))}
/* how high the hammer head rises at the top of the lift (m) */
export function headLift(W=WHEEL){const {arm,tail}=hammerLever(W);return arm*W.hammer.drop/tail}
/* flow from the gate and the weather; rain swells the spring */
export function rainOf(weather){if(!weather)return 0;const k=weather.kind||"";return k==="storm"?1:k==="rain"?Math.max(.4,weather.amt??.7):0}
