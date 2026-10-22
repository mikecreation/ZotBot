# Stage C (pass 2): smoother body/hands (one Catmull-Clark level, weights + UVs interpolated), smoother
# hair cards, stubble shells for the beard, then bakes position/normal/AO of the body in UV space for
# the procedural skin maps (textures2.py).
import bpy, bmesh, os, json, math
import numpy as np
from mathutils import Vector
OUT=os.environ.get("OUT","/workspace/human/out")
R=int(os.environ.get("BAKE","2048"))
bpy.ops.wm.open_mainfile(filepath=OUT+"/stageB.blend")
rig=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
for o in bpy.data.objects: o.select_set(False)
def subsurf(o,levels=1):
    bpy.context.view_layer.objects.active=o
    m=o.modifiers.new("Sub",'SUBSURF'); m.levels=levels; m.render_levels=levels; m.uv_smooth='PRESERVE_BOUNDARIES'; m.boundary_smooth='PRESERVE_CORNERS'
    while o.modifiers[0]!=m: bpy.ops.object.modifier_move_up(modifier=m.name)
    bpy.ops.object.modifier_apply(modifier=m.name)
body=bpy.data.objects["Body"]; subsurf(body); subsurf(bpy.data.objects["Hair"])
me=body.data; nv=len(me.vertices); print("BODY verts",nv,"faces",len(me.polygons))
# normalise weights (subsurf interpolation keeps sums, but be safe) - top 4 handled by exporter
P=np.array([v.co for v in me.vertices]); N=np.array([v.normal for v in me.vertices])
G={vg.index:vg.name for vg in body.vertex_groups}; W={}
for v in me.vertices:
    for g in v.groups: W.setdefault(G[g.group],np.zeros(nv))[v.index]=g.weight
bh=lambda n:(rig.matrix_world@rig.data.bones[n].head_local)
# ---- beard: same landmarks as clothes.py, on the subdivided body
hd=W["DEF-head"]; headB=bh("DEF-head"); fh=hd>.5
chin=P[fh&(np.abs(P[:,0])<.01)&(P[:,1]<headB.y-.04)]; chinZ=chin[:,2].min()
noseI=np.argmin(np.where(fh&(np.abs(P[:,0])<.01),P[:,1],9)); noseZ=P[noseI,2]; noseY=P[noseI,1]
mouthZ=chinZ+.42*(noseZ-chinZ)
inB=((hd+W.get("DEF-neck",0))>.3)&(P[:,2]<noseZ-.012)&(P[:,2]>chinZ-.05)&(P[:,1]<headB.y+.005)
inB&=~((np.abs(P[:,0])<.026)&(np.abs(P[:,2]-mouthZ)<.0075))
inB&=~((P[:,2]<chinZ-.005)&(P[:,1]>noseY+.07))
json.dump({"chinZ":chinZ,"noseZ":noseZ,"noseY":noseY,"mouthZ":mouthZ,"headB":list(headB)},open(OUT+"/landmarks.json","w"))
sel=set(np.nonzero(inB)[0].tolist()); faces=[p for p in me.polygons if all(i in sel for i in p.vertices)]
used=sorted({i for p in faces for i in p.vertices}); rem={o:i for i,o in enumerate(used)}
uvl=me.uv_layers.active.data
LAY=(.0012,.0026,.004)
verts=[];fcs=[];uvs=[]
for li,off in enumerate(LAY):
    base=li*len(used)
    verts+= (P[used]+N[used]*off).tolist()
    for p in faces:
        fcs.append([base+rem[i] for i in p.vertices]); uvs.append([tuple(uvl[l].uv) for l in p.loop_indices])
m=bpy.data.meshes.new("Beard"); m.from_pydata(verts,[],fcs); m.update()
uv=m.uv_layers.new(name="UVMap")
for poly,fu in zip(m.polygons,uvs):
    for l,u in zip(poly.loop_indices,fu): uv.data[l].uv=u
for p in m.polygons: p.use_smooth=True
bo=bpy.data.objects.new("Beard",m); bpy.context.collection.objects.link(bo)
for gname,arr in W.items():
    vals=arr[used]
    if vals.max()<=0: continue
    g=bo.vertex_groups.new(name=gname)
    for li in range(len(LAY)):
        for k,w in enumerate(vals):
            if w>0: g.add([li*len(used)+k],float(w),'REPLACE')
bo.parent=rig; md=bo.modifiers.new("Armature",'ARMATURE'); md.object=rig
print("BEARD faces",len(fcs))
# ---- bone dump for the texture script
bones={b.name:{"h":list(rig.matrix_world@b.head_local),"t":list(rig.matrix_world@b.tail_local),"z":list((rig.matrix_world.to_3x3()@b.matrix_local.to_3x3()).col[2])} for b in rig.data.bones}
json.dump(bones,open(OUT+"/bones.json","w"))
bpy.ops.wm.save_as_mainfile(filepath=OUT+"/stageC.blend")
print("STAGE C SAVED")
# ---- bakes (position, normal, AO) of the body in its own UV space
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=int(os.environ.get("AOS","48"))
w=bpy.data.worlds.new("w"); sc.world=w; w.light_settings.distance=float(os.environ.get("AOD","0.035"))
for o in bpy.data.objects:
    if o.type=='MESH' and o.name not in("Body","Eyes"): o.hide_render=True
img=bpy.data.images.new("bake",R,R,float_buffer=True,alpha=True)
mat=bpy.data.materials.new("bakemat"); mat.use_nodes=True; nt=mat.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
geo=nt.nodes.new("ShaderNodeNewGeometry"); em=nt.nodes.new("ShaderNodeEmission"); outn=nt.nodes.new("ShaderNodeOutputMaterial")
tex=nt.nodes.new("ShaderNodeTexImage"); tex.image=img; nt.nodes.active=tex
nt.links.new(em.outputs[0],outn.inputs[0])
body.data.materials.clear(); body.data.materials.append(mat)
for o in bpy.data.objects: o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active=body
rig.data.pose_position='REST'
def bake(kind,name,socket=None):
    if socket: nt.links.new(geo.outputs[socket],em.inputs[0])
    img.generated_color=(0,0,0,0)
    sc.render.bake.margin=6
    bpy.ops.object.bake(type=kind,margin=6)
    a=np.empty(R*R*4,np.float32); img.pixels.foreach_get(a); a=a.reshape(R,R,4)[::-1]  # row 0 = top (v=1 in Blender) = glTF v=0
    np.save(OUT+f"/bake_{name}.npy",a); print("BAKED",name,a[...,:3].min(),a[...,:3].max())
bake('EMIT','pos','Position'); bake('EMIT','nrm','Normal')
sc.cycles.samples=int(os.environ.get("AOS","48")); bake('AO','ao')
