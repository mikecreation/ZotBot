#!/usr/bin/env python3
from pathlib import Path
import csv, math
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

ROOT = Path(__file__).resolve().parent
FIG = ROOT / "figures"
REPRO = ROOT / "repro"
FIG.mkdir(exist_ok=True)

def rows(path):
    # Some exported CSV snapshots can carry one provenance banner line.
    # Ignore it so the checked-in data remains human-readable and machine-usable.
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    if lines and lines[0].startswith("<PARSED TEXT FOR SHEET:"):
        lines = lines[1:]
    return list(csv.DictReader(lines))

def save(fig, name):
    fig.tight_layout()
    fig.savefig(FIG / name, dpi=180, bbox_inches="tight")
    plt.close(fig)

# 1. Evidence-ceiling figure from the 400-trial output.
r = rows(REPRO / "representation_ceiling_results.csv")
groups = [
    ("Relativity-like\nlow", "relativity-like", "low-only"),
    ("Relativity-like\nexpanded", "relativity-like", "expanded"),
    ("Alien q=4\nlow", "alien-q4", "low-only"),
    ("Alien q=4\nexpanded", "alien-q4", "expanded"),
]
data = []
for _, world, regime in groups:
    vals = [float(x["delta_bic_latent_minus_simple"]) for x in r if x["world"] == world and x["regime"] == regime]
    data.append(vals)
fig, ax = plt.subplots(figsize=(8.4,4.8))
ax.boxplot(data, tick_labels=[g[0] for g in groups], showfliers=False)
ax.axhline(0, lw=1)
ax.set_ylabel("Delta BIC: latent minus simple")
ax.set_title("Same discovery engine, different evidence")
save(fig, "figure_evidence_ceiling.png")

# 2. Expressible hidden-rule worlds.
r = rows(REPRO / "expressible_worlds.csv")
methods = [("Logistic\n(raw)","logistic"),("Tree\n(raw)","tree"),("Random forest\n(raw)","random_forest"),("Consequence-targeted\nsearch","ctds")]
means = [100*np.mean([float(x[k]) for x in r]) for _,k in methods]
fig, ax = plt.subplots(figsize=(8,4.6))
bars=ax.bar(range(len(means)),means)
ax.set_xticks(range(len(means)),[m[0] for m in methods])
ax.set_ylim(50,100); ax.set_ylabel("Held-out accuracy (%)")
ax.set_title("Expressible hidden worlds")
for b,v in zip(bars,means): ax.text(b.get_x()+b.get_width()/2,v+0.7,f"{v:.1f}%",ha="center",fontsize=9)
save(fig, "figure_ctds_expressible.png")

# 3. Primitive ceiling.
r = rows(REPRO / "primitive_withheld_worlds.csv")
families = sorted(set(x["family"] for x in r))
rf=[]; ct=[]
for f in families:
    rr=[x for x in r if x["family"]==f]
    rf.append(100*np.mean([float(x["random_forest_balanced"]) for x in rr]))
    ct.append(100*np.mean([float(x["ctds_balanced"]) for x in rr]))
x=np.arange(len(families)); w=.38
fig,ax=plt.subplots(figsize=(8.3,4.7))
ax.bar(x-w/2,rf,w,label="Random forest")
ax.bar(x+w/2,ct,w,label="Consequence-targeted search")
ax.axhline(50,lw=1); ax.set_xticks(x,families); ax.set_ylabel("Balanced accuracy (%)")
ax.set_title("Primitive withheld: fixed language loses its advantage"); ax.legend(frameon=False)
save(fig,"figure_primitive_ceiling.png")

# 4. The Fourth Side schematic.
fig,ax=plt.subplots(figsize=(9,4.5)); ax.axis("off")
stages=[("3D extent","y"),("rotate observer basis",r"$U(\alpha)=\cos\alpha\,e_2+\sin\alpha\,u_w$"),("visible result",r"$y\cos\alpha$   +   $w\sin\alpha$")]
xs=[.12,.5,.86]
for i,(a,b) in enumerate(stages):
    box=FancyBboxPatch((xs[i]-.13,.36),.26,.28,boxstyle="round,pad=.02",fc="white",ec="black",lw=1.2)
    ax.add_patch(box); ax.text(xs[i],.54,a,ha="center",va="center",weight="bold"); ax.text(xs[i],.44,b,ha="center",va="center",fontsize=10)
    if i<2: ax.add_patch(FancyArrowPatch((xs[i]+.14,.5),(xs[i+1]-.14,.5),arrowstyle="->",mutation_scale=18,lw=1.2))
ax.text(.5,.16,"A familiar direction can fade from the display while an orthogonal fourth-coordinate direction becomes visible.",ha="center",fontsize=10)
save(fig,"figure_fourth_side_schematic.png")

# 5. Representation geometry.
fig,ax=plt.subplots(figsize=(9,4.8)); ax.axis("off")
nodes=[
    (.12,.62,"Substrate","where computation lives"),
    (.38,.62,"Distinctions Z","what differences exist"),
    (.64,.62,"Topology Γ","who can interact"),
    (.88,.62,"Projection Π","what becomes observable"),
]
for x0,y0,title,sub in nodes:
    box=FancyBboxPatch((x0-.1,y0-.1),.2,.2,boxstyle="round,pad=.02",fc="white",ec="black",lw=1.1)
    ax.add_patch(box); ax.text(x0,y0+.025,title,ha="center",weight="bold"); ax.text(x0,y0-.045,sub,ha="center",fontsize=8)
for i in range(len(nodes)-1):
    ax.add_patch(FancyArrowPatch((nodes[i][0]+.105,.62),(nodes[i+1][0]-.105,.62),arrowstyle="->",mutation_scale=16,lw=1.1))
ax.text(.5,.28,r"$\mathcal{R}=(Z,\Gamma,\Pi)$",ha="center",fontsize=17)
ax.text(.5,.16,"A representation is not only its variables. It also includes interaction structure and the interface through which consequences are read.",ha="center",fontsize=10)
save(fig,"figure_representation_geometry.png")
