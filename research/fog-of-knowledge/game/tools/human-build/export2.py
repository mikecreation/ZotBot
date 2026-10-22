import bpy, os
OUT=os.environ.get("OUT","/workspace/human/out")
bpy.ops.wm.open_mainfile(filepath=os.environ.get("BLEND",OUT+"/stageB.blend"))
rig=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
for o in bpy.data.objects:
    o.select_set(o==rig or (o.type=='MESH' and o.parent==rig))
    if o.type=='MESH' and o.parent!=rig: print("SKIP",o.name)
rig.animation_data_create(); rig.animation_data.action=None
os.makedirs(os.environ.get("EXP",OUT+"/export"),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.environ.get("EXP",OUT+"/export")+"/human-real.gltf",export_format='GLTF_SEPARATE',use_selection=True,export_materials='NONE',
  export_texcoords=True,export_normals=True,export_tangents=False,export_skins=True,export_all_influences=False,export_animations=True,
  export_animation_mode='ACTIONS',export_def_bones=False,export_yup=True,export_morph=False,export_optimize_animation_size=True,export_apply=False)
print("EXPORTED")
