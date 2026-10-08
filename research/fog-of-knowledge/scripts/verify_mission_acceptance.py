"""Independent live mission acceptance; searches/unit-test totals are not progress.

Read a real Nemesis queue, retained Brain requests, canonical captures and reviews,
and optionally GitHub's publication/CI identities. Never dispatch or approve work.
Exit 0 = bounded acceptance demonstrated, 2 = still incomplete, 1 = invalid proof.
Every invocation retains a report and an append-only observation ledger.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import time

from evidence_compiler import candidate_digest, load_candidate, validate_evidence_history, audit_index, storage_record

PROTOCOL = 'fog-mission-acceptance/1'


def assess(observation, min_domains=3, min_nodes=6):
    checks = {
        'installed_sources_match_baseline': observation['sources_match'],
        'canonical_evidence_and_captures_valid': observation['evidence_valid'],
        'reviewed_new_canonical_records': observation['new_nodes'] >= min_nodes,
        'reviewed_growth_across_fields': observation['growth_domains'] >= min_domains,
        'independent_reviewed_publications': observation['merged_domains'] >= min_domains,
        'multiple_completed_publications': observation['merged_batches'] >= min_domains,
        'automatic_followup_after_publication': observation['followup_after_merge'],
        'followup_used_expanded_knowledge': observation['followup_used_new_graph'],
        'continuation_still_enabled': observation['queue_enabled'],
        'publication_identity_verified': observation['publication_verified'],
        'brain_justified_scientific_direction': observation.get('scientific_direction',False),
        'followup_used_substantive_findings': observation.get('substantive_followup',False),
        'unfinished_work_survived_controlled_restart': observation.get('restart_recovered',False),
        'no_duplicate_dispatch_or_publication': observation.get('no_duplicates',False),
        'loaded_extension_matches_tested_build': observation.get('extension_matches',False),
    }
    return {'status': 'PASSED' if all(checks.values()) else 'INCOMPLETE', 'checks': checks}


def online_publication(owner, repo, publication):
    def get(path):
        result = subprocess.run(['gh', 'api', path], capture_output=True, text=True, timeout=25)
        if result.returncode:
            raise ValueError('GitHub verification unavailable: '+result.stderr[:300])
        return json.loads(result.stdout)
    base = 'repos/'+owner+'/'+repo
    pull = get(base+'/pulls/'+str(publication['pr_number']))
    head = publication['commit_sha']
    if not pull['merged'] or pull['head']['sha'] != head or pull['merge_commit_sha'] != publication['merge_commit_sha']:
        raise ValueError('GitHub merge/head differs from the retained publication')
    runs = get(base+'/commits/'+head+'/check-runs')['check_runs']
    if not any(r['name']=='validate' and r['status']=='completed' and r['conclusion']=='success' for r in runs):
        raise ValueError('Exact publication head lacks successful validation CI')
    return {'head': head, 'merge': pull['merge_commit_sha'], 'pr': pull['html_url']}


def observe(native, fog, baseline, owner, repo, path, online=False):
    graph = json.loads((fog/'data/knowledge.json').read_text(encoding='utf-8'))
    policy = json.loads((fog/'data/evidence-policy.json').read_text(encoding='utf-8'))
    validate_evidence_history(graph, fog, policy)
    indexed = audit_index(graph)['states']
    previous = set(baseline['baseline_canonical_ids'])
    new = [n for n in graph['nodes'] if n['id'] not in previous and indexed[n['id']]=='evidence-reviewed']
    sources_match = all(hashlib.sha256((native/name).read_bytes()).hexdigest()==expected
                        for name, expected in baseline['native_sources'].items())
    crew = native/'data/github_cache/evidence-crew'
    queue = crew/'coverage'/owner/repo/(hashlib.sha256(path.encode()).hexdigest()[:24]+'.json')
    state = json.loads(queue.read_text(encoding='utf-8'))
    if state['protocol'] != 'fog-coverage/1' or (state['owner'],state['repo'],state['path']) != (owner,repo,path):
        raise ValueError('Coverage queue identity does not match acceptance project')
    tasks = [t for t in state['tasks'].values() if t['created_at'] >= baseline['started_at']]
    bundles = {b['batch_id']: b for b in graph.get('evidence_reviews', [])}
    merged = []
    for task in tasks:
        if not task.get('batch_id'):
            continue
        flow = json.loads((crew/owner/repo/task['batch_id']/'flow.json').read_text(encoding='utf-8'))
        if flow['state'] != 'MERGED':
            continue
        bundle = bundles.get(flow['batch_id'])
        if not bundle:
            # Caller may still have an older main checkout; never count unpublished data.
            continue
        candidate = load_candidate(fog/'nemesis/batches'/flow['batch_id'])
        if candidate_digest(candidate)!=flow['candidate_sha256'] or bundle['candidate_sha256']!=flow['candidate_sha256']:
            raise ValueError('Canonical candidate differs from the completed worker flow')
        publication = flow['publication']
        if not publication.get('merged') or not publication.get('commit_sha') or not publication.get('merge_commit_sha'):
            raise ValueError('Completed flow lacks exact publication identity')
        verified = online_publication(owner,repo,publication) if online else None
        # Count actual canonical additions, not proposed target counts or searches.
        current = {n['id']:n for n in new}
        contributed = [n for n in candidate['nodes.jsonl'] if current.get(n['id'])==storage_record(n)]
        merged.append({'batch_id':flow['batch_id'], 'planned_domain':task['domain'],
                       'growth_domains':sorted({n['domain'] for n in contributed}),
                       'new_nodes':len(contributed), 'new_ids':[n['id'] for n in contributed], 'merged_at':publication['merged_at'],
                       'pr_url':publication['pr_url'], 'verified':verified})
    first_merge = min((f['merged_at'] for f in merged), default=float('inf'))
    later = [t for t in tasks if t['created_at'] > first_merge and t.get('job_id')]
    followups = []
    scientific_direction=False;substantive_followup=False;restart_recovered=False;no_duplicates=False
    db = sqlite3.connect((native/'data/arena.db').as_uri()+'?mode=ro', uri=True, timeout=1)
    try:
        db.execute('PRAGMA query_only=ON')
        for task in later:
            row = db.execute('SELECT packet FROM brain_jobs WHERE id=?',(task['job_id'],)).fetchone()
            if not row:
                raise ValueError('Follow-up Brain request is missing')
            envelope = json.loads(row[0])
            goal = json.loads(envelope['GOAL'])
            count = goal.get('context',{}).get('counts',{}).get('nodes',0)
            followups.append({'branch':task['key'], 'domain':task['domain'], 'context_nodes':count,
                              'used_new_graph':count > baseline['baseline_nodes']})
        known_new={n['id']:n for n in new}
        decisions=state.get('decisions',{})
        for plan in decisions.values():
            proposal=plan.get('proposal',{})
            if plan.get('state')=='ADMITTED' and proposal.get('rationale') and proposal.get('strategy',{}).get('queries'):
                scientific_direction=True
            if plan['created_at']<=first_merge:continue
            input_nodes={n['id']:n for n in plan.get('input',{}).get('graph',{}).get('nodes',[])}
            for use in proposal.get('finding_uses',[]):
                nid=use.get('id'); node=known_new.get(nid)
                if node and input_nodes.get(nid)==node and use.get('summary')==node.get('summary') and use.get('implication'):
                    substantive_followup=True
                    followups.append({'planning_id':plan['id'],'finding_id':nid,'summary':use['summary'],'implication':use['implication'],
                                      'used_new_graph':True,'substantive':True,'job_id':plan.get('job_id')})
        tags=db.execute("SELECT CASE WHEN json_valid(packet) THEN json_extract(packet,'$.STATE.tag') END tag,count(*) n FROM brain_jobs WHERE created>=? GROUP BY tag",(baseline['started_at'],)).fetchall()
        no_duplicates=all(n==1 for tag,n in tags if tag and tag.startswith('fog-crew:')) and len({f['pr_url'] for f in merged})==len(merged)
        proof_path=native/'output/scientific-authority-controlled-restart.json'
        if proof_path.exists():
            proof=json.loads(proof_path.read_text(encoding='utf-8'))
            recovered=[]
            for before in proof.get('inflight',[]):
                r=db.execute('SELECT status,owner,lease,packet,updated FROM brain_jobs WHERE id=?',(before['id'],)).fetchone()
                if not r:raise ValueError('Restart lost a tracked job')
                status,owner_value,lease,packet_text,updated=r
                goal=json.loads(packet_text)['GOAL']
                recovered.append(status=='COMPLETE' and hashlib.sha256(str(lease).encode()).hexdigest()==before['lease_sha256']
                    and hashlib.sha256(str(owner_value).encode()).hexdigest()==before['owner_sha256']
                    and hashlib.sha256(goal.encode()).hexdigest()==before['goal_sha256'] and updated>proof['started_at'])
            retained=all((native/name).is_file() and hashlib.sha256((native/name).read_bytes()).hexdigest()==sha
                         for name,sha in proof.get('retained_evidence',{}).items())
            restart_recovered=bool(recovered) and all(recovered) and retained and proof['started_at']>=baseline['started_at'] and proof.get('before_pid')!=proof.get('after_pid') and bool(proof.get('after_pid'))
    finally:
        db.close()
    growth_domains = {d for f in merged for d in f['growth_domains']}
    pool_file=native/'output/scientific-authority-deployment.json'
    deployment=json.loads(pool_file.read_text(encoding='utf-8')) if pool_file.exists() else {}
    extension_matches=deployment.get('bridge_version')=='14.13-scientific-resume' and any(
        slot.get('connected') and slot.get('extension_build')=='6.2.4-scientific-resume' for slot in deployment.get('pool',{}).values())
    return {'sources_match':sources_match, 'evidence_valid':True, 'new_nodes':len({nid for f in merged for nid in f['new_ids']}),
            'growth_domains':len(growth_domains), 'merged_domains':len(growth_domains),
            'merged_batches':len(merged),
            'followup_after_merge':bool(later), 'followup_used_new_graph':any(f['used_new_graph'] for f in followups),
            'queue_enabled':state['enabled'], 'publication_verified':bool(merged) and online,
            'visited_fields':len({t['domain'] for t in tasks}), 'visited_branches':len(tasks),
            'inventory_sha':state.get('inventory_sha'), 'publications':merged, 'followups':followups,
            'scientific_direction':scientific_direction,'substantive_followup':substantive_followup,
            'restart_recovered':restart_recovered,'no_duplicates':no_duplicates,'extension_matches':extension_matches}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--native-root', type=Path, required=True)
    parser.add_argument('--fog-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--owner', default='mikecreation')
    parser.add_argument('--repo', default='ZotBot')
    parser.add_argument('--path', default='research/fog-of-knowledge')
    parser.add_argument('--online', action='store_true', help='Require independent exact-head GitHub merge/CI verification')
    args = parser.parse_args()
    baseline = json.loads(args.baseline.read_text(encoding='utf-8'))
    report = {'protocol':PROTOCOL, 'observed_at':time.time(), 'baseline_main':baseline['main_sha'],
              'scope':'Bounded live continuation acceptance; not proof of exhaustive knowledge or future failure immunity.'}
    try:
        observation = observe(args.native_root.resolve(),args.fog_root.resolve(),baseline,args.owner,args.repo,args.path,args.online)
        report.update(observation=observation, **assess(observation))
    except Exception as exc:
        report.update(status='INVALID_PROOF', error=str(exc))
    args.report.parent.mkdir(parents=True,exist_ok=True)
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with args.report.with_suffix('.jsonl').open('a',encoding='utf-8') as ledger:
        ledger.write(json.dumps(report,ensure_ascii=False)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if report['status']=='PASSED' else 2 if report['status']=='INCOMPLETE' else 1


if __name__ == '__main__':
    raise SystemExit(main())
