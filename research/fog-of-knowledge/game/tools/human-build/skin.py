import json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
D="/home/box/.config/blender/4.2/extensions/.user/user_default/mpfb/data/"
O="/workspace/human/out/"; T="/workspace/human/tex/"
R=2048; mask=Image.new("L",(R,R),0); dr=ImageDraw.Draw(mask)
for poly in json.load(open(O+"beard_polys.json")): dr.polygon([(u*R,(1-v)*R) for u,v in poly],fill=255)
mask=np.asarray(mask.filter(ImageFilter.GaussianBlur(7)),float)/255
sk=np.asarray(Image.open(D+"skins/young_caucasian_male/young_lightskinned_male_diffuse.png").convert("RGB"),float)
# sun-weathered, warmer tone
tint=np.array([0.97,0.90,0.83]); sk=sk*tint
r=np.random.default_rng(3); hair=r.random((R,R)); hair=np.asarray(Image.fromarray((hair*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.7)),float)/255
dens=np.clip(mask*1.25,0,1)*(.55+.45*(hair>.45))
beard=np.array([46,32,22],float)
sk=sk*(1-dens[...,None]*.78)+beard*dens[...,None]*.78
Image.fromarray(np.clip(sk,0,255).astype(np.uint8)).save(T+"skin_d.jpg",quality=88)
print("skin ok")
