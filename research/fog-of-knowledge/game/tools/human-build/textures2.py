# Pass-2 skin maps in the body's UV space from the baked per-texel rest position/normal/AO:
#  skin.jpg   diffuse: MakeHuman CC0 skin, warm tint, AO, stubble, stronger lips, nails, hair-coloured scalp
#  skin_n.jpg tangent-space normal: knuckle wrinkles, MCP bumps, finger/palm/wrist creases, nail plates, fine grain
#  skin_r.jpg roughness (G): oily T-zone, glossy lips and nails, dry palms
#  beard.webp / beard_mask.jpg: stubble-shell strands and density
import json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
D="/home/box/.config/blender/4.2/extensions/.user/user_default/mpfb/data/"
O="/workspace/human/out/"; T="/workspace/human/tex/"
pos=np.load(O+"bake_pos.npy"); nrm=np.load(O+"bake_nrm.npy"); ao=np.load(O+"bake_ao.npy")[...,0]
R=pos.shape[0]; p=pos[...,:3]; n=nrm[...,:3]; valid=np.linalg.norm(n,axis=-1)>.5
bones=json.load(open(O+"bones.json")); LM=json.load(open(O+"landmarks.json"))
V=lambda a:np.array(a,float)
H=np.zeros((R,R)); rough=np.full((R,R),.52); nail=np.zeros((R,R)); lips=np.zeros((R,R))
def seg(name):
    b=bones[name]; h=V(b["h"]); t=V(b["t"]); L=np.linalg.norm(t-h); a=(t-h)/L; dors=-V(b["z"]); return h,a,L,dors
def local(name):
    h,a,L,dors=seg(name)
    if name.startswith("DEF-hand"): dors=V([0,0,1])  # palms face down in the T-pose
    d=p-h; ax=d@a; r=d-ax[...,None]*a; rl=np.linalg.norm(r,axis=-1)+1e-9
    return ax,L,rl,(r@dors)/rl,h,a
g=lambda x,s:np.exp(-(x/s)**2)
for S in "LR":
    for f in ("f_index","f_middle","f_ring","f_pinky","thumb"):
        # MCP knuckle bump (not on the thumb) and joint creases
        for j in ("01","02","03"):
            ax,L,rl,cd,h,a=local(f"DEF-{f}.{j}.{S}")
            near=(rl<.014)&(ax>-.012)&(ax<L+.012)&valid
            if j!="01" or f=="thumb":
                dor=np.clip((cd-.1)/.5,0,1)*near; pal=np.clip((-cd-.2)/.5,0,1)*near
                # dorsal knuckle wrinkles: concentric lines round the joint
                env=g(ax,.0042)
                H-= dor*env*(.5+.5*np.cos(ax*2*np.pi/.0013))*.00016
                H+= dor*g(ax,.006)*.00025
                # palm-side flexion creases: one or two sharp grooves
                for off in ((0,) if j=="03" else (-.0012,.0012)):
                    H-= pal*g(ax-off,.0006)*.00022
                rough+= pal*g(ax,.003)*.05
            elif f!="thumb":
                dor=np.clip((cd-.2)/.5,0,1)*(rl<.016)
                H+= dor*g(ax,.008)*.0009     # knuckle
                H-= dor*g(ax,.008)*(.5+.5*np.cos(ax*2*np.pi/.0016))*.0001
        # nail plate on the distal phalanx
        ax,L,rl,cd,h,a=local(f"DEF-{f}.03.{S}")
        t=ax/L; m=np.clip((cd-.5)/.2,0,1)*np.clip((t-.38)/.08,0,1)*np.clip((1.12-t)/.06,0,1)*(rl<.0105)*(ax>-.002)*valid
        nail=np.maximum(nail,m)
    # palm (hand bone): wrist creases and the three main palm lines
    ax,L,rl,cd,h,a=local(f"DEF-hand.{S}")
    pal=np.clip((-cd-.3)/.4,0,1)*(rl<.05)*valid
    u=ax/L
    side=np.cross(a,V([0,0,1])); side/=np.linalg.norm(side)
    v=((p-h)@side)/.045*(1 if S=="R" else -1)  # ~ -1 index side .. +1 pinky side
    for off in (-.004,-.0015):
        H-= pal*g(ax-off,.0007)*.00025*(np.abs(v)<1.1)
    lines=[.78-.10*np.clip(v,-1,1)**2-.06*v, .62+.08*v, None]
    for k,ln in enumerate(lines[:2]):
        m=pal*(u>.2)*(u<1.0)*np.clip(1.2-np.abs(v),0,1)*(v>(-1 if k==0 else -.9))*(v<(1 if k==0 else .4))
        H-= m*g(u-ln,.012)*.0003
    # thenar (life) line: arc round the thumb base
    th=np.hypot((u-.25)/.75,(v+1.05)/.9); m=pal*(u>.05)*(u<.85)
    H-= m*g(th-.75,.016)*.0003
    rough+= pal*.08
