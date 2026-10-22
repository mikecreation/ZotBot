import bpy, bmesh, os, math
import numpy as np
from mathutils import Vector
OUT=os.environ.get("OUT","/workspace/human/out")
bpy.ops.wm.open_mainfile(filepath=OUT+"/stageA.blend")
body=bpy.data.objects["Body"]; rig=body.parent; me=body.data
nv=len(me.vertices)
P=np.array([v.co for v in me.vertices]); N=np.array([v.normal for v in me.vertices])
G={vg.index:vg.name for vg in body.vertex_groups}
W={}
for v in me.vertices:
    for g in v.groups: W.setdefault(G[g.group],np.zeros(nv))[v.index]=g.weight
z=lambda n: W.get(n,np.zeros(nv))
def S(*ns): return sum(z(n) for n in ns)
bh=lambda n:(rig.matrix_world@rig.data.bones[n].head_local)
hipZ=bh("DEF-hips").z; kneeZ=bh("DEF-shin.L").z; shZ=bh("DEF-upper_arm.L").z; shX=bh("DEF-upper_arm.L").x; neckZ=bh("DEF-neck").z
wristX=bh("DEF-hand.L").x; ankleZ=bh("DEF-foot.L").z
print("hip",hipZ,"knee",kneeZ,"sh",shZ,shX,"neck",neckZ,"wrist",wristX,"ankle",ankleZ)
head=S("DEF-neck","DEF-head"); arm=S("DEF-forearm.L","DEF-forearm.R","DEF-hand.L","DEF-hand.R")
ax=np.abs(P[:,0])
def shell(name,mask,offset,uvfn,extra=None):
    """duplicate body faces whose vertices are all in mask, push out along normals"""
    sel=set(np.nonzero(mask)[0].tolist())
    faces=[p for p in me.polygons if all(i in sel for i in p.vertices)]
    used=sorted({i for p in faces for i in p.vertices}); rem={o:i for i,o in enumerate(used)}
    off=offset(P[used]) if callable(offset) else np.full(len(used),offset)
    verts=P[used]+N[used]*off[:,None]
    m=bpy.data.meshes.new(name); m.from_pydata(verts.tolist(),[],[[rem[i] for i in p.vertices] for p in faces]); m.update()
    o=bpy.data.objects.new(name,m); bpy.context.collection.objects.link(o)
    for gname,arr in W.items():
        vg=o.vertex_groups.new(name=gname)
        for j,i in enumerate(used):
            if arr[i]>0: vg.add([j],float(arr[i]),'REPLACE')
    uv=m.uv_layers.new(name="UVMap")
    for poly in m.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv=uvfn(Vector(verts[m.loops[li].vertex_index]))
    fix_seam(m,uv)
    for p in m.polygons: p.use_smooth=True
    o.parent=rig; md=o.modifiers.new("Armature",'ARMATURE'); md.object=rig
    print("SHELL",name,len(used),"verts",len(faces),"faces"); return o
def fix_seam(m,uv):  # unwrap cylindrical u across the seam per polygon
    for poly in m.polygons:
        us=[uv.data[li].uv[0] for li in poly.loop_indices]
        if max(us)-min(us)>.5:
            for li in poly.loop_indices:
                if uv.data[li].uv[0]<.5: uv.data[li].uv[0]+=1
def cyl(cx,cy,ru,rv,z0=0):
    def f(p): return ((math.atan2(p.x-cx,-(p.y-cy))/(2*math.pi)+.5)*ru,(p.z-z0)*rv)
    return f
torsoY=float(np.mean(P[(np.abs(P[:,2]-hipZ-.25)<.03)&(ax<.2),1]))
# ---- tunic (hide): torso + short cap sleeves, down to the crotch
tun=(head<.3)&(P[:,2]>hipZ-.14)&(ax<shX+.09)&(arm<.01)
tunic=shell("Tunic",tun,lambda p:.011+.004*np.clip((p[:,2]-hipZ)/.4,0,1),cyl(0,torsoY,2,1.6))
# ---- fur mantle over shoulders/upper chest/back with an uneven lower edge
ang=np.arctan2(P[:,0],-(P[:,1]-torsoY))
edge=shZ-.17+.035*np.sin(ang*7)+.02*np.sin(ang*13+1)
fur=(head<.55)&(P[:,2]>edge)&(ax<shX+.075)&(arm<.01)
furo=shell("Fur",fur,lambda p:.028+.0*p[:,0],cyl(0,torsoY,3,2.2))
fur2=shell("FurTips",fur&(P[:,2]>edge+.012),lambda p:.043+.0*p[:,0],cyl(0,torsoY,3,2.2))
# ---- belt
belt=(P[:,2]>hipZ+.07)&(P[:,2]<hipZ+.115)&(ax<.3)&(arm<.01)
shell("Belt",belt,.026,cyl(0,torsoY,4,3))
# ---- leg wraps + footwraps, wrist wraps
legL=bh("DEF-shin.L");legR=bh("DEF-shin.R")
wl=(P[:,2]<kneeZ-.04)&(P[:,2]<.6)
def legcyl(p): c=legL if p.x>0 else legR; return ((math.atan2(p.x-c.x,-(p.y-c.y))/(2*math.pi)+.5),p.z*3.2)
shell("Wraps",wl,lambda p:.006+.004*(p[:,2]>ankleZ+.03),legcyl)
wristR=(ax>wristX-.13)&(ax<wristX-.03)&(np.abs(P[:,2]-shZ)<.12)
def armcyl(p): c=bh("DEF-hand.L") if p.x>0 else bh("DEF-hand.R"); return ((math.atan2(p.z-c.z,p.y-c.y)/(2*math.pi)+.5),abs(p.x)*3.2)
shell("Bracers",wristR,.006,armcyl)
# ---- skirt: a flared hide tube from waist to above the knee, with a fringed hem
zt,zb=hipZ+.085,kneeZ+.16; NA=56; NR=9
rings=[];prev=None
for r in range(NR):
    t=r/(NR-1); zz=zt+(zb-zt)*t
    sl=(np.abs(P[:,2]-zz)<.025)&(ax<.32)&(arm<.01)
    a=np.arctan2(P[sl,0],-(P[sl,1]-torsoY)); d=np.hypot(P[sl,0],P[sl,1]-torsoY)
    rad=np.zeros(NA)
    for k in range(NA):
        c=-math.pi+2*math.pi*(k+.5)/NA; dd=np.abs((a-c+math.pi)%(2*math.pi)-math.pi)<2*math.pi/NA*1.5
        rad[k]=d[dd].max() if dd.any() else 0
    rad=np.maximum(rad,np.roll(rad,1)*.0)
    for _ in range(3): rad=np.maximum(rad,(np.roll(rad,1)+np.roll(rad,-1))/2)
    rad=rad+.016+.05*t*t
    if prev is not None: rad=np.maximum(rad,prev*0.995)
    prev=rad; rings.append([(math.sin(-math.pi+2*math.pi*(k+.5)/NA)*rad[k],torsoY-math.cos(-math.pi+2*math.pi*(k+.5)/NA)*rad[k],zz) for k in range(NA)])
