// Realistic human, pass 2: per-hand finger posing after the mixer (relaxed when empty, wrapped grip
// when carrying), anchor seated in the fist, and forearm twist sharing - checked on a stand-in rig.
import assert from 'node:assert/strict';
const THREE=await import('../vendor/three.module.min.js');
const {initRealHands,poseRealHands,HAND_POSES}=await import('../human-real.js');
function rig(){const root=new THREE.Group();
  for(const s of ['R','L']){const fore=new THREE.Bone();fore.name='DEF-forearm'+s;root.add(fore);
    const hand=new THREE.Bone();hand.name='DEF-hand'+s;hand.position.set(0,.26,0);fore.add(hand);
    const base={f_index:[0,.111,.033],f_middle:[0,.111,.005],f_ring:[0,.105,-.017],f_pinky:[0,.096,-.037],thumb:[0,.04,.028]};
    for(const [f,p] of Object.entries(base)){let par=hand;for(let i=1;i<=3;i++){const b=new THREE.Bone();b.name=`DEF-${f}0${i}${s}`;
      if(i===1){b.position.set(...p);if(f!=='thumb')b.quaternion.set(0,-Math.SQRT1_2,0,Math.SQRT1_2)}else b.position.set(0,.035,0);par.add(b);par=b}}}
  root.updateMatrixWorld(true);return root}
const model=rig(),u={held:new THREE.Group(),heldL:new THREE.Group(),once:0};
model.getObjectByName('DEF-handR').add(u.held);model.getObjectByName('DEF-handL').add(u.heldL);
const R=initRealHands(u,model);assert.ok(R&&R.R&&R.L,'both hands rigged');
// anchors seated in the palm, item +Y along the handle axis (mirrored on the left)
for(const s of ['R','L']){const a=R[s].anchor,ax=new THREE.Vector3(0,1,0).applyQuaternion(a.quaternion);
  assert.ok(a.position.length()<.13&&a.position.y>.05,'anchor in the hand '+s);assert.ok(ax.z>.85,'handle runs pinky->index '+s)}
assert.ok(Math.sign(R.R.anchor.position.x)===-Math.sign(R.L.anchor.position.x),'left grip mirrors the right');
// right hand holds an item, left is empty: they pose independently
u.held.add(new THREE.Mesh());
const ang=(b,rest)=>2*Math.acos(Math.min(1,Math.abs(b.quaternion.dot(rest))))*180/Math.PI;
for(let i=0;i<60;i++){for(const s in R)for(const k in R[s].bones)R[s].bones[k].quaternion.copy(R[s].rest[k]);poseRealHands(u,1/60)}
assert.ok(R.R.w>.99&&R.L.w<.01,'grip weight per hand');
const mid=k=>ang(R[k].bones.f_middle1,R[k].rest.f_middle1);
assert.ok(Math.abs(mid('R')-HAND_POSES.grip.f_middle[1])<2,'right middle finger wraps '+mid('R'));
assert.ok(Math.abs(mid('L')-HAND_POSES.relaxed.f_middle[1])<2,'left middle finger relaxed '+mid('L'));
for(const f of ['f_index','f_middle','f_ring','f_pinky'])for(let i=0;i<3;i++){const g=HAND_POSES.grip[f][i],r=HAND_POSES.relaxed[f][i];assert.ok(g>r&&g<=110&&r>=0&&r<45,f+i)}
// one-shot actions with an empty hand keep the clip's fist
const fist=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),1.3);u.once=1;
for(let i=0;i<60;i++){for(const s in R)for(const k in R[s].bones)R[s].bones[k].quaternion.copy(R[s].rest[k]).multiply(fist);poseRealHands(u,1/60)}
assert.ok(R.L.o<.01,'empty left hand follows the clip during a one-shot');
// twist sharing: a 60 deg wrist roll ends up split between forearm and hand, world rotation of the hand unchanged
u.once=0;const h=R.L,roll=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/3);
h.fore.quaternion.identity();h.hand.quaternion.copy(roll).multiply(h.restHand);model.updateMatrixWorld(true);
const before=h.hand.getWorldQuaternion(new THREE.Quaternion());poseRealHands(u,1/60);model.updateMatrixWorld(true);
const after=h.hand.getWorldQuaternion(new THREE.Quaternion());assert.ok(Math.abs(before.dot(after))>.9999,'hand world orientation kept');
const foreRoll=2*Math.atan2(h.fore.quaternion.y,h.fore.quaternion.w)*180/Math.PI;assert.ok(Math.abs(foreRoll-30)<1,'forearm takes half the roll '+foreRoll);
console.log('human-hands: ok');
