"""Breadth, continuation and crash recovery, without live research or databases."""
import copy
import json
import threading
from types import SimpleNamespace

import pytest

from test_github_evidence import Brain, rig
from sim.fog_coverage import FogCoveragePlanner, choose_branch, PROTOCOL, TAG_EXPRESSION
from sim.brain_bridge import BrainBridge
from sim.store import Store
from sim import github_evidence as ge
from fastapi import FastAPI
from fastapi.testclient import TestClient


def inventory():
    return [dict(id=f'{d}-{i}', label=f'{d} branch {i}', domain=d, kind='subfield',
                 has_sources=False, source_urls=[], summary='')
            for d in ['physics', 'life', 'engineering', 'medicine', 'humanities',
                      'social', 'math', 'earth', 'information', 'foundations']
            for i in range(3 if d != 'physics' else 100)]


def context(nodes):
    return {'coverage_inventory': nodes,
            'coverage_by_domain': [dict(domain=d, label=d) for d in dict.fromkeys(n['domain'] for n in nodes)]}


@pytest.fixture
def planner(tmp_path):
    brain = Brain()
    brain.enabled = True
    brain.hold = ''
    brain.kv_get = lambda key, default='': brain.hold if key == 'brain_hold' else default
    packet = context(inventory())
    ws = SimpleNamespace(project_row=lambda *a: {'key': 'fixture', 'mode': 'READ_BRANCH_PR'},
                         resolve=lambda *a: 'a'*40, run_context=lambda *a: {'exit_code': 0},
                         s=SimpleNamespace(cache_get=lambda key: {'sha': 'a'*40, 'packet': packet}))
    crew = SimpleNamespace(root=tmp_path/'crew', lock=threading.RLock(), ws=ws, brain=brain, file_errors={})
    crew.load = lambda folder: json.loads((folder/'flow.json').read_text())
    crew.location = lambda owner, repo, bid: crew.root/owner/repo/bid
    planner = FogCoveragePlanner(crew)
    def discover(owner, repo, path, missions, auto_publish, coverage_tasks):
        jobs = []
        from sim.fog_coverage import discovery_tag
        for task in coverage_tasks:
            tag = discovery_tag(owner, repo, path, task['key'])
            found = brain.one('json_extract', (tag,))
            jid = found['id'] if found else brain.enqueue('', task['label'], 6000, tag)
            target = crew.root/'discoveries'/(jid+'.json')
            if not target.exists():
                planner.save(target, dict(owner=owner, repo=repo, path=path, state='QUEUED', job_id=jid))
            jobs.append(jid)
        return {'jobs': jobs}
    crew.discover = discover
    return planner


def activate(planner):
    planner.configure('owner', 'repo', 'fog', True, True)
    planner.tick()
    return planner.load('owner', 'repo', 'fog')


def finish(planner, task, outcome='MERGED'):
    p = planner.crew.root/'discoveries'/(task['job_id']+'.json')
    entry = json.loads(p.read_text())
    entry.update(state='HANDED_OFF', batch_id=task['key'])
    planner.save(p, entry)
    planner.save(planner.crew.location('owner', 'repo', task['key'])/'flow.json',
                 dict(path='fog', state=outcome, discovery={'source_requests': []},
                      yield_counts={'new_nodes': 7, 'updated_nodes': 1, 'edges': 2}, error='Uncertain evidence'))


def test_complete_domain_rotation_despite_hundred_physics_branches():
    nodes = inventory()
    domains = list(dict.fromkeys(n['domain'] for n in nodes))
    tasks = {}
    last = None
    for cycle in range(3):
        observed = []
        for _ in domains:
            node = choose_branch(nodes, tasks, domains, last)
            observed.append(node['domain'])
            tasks[node['id']] = node
            last = node['domain']
        assert observed == domains
    assert len(tasks) == 30


def test_three_branch_capacity_and_automatic_next_wave_after_merge_or_hold(planner):
    state = activate(planner)
    assert [t['domain'] for t in state['tasks'].values()] == ['physics', 'life', 'engineering']
    planner.tick()
    assert len(planner.crew.brain.rows) == 3
    old = list(state['tasks'].values())
    for task, outcome in zip(old, ['MERGED', 'BLOCKED', 'MERGED']):
        finish(planner, task, outcome)
    planner.tick()
    state = planner.load('owner', 'repo', 'fog')
    assert [t['domain'] for t in list(state['tasks'].values())[3:]] == ['medicine', 'humanities', 'social']
    assert state['tasks'][old[1]['key']]['state'] == 'HELD'
    assert state['totals'] == {'new_nodes': 14, 'updated_nodes': 2, 'edges': 4}
    planner.tick()
    assert planner.load('owner', 'repo', 'fog')['totals'] == state['totals']
    assert len(planner.crew.brain.rows) == 6


