#!/usr/bin/env python3
"""Stage documented English terms suffixed with -ology from Wiktionary."""
import json, urllib.parse, urllib.request
from pathlib import Path
API="https://en.wiktionary.org/w/api.php"
CATEGORY="Category:English terms suffixed with -ology"
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data"/"ologies.staging.json"
def get(params):
    url=API+"?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={"User-Agent":"FogOfKnowledge/0.1 open research map"})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
titles=[]; cont=None
while True:
    p={"action":"query","format":"json","list":"categorymembers","cmtitle":CATEGORY,"cmnamespace":0,"cmlimit":"500"}
    if cont:p["cmcontinue"]=cont
    d=get(p); titles += [x["title"] for x in d["query"]["categorymembers"]]
    cont=d.get("continue",{}).get("cmcontinue")
    if not cont:break
entries=[]
for title in sorted(set(titles),key=str.casefold):
    if not title.casefold().endswith("ology"):continue
    slug="".join(c.lower() if c.isalnum() else "-" for c in title).strip("-")
    entries.append({"id":"staging.ology."+slug,"label":title,"source":"https://en.wiktionary.org/wiki/"+urllib.parse.quote(title.replace(" ","_")),"curation_state":"unclassified"})
OUT.write_text(json.dumps({"source":CATEGORY,"count":len(entries),"entries":entries},indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
print(f"staged {len(entries)} terms -> {OUT}")
