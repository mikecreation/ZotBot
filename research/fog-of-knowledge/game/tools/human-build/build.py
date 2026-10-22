import bpy, sys, os, math, json
from mathutils import Vector, Matrix, Quaternion
OUT=os.environ.get("OUT","/workspace/human/out"); os.makedirs(OUT,exist_ok=True)
STAGE=os.environ.get("STAGE","all")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.rigservice import RigService
D="/home/box/.config/blender/4.2/extensions/.user/user_default/mpfb/data/"
upd=lambda: bpy.context.view_layer.update()
# ---------- 1. MakeHuman character ----------
md=TargetService.get_default_macro_info_dict()
md.update(gender=1.0,age=0.56,muscle=0.72,weight=0.5,height=0.62,proportions=0.6)
md["race"]={"caucasian":0.5,"african":0.15,"asian":0.35}
h=HumanService.create_human(macro_detail_dict=md); h.name="Body"
rig=HumanService.add_builtin_rig(h,"game_engine")
assets={}
for typ,path,nm in [("Eyes","eyes/high-poly/high-poly.mhclo","Eyes"),("Eyebrows","eyebrows/eyebrow009/eyebrow009.mhclo","Eyebrows"),
                    ("Eyelashes","eyelashes/eyelashes01/eyelashes01.mhclo","Eyelashes"),("Hair","hair/short02/short02.mhclo","Hair")]:
    o=HumanService.add_mhclo_asset(D+path,h,asset_type=typ,subdiv_levels=0)
    if o is None: o=[x for x in bpy.data.objects if x.type=='MESH' and x not in assets.values() and x!=h][-1]
    o.name=nm; assets[nm]=o
print("ASSETS",{k:(v.name,len(v.data.vertices),[m.type for m in v.modifiers]) for k,v in assets.items()})
# ---------- 2. UAL reference skeleton ----------
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath="/workspace/human/ual.gltf", bone_heuristic='BLENDER')
new=set(bpy.data.objects)-before
ual=[o for o in new if o.type=='ARMATURE'][0]
for o in new:
    if o.type=='MESH': bpy.data.objects.remove(o,do_unlink=True)
UW=ual.matrix_world
def uhead(n): return UW@ual.data.bones[n].head_local
def uy(n): return (UW.to_3x3()@ual.data.bones[n].matrix_local.to_3x3().col[1]).normalized()
RW=rig.matrix_world
def phead(n): return RW@rig.pose.bones[n].head
def py(n): return (RW.to_3x3()@rig.pose.bones[n].matrix.to_3x3().col[1]).normalized()
def rot_world(n,q):
    pb=rig.pose.bones[n]; Mw=RW@pb.matrix; hd=Mw.translation.copy()
    pb.matrix=RW.inverted()@(Matrix.Translation(hd)@q.to_matrix().to_4x4()@Matrix.Translation(-hd)@Mw); upd()
MAP={"Root":"root","pelvis":"DEF-hips","spine_01":"DEF-spine.001","spine_02":"DEF-spine.002","spine_03":"DEF-spine.003","neck_01":"DEF-neck","head":"DEF-head"}
for s,S in (("l","L"),("r","R")):
    MAP.update({f"clavicle_{s}":f"DEF-shoulder.{S}",f"upperarm_{s}":f"DEF-upper_arm.{S}",f"lowerarm_{s}":f"DEF-forearm.{S}",f"hand_{s}":f"DEF-hand.{S}",
                f"thigh_{s}":f"DEF-thigh.{S}",f"calf_{s}":f"DEF-shin.{S}",f"foot_{s}":f"DEF-foot.{S}",f"ball_{s}":f"DEF-toe.{S}"})
    for f,F in (("index","f_index"),("middle","f_middle"),("ring","f_ring"),("pinky","f_pinky"),("thumb","thumb")):
        for i in (1,2,3): MAP[f"{f}_0{i}_{s}"]=f"DEF-{F}.0{i}.{S}"