# lips: ellipse round the mouth on the front of the face
front=np.clip((-n[...,1]-.2)/.4,0,1)*valid
lx=p[...,0]/.026; lz=(p[...,2]-LM["mouthZ"])/.0115
lips=np.clip(1-(lx**2+lz**2),0,1)**.6*front*(p[...,1]<LM["noseY"]+.03)
rough-= lips*.2
# T-zone a little oilier
fz=np.clip((p[...,2]-LM["mouthZ"])/.06,0,1)*np.clip(1-np.abs(p[...,0])/.035,0,1)*front*(p[...,2]>LM["chinZ"])
rough-= fz*.08
rough=np.where(nail>0,rough*(1-nail)+.26*nail,rough)
# nail plate: smooth, slightly raised with a groove at the cuticle/sides
nb=np.asarray(Image.fromarray((nail*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)),float)/255
H+= nb*.00025
# fine grain (cross-hatched micro wrinkles) where skin is
def band(n,lo,hi,seed,aniso=(1,1)):
    r=np.random.default_rng(seed);w=r.standard_normal((n,n))+1j*r.standard_normal((n,n))
    fx=np.fft.fftfreq(n)[:,None]*n*aniso[0];fy=np.fft.fftfreq(n)[None,:]*n*aniso[1];f=np.sqrt(fx**2+fy**2)
    x=np.real(np.fft.ifft2(w*((f>=lo)&(f<=hi))));return x/np.abs(x).max()
grain=band(R,300,700,41)+.6*band(R,120,260,42)
H+= grain*.000035*valid
mid=band(R,8,40,43); rough+= mid*.05
# ---- height -> tangent-space normal (gradients in metres; three.js tangent frame T=dP/du, B=dP/dv, v = image row)
def dmet(axis):
    a=np.roll(p,-1,axis)-np.roll(p,1,axis); return np.linalg.norm(a,axis=-1)/2+1e-6
