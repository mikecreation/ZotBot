"""Regression tests for real worker envelopes and durable Fog handoffs.

The compiler and sandbox are real; only source fetching, Brain, and GitHub are
fakes. These tests never use a live research job or production database.
"""
import copy
import json
import threading
import asyncio
import httpx
from pathlib import Path

import pytest

from test_github_evidence import rig, author, approve
from sim import github_evidence as ge, github_batches as gb
from sim.github_workspace import GitHubError, PathRejected
from types import SimpleNamespace
from fastapi import FastAPI


def completed_author(rig, change):
    packet = author(rig)
    change(packet)
    flow = rig.crew.load(rig.folder)
    rig.brain.complete(flow['jobs']['author'], packet)
    rig.crew.tick()
    return packet, rig.crew.load(rig.folder)


def review_ready(rig):
    author(rig)
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'REVIEW'


def ci_ready(rig):
    review_ready(rig)
    approve(rig, 'entailment')
    approve(rig, 'adversarial')
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'CI'
    return rig.crew.load(rig.folder)


@pytest.mark.parametrize('shape', ['empty_sources', 'nested_source_ids'])
def test_real_worker_source_reference_envelopes_enter_review(rig, shape):
    def change(packet):
        ids = [source['id'] for source in packet['sources']]
        if shape == 'empty_sources':
            packet.update(sources=[], source_ids=ids)
        else:
            packet['sources'] = {'source_ids': ids}
    original, flow = completed_author(rig, change)
    assert flow['state'] == 'REVIEW', flow.get('error')
    retained = json.loads((rig.folder / 'author-result.json').read_text())
    assert retained == original
    draft = json.loads((rig.folder / 'project/nemesis/batches/test-evidence/sources.jsonl').read_text())
    assert draft == rig.candidate['sources.jsonl'][0]


def test_source_wrapper_never_overrides_supplied_source_content(rig):
    def change(packet):
        packet['source_ids'] = [source['id'] for source in packet['sources']]
        packet['sources'][0]['text'] = 'Invented public source prose'
    _, flow = completed_author(rig, change)
    assert flow['state'] == 'BLOCKED'
    assert len(rig.brain.rows) == 2
    assert not rig.ws.publications


def test_unknown_source_reference_is_quarantined_before_review(rig):
    def change(packet):
        packet['sources'] = []
        packet['source_ids'] = ['not-a-retained-capture']
    _, flow = completed_author(rig, change)
    assert flow['state'] == 'BLOCKED'
    assert len(rig.brain.rows) == 2


@pytest.mark.parametrize('shape', ['ids', 'missing_url'])
def test_canonical_source_references_bind_exact_capture_before_hashing(rig, shape):
    def change(packet):
        source = packet['sources'][0]
        node = packet['nodes'][0]
        node['sources'] = [source['id']] if shape == 'ids' else [{'id': source['id']}]
        assertion = packet['assertions'][0]
        assertion['canonical_record'] = copy.deepcopy(node)
        assertion.pop('target_sha256')
    original, flow = completed_author(rig, change)
    assert flow['state'] == 'REVIEW', flow.get('error')
    packet = json.loads((rig.folder / 'project/nemesis/batches/test-evidence/.nemesis-control/packet.json').read_text())
    candidate = packet['candidate'] if 'candidate' in packet else packet
    nodes = candidate.get('nodes.jsonl', candidate.get('nodes', []))
    if not nodes:
        nodes = [json.loads((rig.folder / 'project/nemesis/batches/test-evidence/nodes.jsonl').read_text())]
    assert nodes[0]['sources'][0]['url'] == rig.candidate['sources.jsonl'][0]['url']
    assert original['nodes'][0]['summary'] == nodes[0]['summary']


def test_explicit_wrong_canonical_source_url_is_never_silently_repaired(rig):
    def change(packet):
        node = packet['nodes'][0]
        node['sources'][0]['url'] = 'https://example.org/different-source'
        packet['assertions'][0]['canonical_record'] = copy.deepcopy(node)
        packet['assertions'][0].pop('target_sha256')
    _, flow = completed_author(rig, change)
    assert flow['state'] == 'BLOCKED'
    assert len(rig.brain.rows) == 2


def test_real_worker_single_support_object_preserves_exact_quote(rig):
    def change(packet):
        assertion = packet['assertions'][0]
        assertion['support'] = assertion['support'][0]
    original, flow = completed_author(rig, change)
    assert flow['state'] == 'REVIEW', flow.get('error')
    assertion = json.loads((rig.folder / 'project/nemesis/batches/test-evidence/assertions.jsonl').read_text())
    assert assertion['support'] == [original['assertions'][0]['support']]


def test_realistic_worker_envelope_completes_full_review_ci_merge(rig):
    def change(packet):
        source = packet['sources'][0]
        packet['sources'] = {'source_ids': [source['id']]}
        packet['batch_id'] = 'model-picked-a-different-envelope-id'
        packet['manifest'].pop('batch_id')
        packet['manifest']['agent'] = 'model-self-description'
        node = packet['nodes'][0]
        node['sources'] = [source['id']]
        assertion = packet['assertions'][0]
        assertion['canonical_record'] = copy.deepcopy(node)
        assertion.pop('target_sha256')
        span = assertion['support'][0]
        for key in ('source_sha256', 'start', 'end'):
            span.pop(key)
        assertion['support'] = span
    original, flow = completed_author(rig, change)
    assert flow['state'] == 'REVIEW', flow.get('error')
    assert json.loads((rig.folder / 'author-result.json').read_text()) == original
    approve(rig, 'entailment')
    approve(rig, 'adversarial')
    rig.ws.client.green = True
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'MERGED'
    assert len(rig.ws.publications) == 1
    assert len(rig.ws.client.writes) == 1
    assert len(rig.brain.rows) == 4


def test_restart_between_reviews_preserves_job_ids_and_one_retained_role(rig):
    review_ready(rig)
    approve(rig, 'entailment')
    rig.crew.tick()
    before = rig.crew.load(rig.folder)
    assert before['retained_roles'] == ['entailment']
    count = len(rig.brain.rows)
    restored = ge.FogEvidenceCrew(rig.ws, rig.brain)
    restored.tick()
    after = restored.load(rig.folder)
    assert after['state'] == 'REVIEW'
    assert after['jobs'] == before['jobs']
    assert after['retained_roles'] == before['retained_roles']
    assert len(rig.brain.rows) == count
    approve(rig, 'adversarial')
    restored.tick()
    assert restored.load(rig.folder)['state'] == 'CI'
    assert len(rig.ws.publications) == 1


