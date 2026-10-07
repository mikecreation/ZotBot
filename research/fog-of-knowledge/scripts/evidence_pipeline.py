"""Small file-based candidate/review workflow; no database or signing infrastructure."""
from __future__ import annotations
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from evidence_compiler import ROOT, EvidenceError, audit_index, candidate_digest, canonical, digest, enforce, load_candidate, review_packet, verify_decision


def graph():
    return json.loads((ROOT/"data/knowledge.json").read_text(encoding="utf-8"))


def policy():
    return json.loads((ROOT/"data/evidence-policy.json").read_text(encoding="utf-8"))


def review_path(candidate):
    return ROOT/"nemesis/adjudications"/(candidate_digest(candidate)+".json")


def load_decisions(candidate):
    p=review_path(candidate)
    return json.loads(p.read_text(encoding="utf-8"))["decisions"] if p.exists() else []


def retain_decisions(candidate,decisions,reviewer,model,role):
    from source_capture import validate_captures
    from evidence_compiler import validate_sources
    validate_captures(validate_sources(candidate))
    packet=review_packet(candidate,graph())
    approved=[]
    for raw in decisions:
        decision={**raw,"candidate_sha256":packet["candidate_sha256"],"reviewer_id":reviewer,"model":model,
                  "context_sha256":packet['context_sha256'],
                  "role":role,"reviewed_at":datetime.now(timezone.utc).isoformat()}
        if decision.get("outcome") not in {"supported","unsupported","uncertain"}:raise EvidenceError("invalid decision outcome")
        if not decision.get("rationale"):raise EvidenceError("decision rationale required")
        # Unsupported/uncertain decisions are retained too; they never pass the gate.
        if decision["outcome"]=="supported":verify_decision(decision,policy())
        approved.append(decision)
    p=review_path(candidate);p.parent.mkdir(parents=True,exist_ok=True)
    old=load_decisions(candidate)
    existing={digest(r) for r in old}
    for decision in approved:
        if digest(decision) not in existing:old.append(decision)
    p.write_text(json.dumps({"protocol":"fog-evidence-adjudication/1","candidate_sha256":packet["candidate_sha256"],"decisions":old},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return {"retained":len(approved),"candidate_sha256":packet["candidate_sha256"]}


def retain_quarantine(candidate,reason):
    h=candidate_digest(candidate);folder=ROOT/"nemesis/quarantine";folder.mkdir(parents=True,exist_ok=True)
    record={"protocol":"fog-quarantine/1","candidate_sha256":h,"batch_id":candidate["manifest.json"].get("batch_id"),
            "reason":str(reason),"state":"needs-evidence-or-review","candidate":candidate}
    target=folder/(h+".json")
    if not target.exists():target.write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return record


def write_index(g=None):
    value=audit_index(g or graph())
    (ROOT/"data/evidence-index.json").write_text(json.dumps(value,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return value


def persist_sources(proof):
    folder=ROOT/"data/evidence/snapshots";folder.mkdir(parents=True,exist_ok=True)
    for source in proof["sources"].values():
        path=folder/(source["sha256"]+".txt")
        if path.exists() and path.read_bytes()!=source["text"].encode("utf-8"):raise EvidenceError("snapshot collision")
        if not path.exists():path.write_text(source["text"],encoding="utf-8",newline="")


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("action",choices=["capture","packet","review","check","audit"])
    parser.add_argument("batch_dir",nargs="?",type=Path)
    parser.add_argument("--decision",type=Path)
    parser.add_argument("--reviewer")
    parser.add_argument("--model")
    parser.add_argument("--role",choices=["entailment","adversarial"])
    parser.add_argument('--url');parser.add_argument('--source-id');parser.add_argument('--title')
    parser.add_argument('--source-kind',choices=['primary','secondary','unknown'],default='unknown')
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.action=="audit":print(json.dumps(write_index(),ensure_ascii=False,indent=2));return
    if args.action=='capture':
        if not all((args.url,args.source_id,args.title)):parser.error('capture requires --url --source-id --title')
        from source_capture import capture_source
        source=capture_source(args.url,args.source_id,args.title,args.source_kind)
        text=json.dumps(source,ensure_ascii=False)+'\n'
        if args.output:
            if args.output.exists():parser.error('output already exists; retain a new revision without overwriting candidate sources')
            args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(text,encoding='utf-8')
        print(text,end='');return
    if not args.batch_dir:parser.error("batch_dir required")
    candidate=load_candidate(args.batch_dir)
    try:
        from source_capture import validate_captures
        from evidence_compiler import validate_sources
        validate_captures(validate_sources(candidate))
        if args.action=="packet":value=review_packet(candidate,graph())
        elif args.action=="review":
            if not all((args.decision,args.reviewer,args.model,args.role)):parser.error("review requires --decision --reviewer --model --role")
            value=retain_decisions(candidate,json.loads(args.decision.read_text(encoding="utf-8"))["decisions"],args.reviewer,args.model,args.role)
        else:
            proof=enforce(candidate,graph(),load_decisions(candidate),policy())
            value={k:v for k,v in proof.items() if k not in {"sources","assertions","decisions"}}
        print(json.dumps(value,ensure_ascii=False,indent=2))
    except (EvidenceError,ValueError) as exc:
        retain_quarantine(candidate,exc)
        print(json.dumps({"valid":False,"state":"quarantined","reason":str(exc)},ensure_ascii=False))
        raise SystemExit(2)


if __name__=="__main__":main()