okx=valid&np.roll(valid,-1,1)&np.roll(valid,1,1); oky=valid&np.roll(valid,-1,0)&np.roll(valid,1,0)
gx=np.where(okx,(np.roll(H,-1,1)-np.roll(H,1,1))/2/dmet(1),0); gy=np.where(oky,(np.roll(H,-1,0)-np.roll(H,1,0))/2/dmet(0),0)
gx=np.clip(gx,-1.5,1.5); gy=np.clip(gy,-1.5,1.5)
N=np.dstack([-gx,-gy,np.ones_like(gx)]); N/=np.linalg.norm(N,axis=2,keepdims=True)
Image.fromarray(((N*.5+.5)*255).astype(np.uint8)).save(T+"skin2_n.png")
rr=np.clip(rough,.15,.9)
Image.fromarray(np.dstack([rr*255]*3).astype(np.uint8)).resize((1024,1024),Image.LANCZOS).save(T+"skin2_r.png")
# ---- diffuse
sk=np.asarray(Image.open(D+"skins/young_caucasian_male/young_lightskinned_male_diffuse.png").convert("RGB"),float)
if sk.shape[0]!=R: sk=np.asarray(Image.fromarray(sk.astype(np.uint8)).resize((R,R),Image.LANCZOS),float)
sk*=np.array([0.97,0.90,0.83])
aoS=np.where(valid,np.clip(ao,0,1),1); sk*= (0.42+0.58*aoS**.8)[...,None]
# stubble (as pass 1, lighter: the beard shells add the strands)
mask=Image.new("L",(R,R),0); dr=ImageDraw.Draw(mask)
for poly in json.load(open(O+"beard_polys.json")): dr.polygon([(uu*R,(1-vv)*R) for uu,vv in poly],fill=255)
mk=np.asarray(mask.filter(ImageFilter.GaussianBlur(7)),float)/255
rn=np.random.default_rng(3).random((R,R)); rn=np.asarray(Image.fromarray((rn*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.7)),float)/255
dens=np.clip(mk*1.25,0,1)*(.55+.45*(rn>.45)); beardC=np.array([46,32,22],float)
sk=sk*(1-dens[...,None]*.62)+beardC*dens[...,None]*.62
# lips: deeper, redder
lipC=np.array([0.93,0.70,0.66]); sk=sk*(1-lips[...,None]*.55)+sk*lipC*lips[...,None]*.55
# nails: pinker bed, pale free edge
lum=sk.mean(-1,keepdims=True); nailC=np.minimum(255,lum*np.array([1.18,1.0,.95])+18)
sk=sk*(1-nb[...,None]*.7)+nailC*nb[...,None]*.7
# scalp under the hair cards: hair-coloured so gaps between cards don't show bald skin
# scalp under the hair cards: hair-coloured so gaps between cards don't show bald skin
browZ=np.load(O+'brow_verts.npy')[:,2].max(); hb=V(LM["headB"])
th=np.abs(np.arctan2(p[...,0],-(p[...,1]-hb[1])))   # 0 = facing front
w=np.clip((th-np.radians(35))/np.radians(110),0,1); w=w*w*(3-2*w)
hl=(browZ+.032)*(1-w)+(LM["noseZ"]-.03)*w
ear=(np.abs(p[...,0])>.066)&(th>np.radians(55))&(th<np.radians(125))&(p[...,2]<browZ+.02)
sc=np.clip((p[...,2]-hl)/.012,0,1)*valid*(p[...,2]>LM["chinZ"])*(~ear)
sc=np.asarray(Image.fromarray((sc*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)),float)/255
hairC=np.array([58,42,30],float)*(0.75+0.5*band(R,200,500,44)[...,None]*.5+.25)
sk=sk*(1-sc[...,None]*.8)+hairC*sc[...,None]*.8
Image.fromarray(np.clip(sk,0,255).astype(np.uint8)).save(T+"skin2_d.jpg",quality=92)
# ---- beard strands (tileable) + density mask in body UV
M=512; r=np.random.default_rng(9)
st=np.zeros((M,M))
for _ in range(2600):
    x0,y0=r.random()*M,r.random()*M; Lh=r.uniform(6,16); ang=r.normal(0,.35)
    for k in range(int(Lh*2)):
        x=int(x0+k*.5*np.cos(ang))%M; y=int(y0+k*.5*np.sin(ang))%M; st[y,x]=max(st[y,x],1-k/(Lh*2)*.4)
st=np.asarray(Image.fromarray((st*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6)),float)/255
alpha=np.clip(st*2.2,0,1)
col=np.dstack([np.full((M,M),c) for c in (70,52,38)])*(0.7+0.5*st[...,None])
Image.fromarray(np.dstack([np.clip(col,0,255),alpha*255]).astype(np.uint8),"RGBA").save(T+"beard.png")
bm=np.clip(mk*1.4-.1,0,1)
Image.fromarray((bm*255).astype(np.uint8)).resize((512,512),Image.LANCZOS).save(T+"beard_mask.png")
print("ok nail px",int((nail>.5).sum()),"lips px",int((lips>.3).sum()),"scalp px",int((sc>.5).sum()))