def test_concurrent_ticks_never_duplicate_author_or_reviewer_jobs(rig):
    rig.crew.start('owner', 'repo', 'fog', rig.jid)
    errors = []
    def tick():
        try:
            rig.crew.tick()
        except Exception as exc:
            errors.append(exc)
    threads = [threading.Thread(target=tick) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors
    assert len(rig.brain.rows) == 2
    flow = rig.crew.load(rig.folder)
    rig.candidate['manifest.json']['agent'] = flow['author_identity']
    packet = {'batch_id': 'test-evidence', **{key.removesuffix('.jsonl').removesuffix('.json'): value for key, value in rig.candidate.items()}}
    rig.brain.complete(flow['jobs']['author'], packet)
    threads = [threading.Thread(target=tick) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors
    assert len(rig.brain.rows) == 4
    assert rig.crew.load(rig.folder)['state'] == 'REVIEW'


def test_candidate_tampering_between_roles_is_rejected(rig):
    review_ready(rig)
    approve(rig, 'entailment')
    rig.crew.tick()
    path = rig.folder / 'project/nemesis/batches/test-evidence/nodes.jsonl'
    record = json.loads(path.read_text())
    record['summary'] = 'This unsupported stronger claim is certainly true everywhere.'
    path.write_text(json.dumps(record) + '\n')
    approve(rig, 'adversarial')
    rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['state'] == 'BLOCKED'
    assert not rig.ws.publications


@pytest.mark.parametrize('bad_check', ['exact_support', 'scope_preserved', 'no_strengthening', 'relation_direction', 'representation_justified'])
def test_each_scientific_review_gate_blocks_independently(rig, bad_check):
    review_ready(rig)
    rig.decisions[1]['checks'][bad_check] = False
    approve(rig, 'entailment')
    approve(rig, 'adversarial')
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'BLOCKED'
    assert not rig.ws.publications


def test_stale_review_target_cannot_authorize_a_new_target(rig):
    review_ready(rig)
    rig.decisions[1]['target_sha256'] = 'd' * 64
    approve(rig, 'entailment')
    approve(rig, 'adversarial')
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'BLOCKED'
    assert not rig.ws.publications


def test_missing_review_decisions_cannot_be_treated_as_approval(rig):
    review_ready(rig)
    approve(rig, 'entailment')
    flow = rig.crew.load(rig.folder)
    rig.brain.complete(flow['jobs']['adversarial'], {'decisions': []})
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'BLOCKED'
    assert not rig.ws.publications


def test_restarting_ci_wait_never_republishes_or_redispatches(rig):
    flow = ci_ready(rig)
    flow['next_ci_check'] = 0
    rig.crew.save(rig.folder, flow)
    count = len(rig.brain.rows)
    restored = ge.FogEvidenceCrew(rig.ws, rig.brain)
    restored.tick()
    assert restored.load(rig.folder)['state'] == 'CI'
    assert len(rig.brain.rows) == count
    assert len(rig.ws.publications) == 1
    assert not rig.ws.client.writes


@pytest.mark.parametrize('conclusion', ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'])
def test_failed_publication_checks_stop_with_reason_and_no_merge(rig, conclusion):
    flow = ci_ready(rig)
    original = rig.ws.client.call
    def call(method, url, **kwargs):
        if url.endswith('/check-runs'):
            return {'check_runs': [{'name': 'validate', 'status': 'completed', 'conclusion': conclusion}]}, {}
        return original(method, url, **kwargs)
    rig.ws.client.call = call
    flow['next_ci_check'] = 0
    rig.crew.save(rig.folder, flow)
    rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['state'] == 'BLOCKED'
    assert 'CI' in flow['error']
    assert not rig.ws.client.writes


def test_successful_old_check_does_not_override_pending_current_check(rig):
    flow = ci_ready(rig)
    original = rig.ws.client.call
    def call(method, url, **kwargs):
        if url.endswith('/check-runs'):
            return {'check_runs': [
                {'name': 'validate', 'status': 'completed', 'conclusion': 'success'},
                {'name': 'validate', 'status': 'in_progress', 'conclusion': None},
            ]}, {}
        return original(method, url, **kwargs)
    rig.ws.client.call = call
    flow['next_ci_check'] = 0
    rig.crew.save(rig.folder, flow)
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'CI'
    assert not rig.ws.client.writes


def test_external_merge_of_changed_pr_head_is_not_claimed_as_our_candidate(rig):
    flow = ci_ready(rig)
    original = rig.ws.client.call
    def call(method, url, **kwargs):
        if '/pulls/' in url and not url.endswith('/merge'):
            return {'head': {'sha': '9' * 40}, 'state': 'closed', 'merged': True}, {}
        return original(method, url, **kwargs)
    rig.ws.client.call = call
    flow['next_ci_check'] = 0
    rig.crew.save(rig.folder, flow)
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'BLOCKED'
    assert not rig.ws.client.writes


@pytest.mark.parametrize('corrupt_kind', ['discovery', 'flow'])
def test_corrupt_sibling_state_cannot_starve_healthy_flow(rig, corrupt_kind):
    rig.crew.start('owner', 'repo', 'fog', rig.jid)
    if corrupt_kind == 'discovery':
        path = rig.crew.root / 'discoveries/000-corrupt.json'
    else:
        path = rig.crew.root / 'aaa/aaa/aaa/flow.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{truncated json')
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'AUTHOR'
    assert len(rig.brain.rows) == 2
    assert rig.crew.file_errors


@pytest.mark.parametrize('value', [{}, [], {'state': 'QUEUED'}])
def test_valid_json_with_invalid_discovery_schema_cannot_starve_healthy_flow(rig, value):
    rig.crew.start('owner', 'repo', 'fog', rig.jid)
    path = rig.crew.root / 'discoveries/000-invalid-schema.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'AUTHOR'
    status = rig.crew.status('owner', 'repo', 'fog')
    assert status['flows'][0]['state'] == 'AUTHOR'
    assert status['diagnostics']


def test_provenance_mutation_cannot_be_published_by_an_approved_review(rig):
    review_ready(rig)
    approve(rig, 'entailment')
    approve(rig, 'adversarial')
    source = rig.candidate['sources.jsonl'][0]
    raw = rig.folder / 'project/data/evidence/raw' / (source['raw_sha256'] + '.bin')
    raw.write_bytes(b'Tampered retained response')
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'BLOCKED'
    assert not rig.ws.publications


def test_capture_integrity_failure_is_terminal_even_with_revision_budget(rig, monkeypatch):
    monkeypatch.setattr(ge, 'MAX_AUTHOR_ATTEMPTS', 3)
    review_ready(rig)
    approve(rig, 'entailment')
    approve(rig, 'adversarial')
    source = rig.candidate['sources.jsonl'][0]
    raw = rig.folder / 'project/data/evidence/raw' / (source['raw_sha256'] + '.bin')
    raw.write_bytes(b'Tampered retained response is never a new scientific revision')
    rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['state'] == 'BLOCKED'
    assert flow['author_attempt'] == 1
    assert len(rig.brain.rows) == 4
    assert not rig.ws.publications


class PublicationAPI:
    def __init__(self):
        self.calls = []
        self.refs = {}
        self.prs = []
        self.lose_pr_response = False
        self.lose_ref_response = False

    def api(self, ws, method, url, body=None):
        self.calls.append((method, url, body))
        if method == 'GET' and '/pulls?' in url:
            return copy.deepcopy(self.prs)
        if method == 'GET' and '/pulls/' in url:
            return copy.deepcopy(next(pr for pr in self.prs if str(pr['number']) == url.rsplit('/', 1)[1]))
        if method == 'POST' and url.endswith('/git/blobs'):
            return {'sha': 'c' * 40}
        if method == 'POST' and url.endswith('/git/trees'):
            return {'sha': 'd' * 40}
        if method == 'POST' and url.endswith('/git/commits'):
            return {'sha': 'e' * 40}
        if method == 'GET' and '/git/commits/' in url:
            return {'tree': {'sha': 'a' * 40}}
        if method == 'POST' and url.endswith('/git/refs'):
            if body['ref'] in self.refs:
                raise GitHubError(422, 'Reference already exists')
            self.refs[body['ref']] = body['sha']
            if self.lose_ref_response:
                self.lose_ref_response = False
                raise RuntimeError('Simulated transport loss after creating ref')
            return {'object': {'sha': body['sha']}}
        if method == 'GET' and '/git/ref/heads/' in url:
            from urllib.parse import unquote
            ref = 'refs/heads/' + unquote(url.split('/git/ref/heads/', 1)[1])
            return {'object': {'sha': self.refs[ref]}}
        if method == 'POST' and url.endswith('/pulls'):
            if self.prs:
                raise GitHubError(422, 'PR already exists')
            pr = {'number': 7, 'html_url': 'https://example.org/fixture-pr/7',
                  'state': 'open', 'merged': False,
                  'head': {'ref': body['head'], 'sha': self.refs['refs/heads/' + body['head']]},
                  'base': {'ref': body['base']}}
            self.prs.append(pr)
            if self.lose_pr_response:
                self.lose_pr_response = False
                raise RuntimeError('Simulated transport loss after creating PR')
            return copy.deepcopy(pr)
        raise AssertionError((method, url, body))


@pytest.fixture
def publication(tmp_path, monkeypatch):
    api = PublicationAPI()
    monkeypatch.setattr(gb, '_git_api', api.api)
    ws = SimpleNamespace(repo=lambda *args, **kwargs: {'default_branch': 'main'})
    path = tmp_path / 'nemesis-publication.json'
    changes = [{'path': 'fog/data/evidence/raw/captured.bin', 'content': b'%PDF\x00\xff preserved bytes'}]
    def publish():
        return gb._create_branch_commit_pr(ws, 'owner', 'repo', 'b' * 40,
                                          'nemesis/fog-fixture-deadbeef', 'fixture', changes,
                                          'Fixture batch', 'Disposable fake only',
                                          receipt_path=path, draft_sha256='f' * 64)
    return SimpleNamespace(api=api, ws=ws, path=path, changes=changes, publish=publish)


@pytest.mark.parametrize('loss_stage', ['pr', 'ref'])
def test_publication_recovers_lost_response_without_duplicate_pr_or_force_push(publication, loss_stage):
    setattr(publication.api, 'lose_' + loss_stage + '_response', True)
    with pytest.raises(RuntimeError):
        publication.publish()
    checkpoint = json.loads(publication.path.read_text())
    assert checkpoint['commit_sha'] == 'e' * 40
    recovered = publication.publish()
    assert recovered['pr_number'] == 7
    assert len(publication.api.prs) == 1
    assert not any(method == 'PATCH' for method, _, _ in publication.api.calls)
    assert sum(method == 'POST' and url.endswith('/git/commits') for method, url, _ in publication.api.calls) == 1
    assert sum(method == 'POST' and url.endswith('/pulls') for method, url, _ in publication.api.calls) == 1


def test_publication_repeated_resume_reuses_exact_recorded_pr(publication):
    first = publication.publish()
    calls = len(publication.api.calls)
    second = publication.publish()
    assert second['pr_number'] == first['pr_number']
    assert second['publication_recovered']
    assert all(method == 'GET' for method, _, _ in publication.api.calls[calls:])


def test_concurrent_publication_calls_share_one_checkpoint_and_pr(publication):
    successes = []
    errors = []
    def publish():
        try:
            successes.append(publication.publish())
        except Exception as exc:
            errors.append(exc)
    threads = [threading.Thread(target=publish) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors
    assert len(successes) == 6
    assert {result['pr_number'] for result in successes} == {7}
    assert sum(method == 'POST' and url.endswith('/pulls') for method, url, _ in publication.api.calls) == 1
    assert not any(method == 'PATCH' for method, _, _ in publication.api.calls)


def test_reviewed_branch_is_never_force_replaced(publication):
    publication.api.refs['refs/heads/nemesis/fog-fixture-deadbeef'] = '9' * 40
    with pytest.raises(PathRejected, match='will not be overwritten'):
        publication.publish()
    assert not any(method == 'PATCH' for method, _, _ in publication.api.calls)
    assert not publication.api.prs


def test_publication_receipt_rejects_changed_content_before_any_new_write(publication):
    publication.publish()
    calls = len(publication.api.calls)
    publication.changes[0]['content'] += b' changed'
    with pytest.raises(PathRejected, match='changed after checkpoint'):
        publication.publish()
    assert all(method == 'GET' for method, _, _ in publication.api.calls[calls:])


def test_recovery_rejects_existing_pr_with_changed_head(publication):
    publication.publish()
    publication.api.prs[0]['head']['sha'] = '9' * 40
    calls = len(publication.api.calls)
    with pytest.raises(PathRejected, match='will not be overwritten'):
        publication.publish()
    assert all(method == 'GET' for method, _, _ in publication.api.calls[calls:])


def test_closed_unmerged_pr_is_not_reported_as_success(publication):
    publication.publish()
    publication.api.prs[0]['state'] = 'closed'
    with pytest.raises(PathRejected, match='closed without merging'):
        publication.publish()


def test_long_batch_ids_never_share_publication_branch():
    prefix = 'batch' + 'a' * 73
    left = gb._publication_branch(prefix + '01')
    right = gb._publication_branch(prefix + '02')
    assert left != right
    assert len(left) <= 90 and len(right) <= 90
    assert left.startswith('nemesis/fog-')


def test_api_merged_false_never_becomes_success(rig):
    flow = ci_ready(rig)
    original = rig.ws.client.call
    def call(method, url, **kwargs):
        if method == 'PUT':
            return {'merged': False, 'message': 'Base branch changed; merge pending'}, {}
        return original(method, url, **kwargs)
    rig.ws.client.call = call
    result = gb.brain_merge_pr(rig.ws, 'owner', 'repo', 'fog', 'test-evidence', expected_head=flow['publication']['commit_sha'])
    assert result['ok'] is False and result['merged'] is False
    metadata = json.loads((gb._batch_dir(rig.ws, 'owner', 'repo', 'test-evidence') / 'nemesis-draft.json').read_text())
    assert metadata['status'] == 'MERGE_FAILED'


def test_explicit_second_author_revision_can_pass_both_reviews_and_merge(rig, monkeypatch):
    monkeypatch.setattr(ge, 'MAX_AUTHOR_ATTEMPTS', 3)
    valid = author(rig)
    invalid = copy.deepcopy(valid)
    invalid['assertions'][0]['support'][0]['quote'] = 'A fabricated quote that is absent from the capture.'
    before = rig.crew.load(rig.folder)
    first_author = before['jobs']['author']
    rig.brain.complete(first_author, invalid)
    rig.crew.tick()
    revised = rig.crew.load(rig.folder)
    assert revised['state'] == 'AUTHOR'
    assert revised['author_attempt'] == 2
    assert revised['jobs']['author'] != first_author
    assert revised['feedback']['error']
    archived = json.loads((rig.folder / 'attempts/author-1/author-result.json').read_text())
    assert archived == invalid
    valid['source_ids'] = [source['id'] for source in valid.pop('sources')]
    valid['assertions'][0].pop('target_sha256')
    for span in valid['assertions'][0]['support']:
        for key in ('start', 'end', 'source_sha256'):
            span.pop(key)
    rig.brain.complete(revised['jobs']['author'], valid)
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'REVIEW'
    approve(rig, 'entailment')
    approve(rig, 'adversarial')
    rig.ws.client.green = True
    rig.crew.tick()
    assert rig.crew.load(rig.folder)['state'] == 'MERGED'
    assert rig.brain.rows[first_author]['status'] == 'COMPLETE'
    assert len(rig.brain.rows) == 5
    assert len(rig.ws.publications) == 1
    assert len(rig.ws.client.writes) == 1


def test_invalid_science_exhausts_three_candidate_revisions_without_publication(rig, monkeypatch):
    monkeypatch.setattr(ge, 'MAX_AUTHOR_ATTEMPTS', 3)
    invalid = author(rig)
    invalid['assertions'][0]['support'][0]['quote'] = 'Unsupported prose does not become science after retries.'
    for attempt in range(1, 4):
        flow = rig.crew.load(rig.folder)
        assert flow['state'] == 'AUTHOR'
        rig.brain.complete(flow['jobs']['author'], invalid)
        rig.crew.tick()
        flow = rig.crew.load(rig.folder)
        assert flow['author_attempt'] == min(attempt + 1, 3)
    assert flow['state'] == 'BLOCKED'
    assert flow['error']
    assert len(rig.brain.rows) == 4
    assert not rig.ws.publications
    assert not rig.ws.client.writes
    assert (rig.folder / 'attempts/author-1/author-result.json').exists()
    assert (rig.folder / 'attempts/author-2/author-result.json').exists()


def production_revision_budget(monkeypatch):
    monkeypatch.setattr(ge, 'MAX_AUTHOR_ATTEMPTS', 8)
    monkeypatch.setattr(ge, 'MAX_FORMAT_REVISIONS', 4)
    monkeypatch.setattr(ge, 'MAX_SCIENTIFIC_REVISIONS', 3)


def test_format_repairs_leave_scientific_refinement_budget_and_both_reviews_required(rig, monkeypatch):
    production_revision_budget(monkeypatch)
    valid = author(rig)
    first = rig.crew.load(rig.folder)
    source = rig.candidate['sources.jsonl'][0]
    raw_path = rig.folder / 'project/data/evidence/raw' / (source['raw_sha256'] + '.bin')
    retained_bytes = raw_path.read_bytes()
    rig.brain.rows[first['jobs']['author']]['result'] = '{"invalid JSON":'
    rig.crew.tick()
    second = rig.crew.load(rig.folder)
    assert second['author_attempt'] == 2
    assert second['revision_counts'] == {'format': 1, 'scientific': 0}
    raw_output = json.loads((rig.folder / 'attempts/author-1/batch/author-output.json').read_text())
    assert raw_output['raw_result'] == '{"invalid JSON":'
    invalid_quote = copy.deepcopy(valid)
    invalid_quote['assertions'][0]['support'][0]['quote'] = 'This exact excerpt is absent from the retained source.'
    rig.brain.complete(second['jobs']['author'], invalid_quote)
    rig.crew.tick()
    third = rig.crew.load(rig.folder)
    assert third['author_attempt'] == 3
    assert third['revision_counts'] == {'format': 2, 'scientific': 0}
    wrong_scope = copy.deepcopy(valid)
    wrong_scope['assertions'][0]['scope']['population'] = 'Signal events only, excluding all backgrounds in sample S'
    rig.brain.complete(third['jobs']['author'], wrong_scope)
    rig.crew.tick()
    old_review = rig.crew.load(rig.folder)
    assert old_review['state'] == 'REVIEW'
    approve(rig, 'entailment')
    rig.decisions[1].update(outcome='unsupported', rationale='A search for a signal does not show that all analyzed events are signal events.', limitations='Background events and selection criteria must remain part of the dataset scope.')
    rig.decisions[1]['checks']['scope_preserved'] = False
    approve(rig, 'adversarial')
    rig.crew.tick()
    fourth = rig.crew.load(rig.folder)
    assert fourth['state'] == 'AUTHOR'
    assert fourth['author_attempt'] == 4
    assert fourth['revision_counts'] == {'format': 2, 'scientific': 1}
    assert fourth['feedback']['code'] == 'review-rejection'
    assert fourth['failure_details']['details']['decisions'][0]['rationale'] == rig.decisions[1]['rationale']
    for role in ('entailment', 'adversarial'):
        assert not (rig.folder / (role + '-result.json')).exists()
        assert (rig.folder / 'attempts/author-3' / (role + '-result.json')).exists()
    archived = rig.folder / 'attempts/author-3/adversarial-result.json'
    archived_bytes = archived.read_bytes()
    old_archived_flow = json.loads((rig.folder / 'attempts/author-3/flow.json').read_text())
    rig.crew.archive_attempt(rig.folder, old_archived_flow, 'Repeated checkpoint must preserve old review')
    assert archived.read_bytes() == archived_bytes
    # A new explicit corrected scope and both bound roles are still necessary.
    rig.brain.complete(fourth['jobs']['author'], valid)
    rig.crew.tick()
    current = rig.crew.load(rig.folder)
    assert current['state'] == 'REVIEW'
    assert current['jobs']['adversarial'] != old_review['jobs']['adversarial']
    assert current['jobs']['entailment'] != old_review['jobs']['entailment']
    assert not (rig.folder / 'adversarial-result.json').exists()
    approve(rig, 'entailment')
    rig.crew.tick()
    assert not rig.ws.publications
    rig.decisions[1].update(outcome='supported', rationale='The corrected scope is exactly sample S.', limitations='Synthetic fixture only; no scientific knowledge established.')
    rig.decisions[1]['checks']['scope_preserved'] = True
    approve(rig, 'adversarial')
    rig.ws.client.green = True
    rig.crew.tick()
    final = rig.crew.load(rig.folder)
    assert final['state'] == 'MERGED', final.get('error')
    assert final['revision_counts'] == {'format': 2, 'scientific': 1}
    assert raw_path.read_bytes() == retained_bytes
    assert len(rig.ws.publications) == 1
    assert rig.brain.rows[first['jobs']['author']]['status'] == 'COMPLETE'


def test_format_revision_cap_does_not_consume_scientific_budget(rig, monkeypatch):
    production_revision_budget(monkeypatch)
    author(rig)
    for attempt in range(1, 6):
        flow = rig.crew.load(rig.folder)
        assert flow['state'] == 'AUTHOR'
        rig.brain.rows[flow['jobs']['author']].update(status='COMPLETE', result='{"bad":', error=None)
        rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['state'] == 'BLOCKED'
    assert flow['author_attempt'] == 5
    assert flow['revision_counts'] == {'format': 4, 'scientific': 0}
    assert flow['revision_exhausted'] == {'budget': 'format', 'used': 4, 'limit': 4}
    assert flow['feedback']['details']['pos'] == 7
    assert len(rig.brain.rows) == 6
    assert not rig.ws.publications


def test_scientific_revision_cap_retains_full_latest_terminal_review(rig, monkeypatch):
    production_revision_budget(monkeypatch)
    valid = author(rig)
    latest_rationale = 'Dataset includes background events; the stated signal-only scope is unsupported. ' * 70
    for attempt in range(1, 5):
        packet = copy.deepcopy(valid)
        packet['assertions'][0]['scope']['population'] = 'Unsupported signal-only subset ' + str(attempt)
        flow = rig.crew.load(rig.folder)
        rig.brain.complete(flow['jobs']['author'], packet)
        rig.crew.tick()
        assert rig.crew.load(rig.folder)['state'] == 'REVIEW'
        approve(rig, 'entailment')
        rig.decisions[1].update(outcome='unsupported', rationale=latest_rationale + str(attempt), limitations={'population': 'Sample S contains analyzed events, including backgrounds', 'uncertainty': ['Signal membership is not established']})
        rig.decisions[1]['checks']['scope_preserved'] = False
        approve(rig, 'adversarial')
        rig.crew.tick()
    terminal = rig.crew.load(rig.folder)
    assert terminal['state'] == 'BLOCKED'
    assert terminal['author_attempt'] == 4
    assert terminal['revision_counts'] == {'format': 0, 'scientific': 3}
    assert terminal['revision_exhausted'] == {'budget': 'scientific', 'used': 3, 'limit': 3}
    public = rig.crew.public(terminal)
    assert public['revision_budget'] == {'total_attempts': 8, 'format_revisions': 4, 'scientific_revisions': 3}
    decision = public['failure_details']['details']['decisions'][0]
    assert decision['rationale'] == latest_rationale + '4'
    assert decision['limitations'] == rig.decisions[1]['limitations']
    assert decision['checks']['scope_preserved'] is False
    assert terminal['feedback']['details'] == public['failure_details']['details']
    assert terminal['feedback']['error'] == terminal['error']
    metadata = json.loads((gb._batch_dir(rig.ws, 'owner', 'repo', 'test-evidence') / 'nemesis-draft.json').read_text())
    assert metadata['evidence']['failure_details'] == public['failure_details']
    assert not rig.ws.publications
    assert (rig.folder / 'adversarial-result.json').exists()


def test_total_cap_remains_bounded_even_if_independent_limits_are_larger(rig, monkeypatch):
    monkeypatch.setattr(ge, 'MAX_AUTHOR_ATTEMPTS', 3)
    monkeypatch.setattr(ge, 'MAX_FORMAT_REVISIONS', 100)
    monkeypatch.setattr(ge, 'MAX_SCIENTIFIC_REVISIONS', 100)
    author(rig)
    for kind in ('candidate', 'scientific', 'candidate'):
        flow = rig.crew.load(rig.folder)
        rig.crew.handle_failure(rig.folder, flow, ge.CrewFailure('Explicit ' + kind + ' revision required', kind, 'test-budget', {'exact_reason': kind}))
    terminal = rig.crew.load(rig.folder)
    assert terminal['state'] == 'BLOCKED'
    assert terminal['author_attempt'] == 3
    assert terminal['revision_counts'] == {'format': 1, 'scientific': 1}
    assert terminal['revision_exhausted'] == {'budget': 'total', 'used': 3, 'limit': 3}
    assert len(rig.brain.rows) == 4


def test_author_evidence_limitation_stops_without_auto_retry_and_retains_raw_output(rig, monkeypatch):
    production_revision_budget(monkeypatch)
    author(rig)
    flow = rig.crew.load(rig.folder)
    limitation = {'blocked_reason': 'The retained sources do not establish the analyzed population or the needed units.'}
    rig.brain.complete(flow['jobs']['author'], limitation)
    original_raw = rig.brain.rows[flow['jobs']['author']]['result']
    rig.crew.tick()
    terminal = rig.crew.load(rig.folder)
    assert terminal['state'] == 'BLOCKED'
    assert terminal['error_code'] == 'author-evidence-limitation'
    assert terminal['failure_kind'] == 'scientific'
    assert terminal['revision_counts'] == {'format': 0, 'scientific': 0}
    assert terminal['feedback']['details']['blocked_reason'] == limitation['blocked_reason']
    retained = json.loads((rig.folder / 'project/nemesis/batches/test-evidence/author-output.json').read_text())
    assert retained['output'] == limitation and retained['raw_result'] == original_raw
    for _ in range(3):
        ge.FogEvidenceCrew(rig.ws, rig.brain).tick()
    assert len(rig.brain.rows) == 2
    assert not rig.ws.publications


def test_upgrade_recovery_restores_tracked_terminal_review_instead_of_stale_quote_feedback(rig, monkeypatch):
    review_ready(rig)
    approve(rig, 'entailment')
    rig.decisions[1].update(outcome='unsupported', rationale='Analyzed events cannot be relabeled as signal events only.', limitations='Retained source includes backgrounds.')
    rig.decisions[1]['checks']['scope_preserved'] = False
    approve(rig, 'adversarial')
    rig.crew.tick()
    old = rig.crew.load(rig.folder)
    old['feedback'] = {'error': 'Quote needs one exact location or explicit offsets', 'details': {}}
    old.pop('failure_details')
    rig.crew.save(rig.folder, old)
    # Root result files can be stale; use the tracked completed role job instead.
    ge.write(rig.folder / 'adversarial-result.json', {'decisions': [{'outcome': 'supported', 'rationale': 'An obsolete earlier attempt'}]})
    assert rig.crew.recover('owner', 'repo', 'fog')['recovered'] == ['test-evidence']
    recovered = rig.crew.load(rig.folder)
    assert recovered['feedback']['code'] == 'review-rejection'
    assert recovered['feedback']['details']['job_id'] == old['jobs']['adversarial']
    assert recovered['feedback']['details']['decisions'][0]['rationale'] == rig.decisions[1]['rationale']
    assert recovered['reuse_author_result'] is False
    for role in ('entailment', 'adversarial'):
        assert not (rig.folder / (role + '-result.json')).exists()
    rig.crew.tick()
    current = rig.crew.load(rig.folder)
    assert current['state'] == 'AUTHOR'
    assert current['jobs']['author'] != old['jobs']['author']
    goal = json.loads(rig.brain.rows[current['jobs']['author']]['goal'])
    assert goal['previous_candidate_feedback']['details']['decisions'][0]['rationale'] == rig.decisions[1]['rationale']


def test_recover_enqueue_committed_before_flow_checkpoint(rig):
    first = rig.crew.enqueue('Retained system', 'Exact goal', 'crash-intent')
    restarted = ge.FogEvidenceCrew(rig.ws, rig.brain)
    recovered = restarted.enqueue('Retained system', 'Exact goal', 'crash-intent')
    assert recovered == first
    assert len(rig.brain.rows) == 2
    distinct = restarted.enqueue('Retained system', 'Changed explicit candidate goal', 'crash-intent')
    assert distinct != first
    assert len(rig.brain.rows) == 3


def test_transient_github_failure_retries_same_ci_without_redispatch_or_republish(rig, monkeypatch):
    monkeypatch.setattr(ge, 'MAX_OPERATIONAL_ATTEMPTS', 5)
    flow = ci_ready(rig)
    original = rig.ws.client.call
    failures = [True]
    def call(method, url, **kwargs):
        if failures and '/pulls/' in url:
            failures.pop()
            raise GitHubError(503, 'Temporary gateway outage')
        return original(method, url, **kwargs)
    rig.ws.client.call = call
    flow['next_ci_check'] = 0
    rig.crew.save(rig.folder, flow)
    rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['state'] == 'CI'
    assert flow['retry']['next_at']
    assert flow['failure_kind'] == 'operational'
    rig.ws.client.green = True
    flow['retry']['next_at'] = 0
    flow['next_ci_check'] = 0
    rig.crew.save(rig.folder, flow)
    restarted = ge.FogEvidenceCrew(rig.ws, rig.brain)
    restarted.tick()
    assert restarted.load(rig.folder)['state'] == 'MERGED'
    assert len(rig.ws.publications) == 1
    assert len(rig.brain.rows) == 4
    assert len(rig.ws.client.writes) == 1


def test_never_started_ci_expires_with_explicit_reason(rig):
    flow = ci_ready(rig)
    flow['ci_started_at'] = ge.time.time() - ge.CI_TIMEOUT - 1
    flow['next_ci_check'] = 0
    rig.crew.save(rig.folder, flow)
    rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['state'] == 'BLOCKED'
    assert flow['error_code'] == 'ci-timeout'
    assert not rig.ws.client.writes


@pytest.mark.parametrize('envelope', ['direct', 'brain_return'])
def test_fenced_json_result_is_parsed_without_content_repair(envelope):
    value = {'source_ids': ['fixture-source'], 'nodes': [], 'assertions': []}
    fenced = '```json\n' + json.dumps(value) + '\n```'
    payload = fenced if envelope == 'direct' else json.dumps({'RETURN': {'text': fenced}})
    assert ge.result_object(payload) == value


def test_pinned_capture_contract_survives_sibling_main_advancing(rig, monkeypatch):
    original = ge.execute
    def execute(work, script, args, **kwargs):
        result = original(work, script, args, **kwargs)
        if '--capture' in args:
            rig.ws.resolve = lambda *args: 'b' * 40
            rig.ws.run_worker_contract = lambda *args: {'ok': True, 'sha': 'b' * 40, 'contract': {}, 'prompt_block': 'newer main'}
        return result
    monkeypatch.setattr(ge, 'execute', execute)
    rig.crew.start('owner', 'repo', 'fog', rig.jid)
    rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['state'] == 'AUTHOR', flow.get('error')
    assert flow['base_sha'] == 'a' * 40
    assert flow['live_contract']['protocol'] == 'fog-nemesis-worker-contract/1'
    assert len(rig.brain.rows) == 2


def test_capture_success_resets_operational_retry_and_error(rig):
    rig.crew.start('owner', 'repo', 'fog', rig.jid)
    flow = rig.crew.load(rig.folder)
    flow.update(operational_attempts=4, error='Previous temporary source timeout', failure_kind='operational', retry={'attempt': 4, 'next_at': 0})
    rig.crew.save(rig.folder, flow)
    rig.crew.tick()
    flow = rig.crew.load(rig.folder)
    assert flow['state'] == 'AUTHOR'
    assert flow['operational_attempts'] == 0
    assert flow['error'] is None
    assert flow['failure_kind'] is None
    assert flow['retry'] is None


def blocked_captured_author(rig):
    author(rig)
    flow = rig.crew.load(rig.folder)
    flow.update(state='BLOCKED', error='Old integration format rejected a model result')
    rig.crew.save(rig.folder, flow)
    source = rig.candidate['sources.jsonl'][0]
    return flow, Path('data/evidence/raw') / (source['raw_sha256'] + '.bin')


def test_upgrade_recovery_download_failure_preserves_old_captures(rig, monkeypatch):
    flow, relative_raw = blocked_captured_author(rig)
    old_raw = rig.folder / 'project' / relative_raw
    original_bytes = old_raw.read_bytes()
    original = ge.materialize
    def failing(*args, **kwargs):
        raise GitHubError(503, 'Temporary upgrade checkout outage')
    monkeypatch.setattr(ge, 'materialize', failing)
    with pytest.raises(GitHubError):
        rig.crew.recover('owner', 'repo', 'fog')
    assert old_raw.read_bytes() == original_bytes
    assert rig.crew.load(rig.folder)['state'] == 'BLOCKED'
    assert not (rig.folder / 'recovery.json').exists()
    monkeypatch.setattr(ge, 'materialize', original)
    result = rig.crew.recover('owner', 'repo', 'fog')
    assert result['recovered'] == ['test-evidence']
    assert old_raw.read_bytes() == original_bytes
    assert json.loads((rig.folder / 'recovery.json').read_text())['complete']
    assert list((rig.folder / 'history').glob('project-*'))


def test_recovery_swap_crash_resumes_checkpoint_without_capture_loss(rig, monkeypatch):
    flow, relative_raw = blocked_captured_author(rig)
    original_bytes = (rig.folder / 'project' / relative_raw).read_bytes()
    original_replace = ge.os.replace
    failures = [True]
    def replace(source, destination):
        if failures and Path(source).name.startswith('recovered-project-') and Path(destination).name == 'project':
            failures.pop()
            raise OSError('Simulated shutdown between the two project directory renames')
        return original_replace(source, destination)
    monkeypatch.setattr(ge.os, 'replace', replace)
    with pytest.raises(OSError):
        rig.crew.recover('owner', 'repo', 'fog')
    checkpoint = json.loads((rig.folder / 'recovery.json').read_text())
    assert checkpoint['complete'] is False
    assert (rig.folder / checkpoint['archive'] / relative_raw).read_bytes() == original_bytes
    monkeypatch.setattr(ge.os, 'replace', original_replace)
    restored = ge.FogEvidenceCrew(rig.ws, rig.brain)
    restored.tick()
    assert (rig.folder / 'project' / relative_raw).read_bytes() == original_bytes
    assert json.loads((rig.folder / 'recovery.json').read_text())['complete']
    resumed = restored.load(rig.folder)
    assert resumed['state'] == 'AUTHOR'
    assert resumed['jobs']['author'] == flow['jobs']['author']
    assert len(rig.brain.rows) == 2


def test_changed_oversized_file_is_rejected_instead_of_silently_omitted(tmp_path):
    before = tmp_path / 'before'
    after = tmp_path / 'after'
    before.mkdir(); after.mkdir()
    (after / 'large-new-evidence.bin').write_bytes(b'x' * (gb.MAX_BATCH_FILE + 1))
    with pytest.raises(PathRejected, match='Changed publication file exceeds'):
        gb._changed_files(before, after, 'fog')


def test_unchanged_oversized_file_does_not_block_small_valid_publication(tmp_path):
    before = tmp_path / 'before'
    after = tmp_path / 'after'
    before.mkdir(); after.mkdir()
    data = b'x' * (gb.MAX_BATCH_FILE + 1)
    (before / 'pre-existing-large-file.bin').write_bytes(data)
    (after / 'pre-existing-large-file.bin').write_bytes(data)
    (after / 'bounded-new-data.json').write_text('{"synthetic":true}\n')
    changed = gb._changed_files(before, after, 'fog')
    assert [row['path'] for row in changed] == ['fog/bounded-new-data.json']


def test_unreadable_changed_file_is_rejected_instead_of_silently_omitted(tmp_path, monkeypatch):
    before = tmp_path / 'before'
    after = tmp_path / 'after'
    before.mkdir(); after.mkdir()
    unreadable = after / 'retained-proof.bin'
    unreadable.write_bytes(b'fixture proof')
    original = Path.read_bytes
    def read_bytes(path):
        if path == unreadable:
            raise OSError('Simulated unreadable publication evidence')
        return original(path)
    monkeypatch.setattr(Path, 'read_bytes', read_bytes)
    with pytest.raises(PathRejected, match='Cannot read publication file'):
        gb._changed_files(before, after, 'fog')


def test_parallel_candidates_wait_for_one_repository_publication_at_a_time(rig):
    first = ci_ready(rig)
    second_folder = rig.crew.location('owner', 'repo', 'second-evidence')
    second = copy.deepcopy(first)
    second.update(batch_id='second-evidence', state='PUBLISH', created_at=first['created_at'] + 1, publication=None, jobs={})
    rig.crew.save(second_folder, second)
    calls = []
    def propose(*args, **kwargs):
        calls.append(args[3])
        return {'ok': True, 'pr_number': 2, 'pr_url': 'https://example.org/fixture-second', 'commit_sha': 'c' * 40}
    rig.ws.propose_batch = propose
    rig.crew.tick()
    assert rig.crew.load(second_folder)['state'] == 'PUBLISH'
    assert not calls
    assert len(rig.brain.rows) == 4
    first = rig.crew.load(rig.folder)
    first['state'] = 'MERGED'
    rig.crew.save(rig.folder, first)
    rig.crew.tick()
    assert calls == ['second-evidence']


def test_confirmed_merge_invalidates_cached_main_before_next_candidate(rig):
    flow = ci_ready(rig)
    invalidated = []
    rig.ws.client.forget = invalidated.append
    result = gb.brain_merge_pr(rig.ws, 'owner', 'repo', 'fog', 'test-evidence', expected_head=flow['publication']['commit_sha'])
    assert result['merged']
    assert invalidated == ['sha:owner/repo@']


@pytest.fixture
def admission(tmp_path):
    from sim.store import Store
    from sim.research_authority import ResearchAuthority, ResearchBrainBridge
    store = Store(str(tmp_path / 'admission-offline.db'))
    store.execute('CREATE TABLE frontier_campaigns(id TEXT PRIMARY KEY,status TEXT)')
    brain = ResearchBrainBridge(store)
    brain.set_enabled(True)
    pandora = SimpleNamespace(db=SimpleNamespace(store=store), running=False,
                              arena=SimpleNamespace(llm=SimpleNamespace(brain=brain)))
    authority = ResearchAuthority(pandora)
    brain.authority = authority
    yield store, brain, authority
    store.db.close()


def test_identical_admission_polls_do_not_rewrite_durable_records(admission):
    store, brain, authority = admission
    jid = brain.enqueue('Offline fixture', 'No live research', 1, 'manual')
    authority.register(jid, {})
    authority.evaluate = lambda *args: ('DEFERRED', 'Explicit fixture pause')
    authority.gate(jid, 'QUEUE_ADMISSION')
    before = store.db.total_changes
    scope = store.one('SELECT disposition,reason,updated FROM research_delivery_scopes WHERE job_id=?', (jid,))
    job = store.one('SELECT status,error,owner,lease,updated FROM brain_jobs WHERE id=?', (jid,))
    for _ in range(4):
        assert authority.gate(jid, 'QUEUE_ADMISSION')['ok'] is False
    assert store.db.total_changes == before
    assert store.one('SELECT disposition,reason,updated FROM research_delivery_scopes WHERE job_id=?', (jid,)) == scope
    assert store.one('SELECT status,error,owner,lease,updated FROM brain_jobs WHERE id=?', (jid,)) == job
    plan = store.query('EXPLAIN QUERY PLAN SELECT decision,reason FROM research_admission_events WHERE job_id=? AND boundary=? ORDER BY id DESC LIMIT 1', (jid, 'QUEUE_ADMISSION'))
    assert any('ix_research_admission_job_boundary' in row['detail'] for row in plan)


def test_bounded_admission_windows_rotate_without_replaying_claimed_jobs(admission):
    store, brain, authority = admission
    seen = []
    def evaluate(jid, *args):
        seen.append(jid)
        return 'DEFERRED', 'Explicit fixture pause'
    authority.evaluate = evaluate
    jids = []
    for _ in range(7):
        jid = brain.enqueue('Offline fixture', 'No live research', 1, 'manual')
        authority.register(jid, {})
        jids.append(jid)
    claimed = jids.pop()
    store.execute("UPDATE brain_jobs SET status='CLAIMED',owner='fixture-owner',lease='fixture-lease' WHERE id=?", (claimed,))
    for _ in range(3):
        authority.reconcile(limit=2)
    assert len(seen) == 6
    assert set(seen) == set(jids)
    assert claimed not in seen
    assert store.one('SELECT status,owner,lease FROM brain_jobs WHERE id=?', (claimed,)) == {
        'status': 'CLAIMED', 'owner': 'fixture-owner', 'lease': 'fixture-lease'}


@pytest.mark.parametrize('endpoint', ['/api/brain/poll', '/api/brain/jobs/fixture/result', '/api/brain/jobs/fixture/authorize-send'])
def test_slow_sqlite_provider_boundary_does_not_block_async_app(endpoint):
    from sim.brain_bridge import install_routes
    started = threading.Event()
    released = threading.Event()
    worker_threads = []
    def slow(*args):
        worker_threads.append(threading.get_ident())
        started.set()
        released.wait(timeout=2)
        return {'ok': True}
    brain = SimpleNamespace(token='offline-fixture', poll=slow, result=slow, authorize_send=slow)
    app = FastAPI()
    install_routes(app, brain)
    @app.get('/fixture-health')
    async def health():
        return {'ok': True}
    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://127.0.0.1') as client:
            task = asyncio.create_task(client.post(endpoint, headers={'authorization': 'Bearer offline-fixture'}, json={}))
            try:
                while not started.is_set():
                    await asyncio.sleep(.005)
                reply = await client.get('/fixture-health')
                assert reply.status_code == 200
                assert not task.done(), 'A blocked provider boundary occupied the app event loop'
                assert worker_threads[0] != threading.get_ident()
            finally:
                released.set()
                await task
    asyncio.run(scenario())
