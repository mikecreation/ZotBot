import json, base64, os, shutil
from PIL import Image
D="/home/box/.config/blender/4.2/extensions/.user/user_default/mpfb/data/"
O="/workspace/human/out/export2/"; T="/workspace/human/tex/"; P="/workspace/human/pkg2/assets/"
shutil.rmtree("/workspace/human/pkg2",ignore_errors=True); os.makedirs(P+"human-real",exist_ok=True)
g=json.load(open(O+"human-real.gltf"))
for n in g["nodes"]:
    if "mesh" in n: g["meshes"][n["mesh"]]["name"]=n["name"]
b=open(O+g["buffers"][0]["uri"],"rb").read()
g["buffers"][0]["uri"]="data:application/octet-stream;base64,"+base64.b64encode(b).decode()
g["asset"]["generator"]="MPFB2 2.0.18 (MakeHuman, CC0) + Fog of Knowledge build script (pass 2); animations: Quaternius UAL (CC0)"
g["asset"]["copyright"]="CC0 1.0 - MakeHuman/MPFB2 system assets; Quaternius Universal Animation Library"
json.dump(g,open(P+"human-real.gltf.json","w"),separators=(",",":"))
H=P+"human-real/"
def jpg(src,dst,size=None,q=86,mode="RGB"):
    im=Image.open(src).convert(mode)
    if size and im.width!=size: im=im.resize((size,size),Image.LANCZOS)
    im.save(H+dst,quality=q,optimize=True)
def webp(src,dst,size=None,q=88):
    im=Image.open(src).convert("RGBA")
    if size and im.width!=size: im=im.resize((size,size),Image.LANCZOS)
    im.save(H+dst,"WEBP",quality=q,method=6)
jpg(T+"skin2_d.jpg","skin.jpg",2048,88); jpg(T+"skin2_n.png","skin_n.jpg",2048,90); jpg(T+"skin2_r.png","skin_r.jpg",1024,88,"L")
jpg(T+"skin_detail_n.jpg","skin_detail_n.jpg",512,90)
webp(D+"eyes/materials/brown_eye.png","eye.webp",1024)
def recolor(src,dst,rgb,size=512):
    import numpy as np
    im=Image.open(src).convert("RGBA").resize((size,size),Image.LANCZOS); a=np.asarray(im,float)
    l=a[...,:3].mean(-1,keepdims=True)/255; c=np.array(rgb,float)*(0.8+0.5*l)
    Image.fromarray(np.dstack([np.clip(c,0,255),a[...,3:]]).astype(np.uint8),"RGBA").save(H+dst,"WEBP",quality=90,method=6)
recolor(D+"eyebrows/eyebrow009/eyebrow009.png","brow.webp",(96,70,50)); webp(D+"eyelashes/eyelashes01/eyelashes01.png","lash.webp",512)
webp(D+"hair/short02/short02_diffuse.png","hair.webp",2048,90); jpg(D+"hair/short02/short02_normal.png","hair_n.jpg",1024)
webp(T+"beard.png","beard.webp",512); jpg(T+"beard_mask.png","beard_mask.jpg",512,90,"L")
for f in ("leather_d","leather_n","wrap_d","wrap_n","fur_n"): jpg(T+f+".jpg",f+".jpg",1024)
webp(T+"fur_d.png","fur_d.webp",1024)
tot=0
for f in sorted(os.listdir(H)):
    s=os.path.getsize(H+f); tot+=s; print(f, s, Image.open(H+f).size)
print("gltf.json",os.path.getsize(P+"human-real.gltf.json"),"textures",tot)
