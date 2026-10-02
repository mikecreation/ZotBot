import math
import json
import numpy as np
import pandas as pd
from pathlib import Path
OUT = Path(__file__).resolve().parent
from itertools import combinations
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score
from scipy.stats import wilcoxon

OPS = ["sum","diff","prod","absdiff","radial","min","max"]
EXPRESSIBLE_FAMILIES = OPS.copy()
ALIEN_FAMILIES = ["prime","gcd","mod3","xor3","sine","checker"]

def opvals(X,i,j,op):
    a,b=X[:,i],X[:,j]
    if op=="sum": return a+b
    if op=="diff": return a-b
    if op=="prod": return a*b
    if op=="absdiff": return np.abs(a-b)
    if op=="radial": return a*a+b*b
    if op=="min": return np.minimum(a,b)
    if op=="max": return np.maximum(a,b)
    raise ValueError(op)

def make_world(seed, family, n_train=180, n_test=1200, d=8, noise=0.02):
    rng=np.random.default_rng(seed)
    Xtr=rng.uniform(-2,2,size=(n_train,d))
    Xte=rng.uniform(-2.5,2.5,size=(n_test,d))
    i,j=rng.choice(d,2,replace=False)
    if family=="sum":
        ftr=Xtr[:,i]+Xtr[:,j]; fte=Xte[:,i]+Xte[:,j]; t=rng.uniform(-0.4,0.4)
    elif family=="diff":
        ftr=Xtr[:,i]-Xtr[:,j]; fte=Xte[:,i]-Xte[:,j]; t=rng.uniform(-0.4,0.4)
    elif family=="prod":
        ftr=Xtr[:,i]*Xtr[:,j]; fte=Xte[:,i]*Xte[:,j]; t=rng.uniform(-0.35,0.35)
    elif family=="absdiff":
        ftr=np.abs(Xtr[:,i]-Xtr[:,j]); fte=np.abs(Xte[:,i]-Xte[:,j]); t=rng.uniform(0.8,1.5)
    elif family=="radial":
        ftr=Xtr[:,i]**2+Xtr[:,j]**2; fte=Xte[:,i]**2+Xte[:,j]**2; t=rng.uniform(1.8,3.2)
    elif family=="min":
        ftr=np.minimum(Xtr[:,i],Xtr[:,j]); fte=np.minimum(Xte[:,i],Xte[:,j]); t=rng.uniform(-0.4,0.4)
    elif family=="max":
        ftr=np.maximum(Xtr[:,i],Xtr[:,j]); fte=np.maximum(Xte[:,i],Xte[:,j]); t=rng.uniform(-0.4,0.4)
    else:
        raise ValueError(family)
    ytr=(ftr>t).astype(int); yte=(fte>t).astype(int)
    ytr ^= (rng.random(n_train)<noise)
    yte ^= (rng.random(n_test)<noise)
    return Xtr,ytr,Xte,yte

def best_distinction(Xtr,ytr,Xte, random_choice=False, rng=None, shuffled=False, balanced=False):
    if rng is None: rng=np.random.default_rng(0)
    yy=ytr.copy()
    if shuffled:
        yy=rng.permutation(yy)
    bestacc=-1.0; bestspec=None; specs=[]
    for i,j in combinations(range(Xtr.shape[1]),2):
        for op in OPS:
            z=opvals(Xtr,i,j,op)
            ths=np.unique(np.quantile(z,[.15,.25,.35,.45,.55,.65,.75,.85]))
            P=(z[:,None]>ths[None,:]).astype(np.int8)
            if balanced:
                pos=(yy==1); neg=(yy==0)
                tpr=P[pos].mean(axis=0) if pos.any() else np.zeros(P.shape[1])
                tnr=(1-P[neg]).mean(axis=0) if neg.any() else np.zeros(P.shape[1])
                acc=(tpr+tnr)/2
                Pinv=1-P
                tpr2=Pinv[pos].mean(axis=0) if pos.any() else np.zeros(P.shape[1])
                tnr2=(1-Pinv[neg]).mean(axis=0) if neg.any() else np.zeros(P.shape[1])
                acc_inv=(tpr2+tnr2)/2
            else:
                acc=(P==yy[:,None]).mean(axis=0)
                acc_inv=((1-P)==yy[:,None]).mean(axis=0)
            better=acc_inv>acc
            scores=np.where(better,acc_inv,acc)
            for k,t in enumerate(ths):
                specs.append((i,j,op,float(t),-1 if better[k] else 1))
            k=int(np.argmax(scores))
            if scores[k]>bestacc:
                bestacc=float(scores[k]); bestspec=(i,j,op,float(ths[k]),-1 if better[k] else 1)
    spec=specs[rng.integers(len(specs))] if random_choice else bestspec
    i,j,op,t,pol=spec
    pred=(opvals(Xte,i,j,op)>t).astype(int)
    if pol==-1: pred=1-pred
    return pred, bestacc, len(specs)

