#!/usr/bin/env python3
import json
from pathlib import Path
from collections import Counter, defaultdict, deque

ROOT=Path(__file__).resolve().parents[1]
g=json.loads((ROOT/"data"/"knowledge.json").read_text(encoding="utf-8"))
from evidence_compiler import EvidenceError, audit_index, validate_evidence_history
try:
    validate_evidence_history(g,ROOT,json.loads((ROOT/"data/evidence-policy.json").read_text(encoding="utf-8")))
except (EvidenceError,ValueError,KeyError,OSError) as exc:
    raise SystemExit("VALIDATION FAILED: "+str(exc))
if json.loads((ROOT/"data/evidence-index.json").read_text(encoding="utf-8"))!=audit_index(g):
    raise SystemExit("VALIDATION FAILED: stale evidence index; run python scripts/evidence_pipeline.py audit")

# Browser and CI consume the exact same compiled registry/navigation artifact.
from atlas_navigation import build, OUTPUT
projection = build(g)
if not OUTPUT.exists() or json.loads(OUTPUT.read_text(encoding="utf-8")) != projection:
    raise SystemExit("VALIDATION FAILED: stale navigation; run python scripts/atlas_navigation.py")
g["nodes"].extend(projection["registry_nodes"])

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
print("NAVIGATION:", json.dumps(projection["counts"], sort_keys=True))
print(f"OK: {len(g['nodes'])} nodes, {len(g['edges'])} edges, {len(ologies)} -ologies, {len(frontier)} frontier nodes")
