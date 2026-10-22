import json, base64, os, shutil
from PIL import Image
D="/home/box/.config/blender/4.2/extensions/.user/user_default/mpfb/data/"
O="/workspace/human/out/export/"; T="/workspace/human/tex/"; P="/workspace/human/pkg/assets/"
os.makedirs(P+"human-real",exist_ok=True)
g=json.load(open(O+"human-real.gltf"))
for n in g["nodes"]:
    if "mesh" in n: g["meshes"][n["mesh"]]["name"]=n["name"]
b=open(O+g["buffers"][0]["uri"],"rb").read()
g["buffers"][0]["uri"]="data:application/octet-stream;base64,"+base64.b64encode(b).decode()
g["asset"]["generator"]="MPFB2 2.0.18 (MakeHuman, CC0) + Fog of Knowledge build script; animations: Quaternius UAL (CC0)"
g["asset"]["copyright"]="CC0 1.0 - MakeHuman/MPFB2 system assets; Quaternius Universal Animation Library"
json.dump(g,open(P+"human-real.gltf.json","w"),separators=(",",":"))
H=P+"human-real/"
def jpg(src,dst,size=None,q=86):
    im=Image.open(src).convert("RGB")
    if size and im.width>size: im=im.resize((size,size),Image.LANCZOS)
    im.save(H+dst,quality=q,optimize=True)
def webp(src,dst,size=None,q=88):
    im=Image.open(src).convert("RGBA")
    if size and im.width>size: im=im.resize((size,size),Image.LANCZOS)
    im.save(H+dst,"WEBP",quality=q,method=6)
jpg(T+"skin_d.jpg","skin.jpg",2048,88); jpg(T+"skin_detail_n.jpg","skin_detail_n.jpg",512,90)
webp(D+"eyes/materials/brown_eye.png","eye.webp",512)
webp(D+"eyebrows/eyebrow009/eyebrow009.png","brow.webp",512); webp(D+"eyelashes/eyelashes01/eyelashes01.png","lash.webp",512)
webp(D+"hair/short02/short02_diffuse.png","hair.webp",1024); jpg(D+"hair/short02/short02_normal.png","hair_n.jpg",1024)
for f in ("leather_d","leather_n","wrap_d","wrap_n","fur_n"): jpg(T+f+".jpg",f+".jpg",1024)
webp(T+"fur_d.png","fur_d.webp",1024)
tot=0
for f in sorted(os.listdir(H)):
    s=os.path.getsize(H+f); tot+=s; print(f, s)
print("gltf.json",os.path.getsize(P+"human-real.gltf.json"),"textures",tot)