def test_intent_enqueue_crash_reuses_jobs_and_reconstructs_discovery(planner):
    planner.configure('owner', 'repo', 'fog', True)
    original = planner.crew.discover
    def crash(*args, **kwargs):
        result = original(*args, **kwargs)
        # Simulate one absent handoff checkpoint after the durable Brain enqueue.
        (planner.crew.root/'discoveries'/(result['jobs'][0]+'.json')).unlink()
        raise RuntimeError('Crash after enqueue')
    planner.crew.discover = crash
    planner.tick()
    state = planner.load('owner', 'repo', 'fog')
    assert state['state'] == 'RECOVERY_PENDING'
    assert len(planner.crew.brain.rows) == 3
    state['next_attempt_at'] = 0
    planner.save(planner.location('owner', 'repo', 'fog'), state)
    planner.crew.discover = original
    restarted = FogCoveragePlanner(planner.crew)
    restarted.tick()
    state = restarted.load('owner', 'repo', 'fog')
    assert len(planner.crew.brain.rows) == 3
    assert all(t.get('job_id') for t in state['tasks'].values())
    assert len(list((planner.crew.root/'discoveries').glob('*.json'))) == 3
    assert not planner.crew.file_errors


def test_manual_batches_also_occupy_capacity(planner):
    for i in range(2):
        planner.save(planner.crew.location('owner', 'repo', str(i))/'flow.json',
                     dict(path='fog', state='REVIEW', discovery={'source_requests': []}))
    state = activate(planner)
    assert len(state['tasks']) == 1
    assert len(planner.crew.brain.rows) == 1


@pytest.mark.parametrize('condition', ['paused', 'brain_disabled', 'brain_hold'])
def test_pause_and_brain_hold_never_dispatch_more_work(planner, condition):
    state = activate(planner)
    for task in state['tasks'].values():
        finish(planner, task)
    if condition == 'paused':
        planner.configure('owner', 'repo', 'fog', False)
    elif condition == 'brain_disabled':
        planner.crew.brain.enabled = False
    else:
        planner.crew.brain.hold = 'Primary delivery needs inspection'
    planner.tick()
    assert len(planner.crew.brain.rows) == 3
    assert planner.load('owner', 'repo', 'fog')['totals']['new_nodes'] == 21
    planner.crew.brain.enabled = True
    planner.crew.brain.hold = ''
    planner.configure('owner', 'repo', 'fog', True)
    planner.tick()
    assert len(planner.crew.brain.rows) == 6


def test_ready_then_manual_merge_counts_once(planner):
    state = activate(planner)
    task = next(iter(state['tasks'].values()))
    finish(planner, task, 'READY')
    planner.tick()
    assert planner.load('owner', 'repo', 'fog')['totals']['new_nodes'] == 0
    finish(planner, task, 'MERGED')
    planner.tick()
    planner.tick()
    assert planner.load('owner', 'repo', 'fog')['totals']['new_nodes'] == 7


def test_malformed_identity_kept_and_cannot_stop_other_queue(planner):
    bad = planner.root/'invalid!owner'/'repo'/'bad.json'
    raw = json.dumps(dict(protocol=PROTOCOL, owner='invalid!owner', repo='repo', path='fog', tasks={}, enabled=True))
    bad.parent.mkdir(parents=True)
    bad.write_text(raw)
    activate(planner)
    assert bad.read_text() == raw
    assert len(planner.crew.brain.rows) == 3
    assert planner.crew.file_errors


def test_exhausted_inventory_waits_without_repeating_sources_or_branches(planner):
    planner.crew.ws.s.cache_get = lambda key: {'sha': 'a'*40, 'packet': context(inventory()[:1])}
    state = activate(planner)
    finish(planner, next(iter(state['tasks'].values())))
    planner.tick()
    assert planner.load('owner', 'repo', 'fog')['state'] == 'WAITING_FOR_NEW_BRANCHES'
    assert len(planner.crew.brain.rows) == 1
    planner.crew.ws.resolve = lambda *a: 'b'*40
    planner.crew.ws.s.cache_get = lambda key: {'sha': 'b'*40, 'packet': context(inventory()[:2])}
    planner.tick()
    assert len(planner.crew.brain.rows) == 2


