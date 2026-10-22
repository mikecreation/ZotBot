import bpy, os, sys, math
from mathutils import Vector
OUT=os.environ.get("OUT","/workspace/human/out")
bpy.ops.wm.open_mainfile(filepath=os.environ.get("BLEND",OUT+"/stageA.blend"))
D="/home/box/.config/blender/4.2/extensions/.user/user_default/mpfb/data/"
TX=os.environ.get("TX","/workspace/human/tex/")
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=int(os.environ.get("SAMPLES","12")); sc.cycles.device='CPU'
sc.render.resolution_x=int(os.environ.get("W","480")); sc.render.resolution_y=int(os.environ.get("H","640"))
sc.cycles.use_denoising=False
def mat(name,img=None,color=(0.6,0.5,0.4,1),alpha=False,rough=.6):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes["Principled BSDF"];b.inputs["Base Color"].default_value=color;b.inputs["Roughness"].default_value=rough
    if img and os.path.exists(img):
        t=m.node_tree.nodes.new("ShaderNodeTexImage");t.image=bpy.data.images.load(img);m.node_tree.links.new(t.outputs[0],b.inputs["Base Color"])
        if alpha: m.node_tree.links.new(t.outputs[1],b.inputs["Alpha"]); m.blend_method='HASHED'
    return m
M={"Body":mat("skin",TX+"skin_d.jpg",rough=.5),"Eyes":mat("eye",D+"eyes/materials/brown_eye.png",rough=.1),
   "Eyebrows":mat("brow",D+"eyebrows/eyebrow009/eyebrow009.png",alpha=True),"Eyelashes":mat("lash",D+"eyelashes/eyelashes01/eyelashes01.png",alpha=True),
   "Hair":mat("hair",D+"hair/short02/short02_diffuse.png",alpha=True)}
for o in bpy.data.objects:
    if o.type=='MESH':
        TXM={"Tunic":"leather_d.jpg","Skirt":"leather_d.jpg","Belt":"leather_d.jpg","Fur":"fur_d.png","FurTips":"fur_d.png","Wraps":"wrap_d.jpg","Bracers":"wrap_d.jpg"}
        m=M.get(o.name) or mat(o.name,TX+TXM.get(o.name,"x"),alpha=o.name=="FurTips")
        o.data.materials.clear();o.data.materials.append(m)
w=bpy.data.worlds.new("w");sc.world=w;w.use_nodes=True;w.node_tree.nodes["Background"].inputs[0].default_value=(0.55,0.65,0.8,1);w.node_tree.nodes["Background"].inputs[1].default_value=0.6
sun=bpy.data.objects.new("sun",bpy.data.lights.new("sun",'SUN'));sun.data.energy=4;sun.rotation_euler=(math.radians(50),0,math.radians(-30));sc.collection.objects.link(sun)
cam=bpy.data.objects.new("cam",bpy.data.cameras.new("cam"));sc.collection.objects.link(cam);sc.camera=cam
rig=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
rig.animation_data_create()
def look(pos,tgt,lens=50):
    cam.location=pos;d=Vector(tgt)-Vector(pos);cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler();cam.data.lens=lens
shots=os.environ.get("SHOTS","rest,walk,face").split(",")
for s in shots:
    act,fr=None,1
    if s=="rest": rig.animation_data.action=None; [setattr(pb,'matrix_basis',pb.matrix_basis.__class__()) for pb in rig.pose.bones]
    else:
        name={"walk":"Walk_Loop","face":"Idle_Loop","run":"Sprint_Loop","pick":"PickUp_Table","idle":"Idle_Loop","jog":"Jog_Fwd_Loop","swim":"Swim_Fwd_Loop","punch":"Punch_Cross","side":"Walk_Loop"}.get(s.split(":")[0],s.split(":")[0])
        rig.animation_data.action=bpy.data.actions[name];fr=int(s.split(":")[1]) if ":" in s else 10
    sc.frame_set(fr)
    if s.startswith("face"): look((0.35,-0.75,1.66),(0,0,1.6),70)
    elif s.startswith("side"): look((3.2,0,1.0),(0,0,0.9),50)
    else: look((1.2,-3.4,1.2),(0,0,0.88),45)
    sc.render.filepath=OUT+f"/pv_{s.replace(':','_')}.png";bpy.ops.render.render(write_still=True)
