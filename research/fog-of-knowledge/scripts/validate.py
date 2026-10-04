#!/usr/bin/env python3
import json
from pathlib import Path
from collections import Counter, defaultdict, deque

ROOT=Path(__file__).resolve().parents[1]
g=json.loads((ROOT/"data"/"knowledge.json").read_text(encoding="utf-8"))

# Merge runtime -ology registry for integrity checks.
parent={"earth":"field.geology","life":"field.biology","health":"practice.medicine","social":"field.sociology","humanities":"field.philosophy","physical":"field.physics","information":"field.cognitive-science","engineering":"field.engineering","formal":"field.logic"}
existing={n["label"].casefold() for n in g["nodes"]}
for line in (ROOT/"data"/"ologies.tsv").read_text(encoding="utf-8").splitlines()[1:]:
    if not line.strip(): continue
    label,domain,era=line.split("\t")
    if label.casefold() in existing: continue
    slug="".join(c.lower() if c.isalnum() else "-" for c in label).strip("-")
    node_id="ology."+slug
    g["nodes"].append({"id":node_id,"label":label,"kind":"field","domain":domain,"era":era,"status":"active","tags":["ology","registry-seed"]})
    if domain in parent: g["edges"].append({"source":parent[domain],"target":node_id,"type":"derived_from","dependency":"soft"})
    existing.add(label.casefold())

errors=[]
ids=[n["id"] for n in g["nodes"]]
for k,v in Counter(ids).items():
    if v>1: errors.append(f"duplicate node id: {k}")
node_ids=set(ids)
eras={x["id"] for x in g["eras"]}
domains={x["id"] for x in g["domains"]}
for n in g["nodes"]:
    if n["era"] not in eras: errors.append(f"{n['id']}: bad era")
    if n["domain"] not in domains: errors.append(f"{n['id']}: bad domain")
for i,e in enumerate(g["edges"]):
    if e["source"] not in node_ids: errors.append(f"edge {i}: missing source {e['source']}")
    if e["target"] not in node_ids: errors.append(f"edge {i}: missing target {e['target']}")
    if e["source"]==e["target"]: errors.append(f"edge {i}: self loop")
adj=defaultdict(list); indeg=Counter(); hard=set()
for e in g["edges"]:
    if e.get("dependency")=="hard" and e["type"] in {"depends_on","enabled","derived_from"}:
        adj[e["source"]].append(e["target"]); indeg[e["target"]]+=1; hard|={e["source"],e["target"]}
q=deque(n for n in hard if indeg[n]==0); seen=0
while q:
    n=q.popleft(); seen+=1
    for m in adj[n]:
        indeg[m]-=1
        if indeg[m]==0:q.append(m)
if seen!=len(hard):errors.append("hard dependency cycle")
if errors:
    print("VALIDATION FAILED")
    for e in errors: print(" -",e)
    raise SystemExit(1)
ologies=[n for n in g["nodes"] if "ology" in n.get("tags",[])]
frontier=[n for n in g["nodes"] if n.get("frontier")]
print(f"OK: {len(g['nodes'])} nodes, {len(g['edges'])} edges, {len(ologies)} -ologies, {len(frontier)} frontier nodes")