assert len(MAP)==53 and all(k in rig.pose.bones for k in MAP) and all(v in ual.data.bones for v in MAP.values())
INV={v:k for k,v in MAP.items()}
# ---------- 3. pose MakeHuman into the UAL rest pose ----------
def align(n,child):
    U=MAP[n]
    if child: a=(phead(child)-phead(n)).normalized(); b=(uhead(MAP[child])-uhead(U)).normalized()
    else: a=py(n); b=uy(U)
    rot_world(n,a.rotation_difference(b))
for s in "lr":
    chain=[(f"upperarm_{s}",f"lowerarm_{s}"),(f"lowerarm_{s}",f"hand_{s}"),(f"hand_{s}",f"middle_01_{s}")]
    for n,c in chain: align(n,c)
    # roll the hand so the knuckle line matches
    hn=f"hand_{s}";ax=(phead(f"middle_01_{s}")-phead(hn)).normalized()
    v1=phead(f"pinky_01_{s}")-phead(f"index_01_{s}");v2=uhead(MAP[f"pinky_01_{s}"])-uhead(MAP[f"index_01_{s}"])
    v1=(v1-ax*v1.dot(ax)).normalized();v2=(v2-ax*v2.dot(ax)).normalized()
    ang=math.atan2(ax.dot(v1.cross(v2)),v1.dot(v2)); rot_world(hn,Quaternion(ax,ang))
    for f in ("index","middle","ring","pinky","thumb"):
        align(f"{f}_01_{s}",f"{f}_02_{s}");align(f"{f}_02_{s}",f"{f}_03_{s}");align(f"{f}_03_{s}",None)
    for n,c in [(f"thigh_{s}",f"calf_{s}"),(f"calf_{s}",f"foot_{s}"),(f"foot_{s}",f"ball_{s}"),(f"ball_{s}",None)]: align(n,c)
RigService.apply_pose_as_rest_pose(rig)
# remove helper geometry
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=h
for m in list(h.modifiers):
    if m.type=='MASK': bpy.ops.object.modifier_apply(modifier=m.name)
for o in [h]+list(assets.values()):
    for m in list(o.modifiers):
        if m.type in ('SUBSURF','MASK') and o is not h: o.modifiers.remove(m)
# ---------- 4. scale to game height and rebuild UAL skeleton on MakeHuman joints ----------
top=max((h.matrix_world@v.co).z for v in h.data.vertices)
TARGET=float(os.environ.get("HEIGHT","1.76")); sc=TARGET/top
print("BODY TOP",top,"scale",sc)
heads={MAP[n]:(RW@rig.data.bones[n].head_local)*sc for n in MAP}
heads["root"]=Vector((0,0,0))
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active=ual; ual.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
E=ual.data.edit_bones; UWi=UW.inverted()
for eb in E: eb.use_connect=False
mats={eb.name:eb.matrix.copy() for eb in E}
for eb in E:
    R=mats[eb.name].to_3x3().to_4x4(); eb.matrix=Matrix.Translation(UWi@heads[eb.name])@R
bpy.ops.object.mode_set(mode='OBJECT')
# meshes: bake transforms, rename weights, re-parent to UAL rig
meshes=[h]+list(assets.values())
for o in meshes:
    Mw=o.matrix_world.copy(); o.parent=None; o.data.transform(Matrix.Scale(sc,4)@Mw); o.matrix_world=Matrix()
    for m in list(o.modifiers):
        if m.type=='ARMATURE': o.modifiers.remove(m)
    for vg in list(o.vertex_groups):
        if vg.name in MAP: vg.name="__"+MAP[vg.name]
        else: o.vertex_groups.remove(vg)
    for vg in o.vertex_groups: vg.name=vg.name[2:]
    o.parent=ual; mod=o.modifiers.new("Armature",'ARMATURE'); mod.object=ual
    for p in o.data.polygons: p.use_smooth=True
bpy.data.objects.remove(rig,do_unlink=True)
for a in bpy.data.actions:
    if a.name.endswith("_Rig"): a.name=a.name[:-4]
bpy.ops.wm.save_as_mainfile(filepath=OUT+"/stageA.blend")
print("STAGE A DONE", {o.name:len(o.data.vertices) for o in meshes})