@pytest.mark.parametrize('domain,expected_count', [('life', 3), ('physics', 100)])
def test_real_discovery_uses_complete_branch_context_and_durable_identity(rig, domain, expected_count):
    packet = context(inventory())
    rig.ws.s.cache_get = lambda key: {'sha': 'a'*40, 'packet': packet}
    task = dict(key=domain+'-0', domain=domain, label=domain+' branch', target=next(n for n in packet['coverage_inventory'] if n['domain']==domain), source_history=[])
    first = rig.crew.discover('owner', 'repo', 'fog', ['Map Life'], True, coverage_tasks=[task])
    second = rig.crew.discover('owner', 'repo', 'fog', ['Map Life'], True, coverage_tasks=[task])
    assert first['jobs'] == second['jobs']
    job = rig.brain.rows[first['jobs'][0]]
    goal = json.loads(job['goal'])
    assert goal['context']['coverage_plan']['domain'] == domain
    assert {n['domain'] for n in goal['context']['known_branch_records']} == {domain}
    assert len(goal['context']['known_branch_records']) == expected_count
    assert 'coverage_inventory' not in goal['context']
    entry = json.loads((rig.crew.root/'discoveries'/(job['id']+'.json')).read_text())
    assert entry['coverage_task']['key'] == domain+'-0'
    original = json.loads(rig.brain.rows[rig.jid]['result'])['RETURN']['text']
    rig.brain.complete(job['id'], json.loads(original))
    rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['coverage_task']['key'] == domain+'-0'
    assert flow['state'] == 'AUTHOR', flow.get('error')
    author_goal = json.loads(rig.brain.rows[flow['jobs']['author']]['goal'])
    assert author_goal['coverage_plan']['capacity_goal']['is_quota'] is False
    assert 'ONE or TWO' not in rig.brain.rows[flow['jobs']['author']]['system']


def test_source_reuse_is_advisory_and_existing_targets_reach_author(rig):
    from test_github_evidence import author
    author(rig)
    flow = rig.crew.load(rig.folder)
    graphpath = rig.folder/'project/data/knowledge.json'
    graph = json.loads(graphpath.read_text(encoding='utf-8'))
    represented = copy.deepcopy(rig.candidate['nodes.jsonl'][0])
    represented['id'] = 'already-represented'
    represented['sources'] = [{'url': flow['discovery']['source_requests'][0]['url']}]
    representations = [{**represented, 'id': 'already-represented-'+str(i)} for i in range(41)]
    graph['nodes'].extend(representations)
    graphpath.write_text(json.dumps(graph),encoding='utf-8')
    flow['coverage_task'] = dict(key='branch', target={'id': 'branch'}, source_history=[{'url': represented['sources'][0]['url']}])
    goal = json.loads(rig.crew.author_goal(flow, rig.folder))
    assert goal['coverage_plan']['existing_representations'] == representations
    assert goal['coverage_plan']['source_history']


def test_tag_lookup_index_migrates_safely_without_rewriting_invalid_old_packet(tmp_path):
    store = Store(str(tmp_path/'arena.db'))
    try:
        brain = BrainBridge(store)
        brain.set_enabled(True)
        store.execute('DROP INDEX brain_jobs_tag')
        store.execute("INSERT INTO brain_jobs(id,status,packet,created) VALUES('bad','COMPLETE','broken JSON',1)")
        jid = brain.enqueue('test', 'test', 20, 'coverage-index-fixture')
        BrainBridge(store)
        query = 'SELECT id FROM brain_jobs WHERE '+TAG_EXPRESSION+'=? ORDER BY created DESC LIMIT 1'
        assert store.one(query, ('coverage-index-fixture',))['id'] == jid
        plan = store.query('EXPLAIN QUERY PLAN '+query, ('coverage-index-fixture',))
        assert any('brain_jobs_tag' in row['detail'] for row in plan)
        assert store.one("SELECT packet FROM brain_jobs WHERE id='bad'")['packet'] == 'broken JSON'
    finally:
        store.db.close()


def test_coverage_route_is_explicit_same_origin_and_preserves_pause(rig):
    rig.crew.coverage.paged = None  # Route policy fixture deliberately exercises legacy context migration.
    packet = context(inventory())
    rig.ws.s.cache_get = lambda key: {'sha': 'a'*40, 'packet': packet}
    app = FastAPI()
    ge.install_evidence_routes(app, rig.crew)
    client = TestClient(app, client=('127.0.0.1', 1234))
    endpoint = '/api/github/project/owner/repo/evidence-crew/coverage'
    body = dict(path='fog', enabled=True, auto_publish=True)
    assert client.post(endpoint, json=body, headers={'origin': 'https://untrusted.example'}).status_code == 403
    assert client.post(endpoint, content='x'*4097).status_code == 413
    assert client.post(endpoint, json={**body, 'enabled': 'true'}).status_code == 400
    enabled = client.post(endpoint, json=body)
    assert enabled.status_code == 200
    assert enabled.json()['enabled'] is True
    assert len(rig.brain.rows) == 1  # configure reserves no implicit worker job
    paused = client.post(endpoint, json={**body, 'enabled': False})
    assert paused.status_code == 200
    assert paused.json()['state'] == 'PAUSED'


def test_stale_context_dispatches_nothing_and_retains_recovery_intent(planner):
    planner.configure('owner', 'repo', 'fog', True)
    planner.contexts.clear()
    planner.crew.ws.resolve = lambda *a: 'b'*40
    planner.tick()
    state = planner.load('owner', 'repo', 'fog')
    assert state['state'] == 'RECOVERY_PENDING'
    assert 'Fresh atlas context unavailable' in state['error']
    assert not state['tasks']
    assert not planner.crew.brain.rows
