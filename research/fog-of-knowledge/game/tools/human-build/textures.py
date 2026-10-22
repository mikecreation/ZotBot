import numpy as np
from PIL import Image, ImageFilter
rng=np.random.default_rng(7)
def fnoise(n,beta,seed,aniso=(1,1)):
    r=np.random.default_rng(seed);w=r.standard_normal((n,n))+1j*r.standard_normal((n,n))
    fx=np.fft.fftfreq(n)[:,None]*aniso[0];fy=np.fft.fftfreq(n)[None,:]*aniso[1];f=np.sqrt(fx**2+fy**2);f[0,0]=1
    x=np.real(np.fft.ifft2(w/f**beta));x-=x.min();return x/x.max()
def band(n,lo,hi,seed):  # band-limited periodic noise
    r=np.random.default_rng(seed);w=r.standard_normal((n,n))+1j*r.standard_normal((n,n))
    fx=np.fft.fftfreq(n)[:,None]*n;fy=np.fft.fftfreq(n)[None,:]*n;f=np.sqrt(fx**2+fy**2)
    x=np.real(np.fft.ifft2(w*((f>=lo)&(f<=hi))));x-=x.min();return x/x.max()
def normal_from_h(h,strength):
    gx=(np.roll(h,-1,1)-np.roll(h,1,1))*strength;gy=(np.roll(h,-1,0)-np.roll(h,1,0))*strength
    n=np.dstack([-gx,gy,np.ones_like(h)]);n/=np.linalg.norm(n,axis=2,keepdims=True);return ((n*.5+.5)*255).astype(np.uint8)
def save(a,p,q=88):
    im=Image.fromarray(np.clip(a,0,255).astype(np.uint8));im.save(p,quality=q) if p.endswith(".jpg") else im.save(p,optimize=True)
N=1024;T="/workspace/human/tex/"
# ---- leather hide: large mottling, fine grain, wrinkles, scuffs
big=fnoise(N,1.6,1);mid=fnoise(N,1.1,2);grain=band(N,180,400,3)
wr=1-np.abs(band(N,6,16,4)*2-1);wr=wr**14
h=.45*mid+.35*grain+.5*wr
base=np.array([118,82,52],float);dark=np.array([70,45,27],float);light=np.array([150,112,76],float)
t=np.clip(big*1.4-.2,0,1)[...,None]
col=dark*(1-t)+light*t
col=col*(0.82+0.3*grain[...,None])-wr[...,None]*14
spots=(fnoise(N,.9,5)>.78)[...,None]*-18
col=col+spots
save(col,T+"leather_d.jpg");save(normal_from_h(h,6),T+"leather_n.jpg")
# ---- fur: elongated streaks along v (strands hanging down), alpha for the outer shell
st=fnoise(N,1.2,11,aniso=(9,1));st2=fnoise(N,1.0,12,aniso=(14,1))
clump=fnoise(N,1.8,13)
v=np.clip(.55*st+.45*st2,0,1)
fc0=np.array([96,82,68],float);fc1=np.array([172,156,134],float);fc2=np.array([228,218,198],float)
tip=np.clip((v-.5)*2.4,0,1)[...,None]
col=fc0*(1-v[...,None])+fc1*v[...,None];col=col*(1-tip*.5)+fc2*tip*.5
col*= (0.8+0.4*clump[...,None])
alpha=np.clip((v-.42)*5,0,1)*255
save(np.dstack([col,alpha]),T+"fur_d.png");save(normal_from_h(v,9),T+"fur_n.jpg")
# ---- wraps: overlapping strips of rawhide/linen bound diagonally
M=512;yy,xx=np.mgrid[0:M,0:M]/M
ph=(yy*6+xx*1.0)%1.0      # diagonal strips: 6 per tile, slanted once around
edge=np.clip(np.minimum(ph,1-ph)*14,0,1)
fib=band(M,60,200,21);fib2=fnoise(M,1.2,22,aniso=(6,1))
hh=edge*.8+fib*.2+ph*.25
wc0=np.array([96,78,56],float);wc1=np.array([138,116,86],float)
col=(wc0*(1-fib2[...,None])+wc1*fib2[...,None])*(0.55+0.45*edge[...,None])
cord=((np.abs(((yy*1+.25)%1.0)-.5)<.012))[...,None]    # two lashing cords
col=np.where(cord,np.array([70,48,30],float),col)
save(col,T+"wrap_d.jpg");save(normal_from_h(hh,5),T+"wrap_n.jpg")
# ---- skin pore detail normal (tiled)
P=512;pores=band(P,70,160,31);sk=band(P,20,60,32)
save(normal_from_h(.7*pores+.3*sk,3.5),T+"skin_detail_n.jpg")
print("ok")