# fringe: extra row of tongues
fr=[];zf=zb-.075
for k in range(NA):
    c=-math.pi+2*math.pi*(k+.5)/NA; rr=prev[k]+.012
    fr.append((math.sin(c)*rr,torsoY-math.cos(c)*rr,zf-.02*((k*7)%3)))
verts=[v for ring in rings for v in ring]+fr
faces=[]
for r in range(NR-1):
    for k in range(NA):
        if r>=NR//3 and k in (NA//2-1,NA-1): continue  # front/back slits so each flap follows its own thigh
        faces.append([r*NA+k,r*NA+(k+1)%NA,(r+1)*NA+(k+1)%NA,(r+1)*NA+k])
base=(NR-1)*NA; fb=NR*NA
for k in range(NA):
    if k%2==0 and k not in (NA//2-1,NA-1): faces.append([base+k,base+(k+1)%NA,fb+(k+1)%NA,fb+k])
m=bpy.data.meshes.new("Skirt");m.from_pydata(verts,[],faces);m.update()
sk=bpy.data.objects.new("Skirt",m);bpy.context.collection.objects.link(sk)
vg={n:sk.vertex_groups.new(name=n) for n in ("DEF-hips","DEF-thigh.L","DEF-thigh.R")}
for i,(x,y,zz) in enumerate(verts):
    t=min(1,max(0,(zt-zz)/(zt-zb+.075)))**1.2; xn=max(-1,min(1,x/.05))
    wl_=t*.85*min(1,max(0,.5+xn*.9)); wr_=t*.85*min(1,max(0,.5-xn*.9))
    vg["DEF-hips"].add([i],1-wl_-wr_,'REPLACE')
    if wl_>0: vg["DEF-thigh.L"].add([i],wl_,'REPLACE')
    if wr_>0: vg["DEF-thigh.R"].add([i],wr_,'REPLACE')
uv=m.uv_layers.new(name="UVMap")
for poly in m.polygons:
    for li in poly.loop_indices:
        p=Vector(verts[m.loops[li].vertex_index]); uv.data[li].uv=((math.atan2(p.x,-(p.y-torsoY))/(2*math.pi)+.5)*3,(p.z)*1.6)
fix_seam(m,uv)
for p in m.polygons: p.use_smooth=True
sk.parent=rig; md=sk.modifiers.new("Armature",'ARMATURE'); md.object=rig
# skirt normals should face outward
bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(m);bm.free()
# ---- beard / stubble mask painted in the body's UV space
hd=W["DEF-head"]; headB=bh("DEF-head")
fh=(hd>.5)
chin=P[fh&(np.abs(P[:,0])<.01)&(P[:,1]<headB.y-.04)]
chinZ=chin[:,2].min(); noseI=np.argmin(np.where(fh&(np.abs(P[:,0])<.01),P[:,1],9)); noseZ=P[noseI,2]; noseY=P[noseI,1]
print("LANDMARK chinZ",chinZ,"noseZ",noseZ,"noseY",noseY,"headB",tuple(headB))
mouthZ=chinZ+.42*(noseZ-chinZ)
inB=((hd+W.get("DEF-neck",0))>.3)&(P[:,2]<noseZ-.012)&(P[:,2]>chinZ-.05)&(P[:,1]<headB.y+.005)
inB&=~((np.abs(P[:,0])<.026)&(np.abs(P[:,2]-mouthZ)<.0075))
inB&=~((P[:,2]<chinZ-.005)&(P[:,1]>noseY+.07))
import json
uvl=me.uv_layers.active.data
polys=[[list(uvl[li].uv) for li in p.loop_indices] for p in me.polygons if sum(inB[i] for i in p.vertices)>=len(p.vertices)-1]
json.dump(polys,open(OUT+"/beard_polys.json","w"))
bpy.ops.wm.save_as_mainfile(filepath=OUT+"/stageB.blend")
print("STAGE B DONE")