def isprime_arr(n):
    n=np.asarray(n,dtype=int)
    maxn=int(n.max()) if n.size else 0
    primes=np.ones(maxn+1,dtype=bool)
    if maxn>=0:
        primes[:min(2,maxn+1)]=False
    for p in range(2,int(maxn**0.5)+1):
        if primes[p]: primes[p*p:maxn+1:p]=False
    return primes[n]

def make_alien(seed,family,n_train=220,n_test=1600,d=8,noise=0.02):
    rng=np.random.default_rng(seed)
    Xtr=rng.integers(0,21,size=(n_train,d)).astype(float)
    Xte=rng.integers(0,21,size=(n_test,d)).astype(float)
    i,j,k=rng.choice(d,3,replace=False)
    if family=="prime":
        ytr=isprime_arr(Xtr[:,i].astype(int)); yte=isprime_arr(Xte[:,i].astype(int))
    elif family=="gcd":
        ytr=np.array([math.gcd(int(a),int(b))>1 for a,b in zip(Xtr[:,i],Xtr[:,j])])
        yte=np.array([math.gcd(int(a),int(b))>1 for a,b in zip(Xte[:,i],Xte[:,j])])
    elif family=="mod3":
        ytr=((Xtr[:,i].astype(int)+2*Xtr[:,j].astype(int))%3==0)
        yte=((Xte[:,i].astype(int)+2*Xte[:,j].astype(int))%3==0)
    elif family=="xor3":
        ytr=((Xtr[:,i]>10) ^ (Xtr[:,j]>10) ^ (Xtr[:,k]>10))
        yte=((Xte[:,i]>10) ^ (Xte[:,j]>10) ^ (Xte[:,k]>10))
    elif family=="sine":
        ytr=(np.sin(0.9*Xtr[:,i]+1.4*Xtr[:,j])>0)
        yte=(np.sin(0.9*Xte[:,i]+1.4*Xte[:,j])>0)
    elif family=="checker":
        ytr=(((Xtr[:,i].astype(int)//3)+(Xtr[:,j].astype(int)//3))%2==0)
        yte=(((Xte[:,i].astype(int)//3)+(Xte[:,j].astype(int)//3))%2==0)
    else:
        raise ValueError(family)
    ytr=ytr.astype(int); yte=yte.astype(int)
    ytr ^= (rng.random(n_train)<noise); yte ^= (rng.random(n_test)<noise)
    return Xtr,ytr,Xte,yte

def baselines(Xtr,ytr,Xte,seed):
    lr=LogisticRegression(max_iter=400).fit(Xtr,ytr)
    tree=DecisionTreeClassifier(max_depth=4,min_samples_leaf=4,random_state=seed).fit(Xtr,ytr)
    rf=RandomForestClassifier(n_estimators=50,max_depth=6,min_samples_leaf=2,max_features="sqrt",random_state=seed,n_jobs=1).fit(Xtr,ytr)
    return lr.predict(Xte),tree.predict(Xte),rf.predict(Xte)

rows=[]
for fi,fam in enumerate(EXPRESSIBLE_FAMILIES):
    for r in range(12):
        seed=1000+fi*100+r
        Xtr,ytr,Xte,yte=make_world(seed,fam)
        p_lr,p_tree,p_rf=baselines(Xtr,ytr,Xte,seed)
        p_ctds,_,n=best_distinction(Xtr,ytr,Xte,rng=np.random.default_rng(seed))
        rows.append({"family":fam,"seed":seed,"candidate_count":n,
                     "logistic":accuracy_score(yte,p_lr),"tree":accuracy_score(yte,p_tree),
                     "random_forest":accuracy_score(yte,p_rf),"ctds":accuracy_score(yte,p_ctds)})
expr=pd.DataFrame(rows)
expr.to_csv(OUT/'expressible_worlds.csv',index=False)

rows=[]
for fi,fam in enumerate(EXPRESSIBLE_FAMILIES):
    for r in range(12):
        seed=3000+fi*100+r
        Xtr,ytr,Xte,yte=make_world(seed,fam)
        p_ctds,_,n=best_distinction(Xtr,ytr,Xte,rng=np.random.default_rng(seed+1))
        p_rand,_,_=best_distinction(Xtr,ytr,Xte,random_choice=True,rng=np.random.default_rng(seed+2))
        p_shuf,_,_=best_distinction(Xtr,ytr,Xte,rng=np.random.default_rng(seed+3),shuffled=True)
        rows.append({"family":fam,"seed":seed,"candidate_count":n,
                     "targeted":accuracy_score(yte,p_ctds),"score_permuted":accuracy_score(yte,p_rand),
                     "label_shuffled":accuracy_score(yte,p_shuf)})
ctrl=pd.DataFrame(rows)
ctrl.to_csv(OUT/'ctds_controls.csv',index=False)

rows=[]
for fi,fam in enumerate(ALIEN_FAMILIES):
    for r in range(6):
        seed=5000+fi*100+r
        Xtr,ytr,Xte,yte=make_alien(seed,fam)
        p_lr,p_tree,p_rf=baselines(Xtr,ytr,Xte,seed)
        p_ctds,_,n=best_distinction(Xtr,ytr,Xte,rng=np.random.default_rng(seed),balanced=True)
        rows.append({"family":fam,"seed":seed,"candidate_count":n,
                     "logistic_accuracy":accuracy_score(yte,p_lr),"tree_accuracy":accuracy_score(yte,p_tree),
                     "random_forest_accuracy":accuracy_score(yte,p_rf),"ctds_accuracy":accuracy_score(yte,p_ctds),
                     "logistic_balanced":balanced_accuracy_score(yte,p_lr),"tree_balanced":balanced_accuracy_score(yte,p_tree),
                     "random_forest_balanced":balanced_accuracy_score(yte,p_rf),"ctds_balanced":balanced_accuracy_score(yte,p_ctds)})
alien=pd.DataFrame(rows)
alien.to_csv(OUT/'primitive_withheld_worlds.csv',index=False)

D=ctrl.targeted-ctrl.score_permuted
stat,p=wilcoxon(D,alternative='greater')
rng=np.random.default_rng(42)
boots=np.array([rng.choice(D.to_numpy(),len(D),replace=True).mean() for _ in range(10000)])
summary={
    "expressible_n":int(len(expr)),
    "expressible_means":expr[["logistic","tree","random_forest","ctds"]].mean().to_dict(),
    "ctds_beats_rf":int((expr.ctds>expr.random_forest).sum()),
    "control_n":int(len(ctrl)),
    "control_means":ctrl[["targeted","score_permuted","label_shuffled"]].mean().to_dict(),
    "targeted_beats_random":int((ctrl.targeted>ctrl.score_permuted).sum()),
    "mean_targeted_minus_random":float(D.mean()),
    "bootstrap95":list(map(float,np.quantile(boots,[.025,.975]))),
    "wilcoxon_stat":float(stat),"wilcoxon_p":float(p),
    "alien_n":int(len(alien)),
    "alien_balanced_means":alien[["logistic_balanced","tree_balanced","random_forest_balanced","ctds_balanced"]].mean().to_dict(),
}
with open(OUT/'ctds_summary.json','w') as f: json.dump(summary,f,indent=2)
print(json.dumps(summary,indent=2))
