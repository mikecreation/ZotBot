"""Fog/Nemesis batch drafts → sandboxed check/apply → branch + pull request.

Never pushes to the default branch. Requires project mode READ_BRANCH_PR (or higher)
for propose/PR, and READ_PROPOSE+ for apply inside the sandbox.
"""
from __future__ import annotations

import json
import hashlib
import functools
import threading
import os
import re
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from .github_sandbox import run_manifest_command
from .github_workspace import (
    MODE_RANK, GitHubError, PathRejected, check_owner, check_repo, check_ref,
    redact, safe_path,
)

BATCH_ID_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')
BRANCH_PREFIX = 'nemesis/'
MAX_BATCH_FILE = 8 * 1024 * 1024
MAX_BATCH_TOTAL = 32 * 1024 * 1024
REQUIRED_FILES = ('manifest.json', 'nodes.jsonl', 'edges.jsonl', 'reviews.jsonl')
EVIDENCE_FILES = ('sources.jsonl', 'assertions.jsonl', 'taxonomy.jsonl', 'identities.jsonl')
_PUBLICATION_LOCKS = {}
_PUBLICATION_LOCKS_GUARD = threading.Lock()


def _publication_lock(key):
    with _PUBLICATION_LOCKS_GUARD:
        return _PUBLICATION_LOCKS.setdefault(str(key), threading.RLock())


def _serialize_batch_publication(function):
    @functools.wraps(function)
    def wrapped(ws, owner, repo, path, batch_id, **kwargs):
        key = (str(ws.cache_dir.resolve()), owner, repo, path, batch_id)
        with _publication_lock(key):
            return function(ws, owner, repo, path, batch_id, **kwargs)
    return wrapped


def _batch_root(ws, owner, repo):
    return ws.cache_dir / 'batches' / owner / repo


def _batch_dir(ws, owner, repo, batch_id):
    return _batch_root(ws, owner, repo) / batch_id


def _validate_batch_id(batch_id):
    if not isinstance(batch_id, str) or not BATCH_ID_RE.match(batch_id):
        raise PathRejected('batch_id must be a short safe id (letters, digits, ._-)')
    if '..' in batch_id or '/' in batch_id or '\\' in batch_id:
        raise PathRejected('batch_id path rejected')
    return batch_id


def _encode_files(files: dict) -> dict:
    """Normalize incoming batch files to utf-8 text."""
    if not isinstance(files, dict) or not files:
        raise PathRejected('Batch needs files: manifest.json, nodes.jsonl, edges.jsonl, reviews.jsonl')
    out = {}
    total = 0
    for name in REQUIRED_FILES + EVIDENCE_FILES:
        if name not in files:
            if name in EVIDENCE_FILES:
                continue
            raise PathRejected('Missing batch file: ' + name)
        raw = files[name]
        if isinstance(raw, (dict, list)):
            text = json.dumps(raw, ensure_ascii=False, indent=2) + ('\n' if name.endswith('.json') else '')
            if name.endswith('.jsonl') and isinstance(raw, list):
                text = ''.join(json.dumps(x, ensure_ascii=False) + '\n' for x in raw)
        else:
            text = str(raw)
            if not text.endswith('\n'):
                text += '\n'
        data = text.encode('utf-8')
        if len(data) > MAX_BATCH_FILE:
            raise PathRejected('%s is too large' % name)
        total += len(data)
        out[name] = text
    if total > MAX_BATCH_TOTAL:
        raise PathRejected('Batch exceeds size cap')
    # light manifest parse
    try:
        manifest = json.loads(out['manifest.json'])
    except json.JSONDecodeError as exc:
        raise PathRejected('manifest.json is not valid JSON: %s' % exc)
    if manifest.get('protocol') != 'fog-nemesis-batch/1':
        raise PathRejected('manifest.protocol must be fog-nemesis-batch/1')
    mid = _validate_batch_id(str(manifest.get('batch_id') or ''))
    return out, mid, manifest


def save_batch(ws, owner, repo, path, files, *, source='user'):
    owner = check_owner(owner); repo = check_repo(repo)
    path = safe_path(path, allow_empty=False)
    row = ws.project_row(owner, repo, path)
    encoded, batch_id, manifest = _encode_files(files)
    dest = _batch_dir(ws, owner, repo, batch_id)
    dest.mkdir(parents=True, exist_ok=True)
    for name, text in encoded.items():
        (dest / name).write_text(text, encoding='utf-8')
    meta = {
        'batch_id': batch_id,
        'owner': owner,
        'repo': repo,
        'path': path,
        'project_key': row['key'],
        'source': source,
        'saved_at': time.time(),
        'mission': redact(manifest.get('mission') or '')[:400],
        'agent': redact(manifest.get('agent') or '')[:120],
        'status': 'DRAFT',
    }
    (dest / 'nemesis-draft.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    ws.log('batch_save', 'Saved batch draft %s' % batch_id, project_key=row['key'], repo=owner+'/'+repo)
    return {'ok': True, **meta, 'files': list(encoded)}


def list_batches(ws, owner, repo):
    owner = check_owner(owner); repo = check_repo(repo)
    root = _batch_root(ws, owner, repo)
    if not root.is_dir():
        return {'batches': []}
    rows = []
    for child in sorted(root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not child.is_dir():
            continue
        meta_path = child / 'nemesis-draft.json'
        meta = {}
        if meta_path.is_file():
            try:
                meta = json.loads(meta_path.read_text(encoding='utf-8'))
            except Exception:
                meta = {}
        rows.append({
            'batch_id': child.name,
            'status': meta.get('status') or 'DRAFT',
            'saved_at': meta.get('saved_at') or child.stat().st_mtime,
            'mission': meta.get('mission') or '',
            'agent': meta.get('agent') or '',
            'check': meta.get('check'),
            'propose': meta.get('propose'),
            'evidence': meta.get('evidence'),
            'path': meta.get('path') or '',
        })
    return {'batches': rows[:40]}


def _load_batch_files(ws, owner, repo, batch_id):
    batch_id = _validate_batch_id(batch_id)
    dest = _batch_dir(ws, owner, repo, batch_id)
    if not dest.is_dir():
        raise GitHubError(404, 'Unknown batch draft: ' + batch_id)
    files = {}
    for name in REQUIRED_FILES + EVIDENCE_FILES:
        p = dest / name
        if not p.is_file():
            if name in EVIDENCE_FILES:
                continue
            raise PathRejected('Batch draft missing ' + name)
        files[name] = p.read_text(encoding='utf-8')
    return dest, files


def _stage_into_project(work: Path, project_rel_batch: str, files: dict):
    """Write batch under project nemesis/batches/<id>/ inside materialized checkout."""
    target = work.joinpath(*project_rel_batch.split('/'))
    target.mkdir(parents=True, exist_ok=True)
    for name, text in files.items():
        (target / name).write_text(text, encoding='utf-8')


def _update_meta(dest: Path, **fields):
    meta_path = dest / 'nemesis-draft.json'
    meta = {}
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding='utf-8'))
        except Exception:
            meta = {}
    meta.update(fields)
    _publication_write(meta_path, meta)
    return meta


def check_batch(ws, owner, repo, path, batch_id):
    owner = check_owner(owner); repo = check_repo(repo)
    path = safe_path(path, allow_empty=False)
    row = ws.project_row(owner, repo, path)
    dest, files = _load_batch_files(ws, owner, repo, batch_id)
    sha = check_ref(ws.resolve(owner, repo, ''))
    rel_batch = 'nemesis/batches/' + batch_id

    def prepare(work):
        _stage_into_project(work, rel_batch, files)
        from .github_evidence import stage_evidence_artifacts
        stage_evidence_artifacts(ws,owner,repo,batch_id,work)

    ws.log('batch_check', 'Checking batch %s at %s' % (batch_id, sha[:7]), project_key=row['key'], repo=owner+'/'+repo)
    result = run_manifest_command(ws, row, 'check_batch', sha, batch_dir=rel_batch, prepare=prepare, keep=False)
    ok = result.get('exit_code') == 0 and not result.get('error')
    parsed = None
    out = (result.get('stdout') or '').strip()
    if out:
        try:
            parsed = json.loads(out.splitlines()[-1] if '\n' in out else out)
        except Exception:
            try:
                parsed = json.loads(out)
            except Exception:
                parsed = None
    summary = {
        'ok': ok,
        'exit_code': result.get('exit_code'),
        'error': result.get('error'),
        'stdout_excerpt': redact((result.get('stdout') or '')[:4000]),
        'stderr_excerpt': redact((result.get('stderr') or '')[:2000]),
        'result': parsed,
        'sha': sha,
        'checked_at': time.time(),
    }
    _update_meta(dest, status='CHECKED_OK' if ok else 'CHECK_FAILED', check=summary)
    ws.log('batch_check', ('OK' if ok else 'FAILED') + ' check ' + batch_id, project_key=row['key'], repo=owner+'/'+repo, status='OK' if ok else 'FAIL')
    return {'ok': ok, 'batch_id': batch_id, 'owner': owner, 'repo': repo, 'path': path, **summary}


def _changed_files(before: Path, after: Path, project_path: str):
    """Return list of {path, content_bytes} for files that differ (repo-relative)."""
    changes = []
    for root, dirs, files in os.walk(after):
        dirs[:] = [d for d in dirs if d not in ('.git', '__pycache__')]
        for name in files:
            if name == 'nemesis-draft.json':
                continue
            ap = Path(root) / name
            rel = ap.relative_to(after).as_posix()
            try:
                data = ap.read_bytes()
            except OSError as exc:
                raise PathRejected('Cannot read publication file: ' + rel) from exc
            bp = before / rel if before else None
            if bp and bp.is_file() and bp.read_bytes() == data:
                continue
            if len(data) > MAX_BATCH_FILE:
                raise PathRejected('Changed publication file exceeds the 8 MiB limit: ' + rel)
            repo_rel = (project_path.rstrip('/') + '/' + rel) if project_path else rel
            changes.append({'path': repo_rel, 'content': data})
    return changes


def _git_api(ws, method, api_path, body=None):
    value, headers = ws.client.call(method, api_path, body=body, cache=False)
    return value


def _publication_write(path, value):
    """Checkpoint local intent before another external publication operation."""
    if path is None:
        return
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def _draft_digest(files):
    return hashlib.sha256(json.dumps(files, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def _publication_branch(batch_id):
    # Different long IDs must not collapse onto the same disposable branch.
    suffix = hashlib.sha256(batch_id.encode()).hexdigest()[:12]
    return BRANCH_PREFIX + 'fog-' + batch_id[:64].rstrip('.') + '-' + suffix


def _recorded_publication(ws, owner, repo, receipt):
    """Recover an exact publication without modifying its reviewed branch."""
    commit = receipt.get('commit_sha')
    if not commit or not receipt.get('branch_created'):
        return None
    prefix = '/repos/%s/%s' % (owner, repo)
    branch = receipt['branch']
    if receipt.get('pr_number'):
        candidates = [_git_api(ws, 'GET', prefix + '/pulls/' + str(receipt['pr_number']))]
    else:
        query = urllib.parse.urlencode({'state': 'all', 'head': owner + ':' + branch, 'base': receipt['base'], 'per_page': 100})
        candidates = _git_api(ws, 'GET', prefix + '/pulls?' + query)
        if not isinstance(candidates, list):
            raise GitHubError(502, 'GitHub PR recovery returned an invalid response')
    for pr in candidates:
        if pr.get('head', {}).get('ref') != branch:
            continue
        head = pr.get('head', {})
        if head.get('sha') != commit or pr.get('base', {}).get('ref') != receipt['base']:
            raise PathRejected('Existing batch PR differs from the retained publication; it will not be overwritten')
        if pr.get('state') != 'open' and not pr.get('merged') and not pr.get('merged_at'):
            raise PathRejected('Retained batch PR was closed without merging')
        value = {key: receipt[key] for key in ('branch', 'commit_sha', 'base', 'files')}
        value.update(pr_number=pr['number'], pr_url=pr.get('html_url'),
                     publication_recovered=True,
                     already_merged=bool(pr.get('merged') or pr.get('merged_at')))
        return value
    return None


def _create_branch_commit_pr(ws, owner, repo, base_sha, branch, message, changes, pr_title, pr_body,
                             *, receipt_path=None, draft_sha256=None):
    key = str(Path(receipt_path).resolve()) if receipt_path else (owner, repo, branch)
    with _publication_lock(key):
        return _publish_checkpointed(ws, owner, repo, base_sha, branch, message, changes, pr_title, pr_body,
                                     receipt_path=receipt_path, draft_sha256=draft_sha256)


def _publish_checkpointed(ws, owner, repo, base_sha, branch, message, changes, pr_title, pr_body,
                             *, receipt_path=None, draft_sha256=None):
    if not changes:
        raise GitHubError(400, 'Apply produced no file changes to commit')
    # Captured PDF/HTTP responses are binary evidence; GitHub accepts exact base64 bytes.
    import base64
    prefix = '/repos/%s/%s' % (owner, repo)
    meta = ws.repo(owner, repo, remember=False)
    base_branch = meta.get('default_branch') or 'main'
    if branch == base_branch or branch.endswith('/' + base_branch):
        raise GitHubError(400, 'Refusing to push the default branch')
    changes_digest = hashlib.sha256(json.dumps(sorted(
        (ch['path'], hashlib.sha256(ch['content']).hexdigest()) for ch in changes), separators=(',', ':')).encode()).hexdigest()
    receipt = json.loads(Path(receipt_path).read_text(encoding='utf-8')) if receipt_path and Path(receipt_path).exists() else {}
    identity = {'owner': owner, 'repo': repo, 'base_sha': base_sha, 'branch': branch,
                'changes_sha256': changes_digest, 'draft_sha256': draft_sha256, 'base': base_branch}
    if receipt and any(receipt.get(key) != value for key, value in identity.items()):
        raise PathRejected('Publication content or base changed after checkpoint; create a new batch revision')
    receipt = {**identity, **receipt, 'files': [ch['path'] for ch in changes]}
    _publication_write(receipt_path, receipt)
    recovered = _recorded_publication(ws, owner, repo, receipt) if receipt_path else None
    if recovered:
        receipt.update(recovered)
        _publication_write(receipt_path, receipt)
        return recovered
    tree_items = []
    blobs = receipt.setdefault('blobs', {})
    for ch in changes:
        if ch['path'] not in blobs:
            blob = _git_api(ws, 'POST', prefix + '/git/blobs', {
                'content': base64.b64encode(ch['content']).decode('ascii'), 'encoding': 'base64'})
            blobs[ch['path']] = blob['sha']
            _publication_write(receipt_path, receipt)
        tree_items.append({
            'path': ch['path'],
            'mode': '100644',
            'type': 'blob',
            'sha': blobs[ch['path']],
        })
    if not receipt.get('tree_sha'):
        base_commit = _git_api(ws, 'GET', prefix + '/git/commits/' + base_sha)
        tree = _git_api(ws, 'POST', prefix + '/git/trees', {'base_tree': base_commit['tree']['sha'], 'tree': tree_items})
        receipt['tree_sha'] = tree['sha']; _publication_write(receipt_path, receipt)
    if not receipt.get('commit_sha'):
        commit = _git_api(ws, 'POST', prefix + '/git/commits', {
            'message': message, 'tree': receipt['tree_sha'], 'parents': [base_sha]})
        receipt['commit_sha'] = commit['sha']; _publication_write(receipt_path, receipt)
    ref = 'refs/heads/' + branch
    if not receipt.get('branch_created'):
        try:
            _git_api(ws, 'POST', prefix + '/git/refs', {'ref': ref, 'sha': receipt['commit_sha']})
        except GitHubError as exc:
            if exc.status != 422:
                raise
            existing = _git_api(ws, 'GET', prefix + '/git/ref/heads/' + urllib.parse.quote(branch, safe=''))
            if existing.get('object', {}).get('sha') != receipt['commit_sha']:
                raise PathRejected('Existing batch branch differs from retained commit; it will not be overwritten')
        receipt['branch_created'] = True; _publication_write(receipt_path, receipt)
    recovered = _recorded_publication(ws, owner, repo, receipt) if receipt_path else None
    if recovered:
        receipt.update(recovered); _publication_write(receipt_path, receipt)
        return recovered
    pr = _git_api(ws, 'POST', prefix + '/pulls', {
        'title': pr_title[:200],
        'head': branch,
        'base': base_branch,
        'body': pr_body[:8000],
        'draft': False,
    })
    summary = {
        'branch': branch,
        'commit_sha': receipt['commit_sha'],
        'pr_number': pr.get('number'),
        'pr_url': pr.get('html_url'),
        'base': base_branch,
        'files': [c['path'] for c in changes],
    }
    receipt.update(summary); _publication_write(receipt_path, receipt)
    return summary


@_serialize_batch_publication
def propose_batch(ws, owner, repo, path, batch_id, *, open_pr=True, merge=False, merger='brain'):
    """Check + apply in sandbox, open a nemesis/* branch PR, optionally Brain-merge into main.

    Never pushes main directly. merge=True is Brain acceptance (Automate).
    """
    import shutil
    import tempfile
    from pathlib import Path as P

    from .github_sandbox import command_plan, execute, materialize, run_manifest_command

    owner = check_owner(owner); repo = check_repo(repo)
    path = safe_path(path, allow_empty=False)
    row = ws.project_row(owner, repo, path)
    mode = row.get('mode') or 'READ_ONLY'
    if MODE_RANK.get(mode, 0) < MODE_RANK['READ_BRANCH_PR']:
        raise PathRejected('Propose/PR needs permission mode Read + branch + PR (or Owner autonomous)')
    dest, files = _load_batch_files(ws, owner, repo, batch_id)
    receipt_path = dest / 'nemesis-publication.json'
    receipt = json.loads(receipt_path.read_text(encoding='utf-8')) if receipt_path.exists() else {}
    draft_sha256 = _draft_digest(files)
    if receipt and receipt.get('draft_sha256') != draft_sha256:
        raise PathRejected('Batch changed after publication began; create a new batch revision')
    recovered = _recorded_publication(ws, owner, repo, receipt) if receipt else None
    if recovered:
        summary = {'ok': True, 'stage': 'merged' if recovered.get('already_merged') else 'pr',
                   'batch_id': batch_id, 'sha': receipt['base_sha'], **recovered, 'proposed_at': time.time()}
        receipt.update(recovered); _publication_write(receipt_path, receipt)
        _update_meta(dest, status='MERGED' if recovered.get('already_merged') else 'PR_OPEN', propose=summary)
        if merge and not recovered.get('already_merged'):
            merged = brain_merge_pr(ws, owner, repo, path, batch_id, merger=merger, expected_head=recovered['commit_sha'])
            return {**summary, **merged, 'stage': 'merged' if merged.get('merged') else 'merge_failed'}
        return summary
    sha = check_ref(receipt.get('base_sha') or ws.resolve(owner, repo, ''))
    rel_batch = 'nemesis/batches/' + batch_id

    check = check_batch(ws, owner, repo, path, batch_id)
    if not check.get('ok'):
        return {'ok': False, 'stage': 'check', 'batch_id': batch_id, 'check': check}

    def prepare(work):
        _stage_into_project(work, rel_batch, files)
        from .github_evidence import stage_evidence_artifacts
        stage_evidence_artifacts(ws,owner,repo,batch_id,work)

    result = run_manifest_command(ws, row, 'apply_batch', sha, batch_dir=rel_batch, prepare=prepare, keep=True)
    workdir = result.get('workdir')
    try:
        ok = result.get('exit_code') == 0 and not result.get('error')
        if not ok or not workdir:
            summary = {
                'ok': False,
                'stage': 'apply',
                'batch_id': batch_id,
                'exit_code': result.get('exit_code'),
                'error': result.get('error') or 'Apply did not leave a workdir',
                'stdout_excerpt': redact((result.get('stdout') or '')[:4000]),
                'stderr_excerpt': redact((result.get('stderr') or '')[:2000]),
            }
            _update_meta(dest, status='APPLY_FAILED', propose=summary)
            return summary

        plan = command_plan(row['manifest'], 'validate', mode)
        if not plan.get('allowed'):
            summary = {'ok': False, 'stage': 'validate', 'error': plan.get('reason') or 'validate blocked', 'batch_id': batch_id}
            _update_meta(dest, status='VALIDATE_FAILED', propose=summary)
            return summary
        val = execute(P(workdir), plan['script'], plan.get('args') or [])
        if val.get('exit_code') != 0:
            summary = {
                'ok': False,
                'stage': 'validate',
                'batch_id': batch_id,
                'exit_code': val.get('exit_code'),
                'error': val.get('error') or 'validate failed',
                'stdout_excerpt': redact((val.get('stdout') or '')[:2000]),
                'stderr_excerpt': redact((val.get('stderr') or '')[:2000]),
            }
            _update_meta(dest, status='VALIDATE_FAILED', propose=summary)
            return summary

        tmp = P(tempfile.mkdtemp(prefix='nemesis-diff-'))
        try:
            fresh = tmp / 'fresh'
            materialize(ws, owner, repo, sha, path, fresh)
            changes = _changed_files(fresh, P(workdir), path)
            for name, text_body in files.items():
                repo_rel = '%s/%s/%s' % (path, rel_batch, name)
                data = text_body.encode('utf-8')
                changes = [c for c in changes if c['path'] != repo_rel]
                changes.append({'path': repo_rel, 'content': data})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        branch = _publication_branch(batch_id)
        meta = ws.repo(owner, repo, remember=False)
        base_branch = meta.get('default_branch') or 'main'
        if branch == base_branch or branch.endswith('/' + base_branch):
            raise GitHubError(400, 'Refusing to write the default branch')

        if not open_pr:
            summary = {
                'ok': True,
                'stage': 'applied_local',
                'batch_id': batch_id,
                'sha': sha,
                'files': [c['path'] for c in changes],
            }
            _update_meta(dest, status='APPLIED_LOCAL', propose=summary)
            return summary

        title = 'Fog batch %s' % batch_id
        body = (
            'Nemesis proposed batch `%s` for `%s`.\n\n'
            '- Protocol: `fog-nemesis-batch/1`\n'
            '- Base commit: `%s`\n'
            '- Sandbox check + apply + validate: passed\n\n'
            'Does **not** push to `%s`.\n'
        ) % (batch_id, path, sha[:12], base_branch)

        pr = _create_branch_commit_pr(
            ws, owner, repo, sha, branch,
            message='nemesis: apply fog batch %s' % batch_id,
            changes=changes,
            pr_title=title,
            pr_body=body,
            receipt_path=receipt_path,
            draft_sha256=draft_sha256,
        )
        summary = {
            'ok': True,
            'stage': 'pr',
            'batch_id': batch_id,
            'sha': sha,
            **pr,
            'proposed_at': time.time(),
        }
        _update_meta(dest, status='PR_OPEN', propose=summary)
        ws.log('batch_pr', 'Opened PR for batch %s: %s' % (batch_id, pr.get('pr_url')), project_key=row['key'], repo=owner + '/' + repo)

        if merge:
            merged = brain_merge_pr(ws, owner, repo, path, batch_id, merger=merger)
            summary = {**summary, **merged, 'stage': 'merged' if merged.get('ok') else 'merge_failed'}
            return summary
        return summary
    finally:
        if workdir:
            parent = P(workdir).parent
            shutil.rmtree(workdir, ignore_errors=True)
            if parent.name.startswith('nemesis-gh-'):
                shutil.rmtree(parent, ignore_errors=True)



def brain_merge_pr(ws, owner, repo, path, batch_id, *, merger='brain', expected_head=None):
    """Brain accepts an open Fog PR and merges it into the default branch."""
    owner = check_owner(owner); repo = check_repo(repo)
    path = safe_path(path, allow_empty=False)
    row = ws.project_row(owner, repo, path)
    mode = row.get('mode') or 'READ_ONLY'
    if MODE_RANK.get(mode, 0) < MODE_RANK['READ_BRANCH_PR']:
        raise PathRejected('Brain merge needs permission mode Read + branch + PR (or Owner autonomous)')
    dest, _files = _load_batch_files(ws, owner, repo, batch_id)
    meta_path = dest / 'nemesis-draft.json'
    meta = json.loads(meta_path.read_text(encoding='utf-8')) if meta_path.exists() else {}
    propose = meta.get('propose') or {}
    if not propose.get('pr_number'):
        receipt_path = dest / 'nemesis-publication.json'
        receipt = json.loads(receipt_path.read_text(encoding='utf-8')) if receipt_path.exists() else {}
        if receipt:
            if receipt.get('draft_sha256') != _draft_digest(_files):
                raise PathRejected('Draft differs from its retained publication before merge')
            propose = _recorded_publication(ws, owner, repo, receipt) or {}
    pr_number = propose.get('pr_number')
    if not pr_number:
        raise PathRejected('No open PR recorded for batch ' + batch_id)
    client = ws.client
    merge_body = {
        'commit_title': 'nemesis(brain): merge fog batch %s' % batch_id,
        'commit_message': (
            'Brain accepted Fog batch `%s` after sandboxed check + apply + validate.\n'
            'Merger: %s. Human review not required.'
        ) % (batch_id, merger),
        'merge_method': 'squash',
    }
    expected_head = expected_head or propose.get('commit_sha')
    if not expected_head:
        raise PathRejected('Retained publication commit is required before merging')
    expected_head = check_ref(expected_head)
    merge_body['sha'] = expected_head
    try:
        pr, _rh = client.call('GET', '/repos/%s/%s/pulls/%s' % (owner, repo, int(pr_number)), cache=False)
        if pr.get('head', {}).get('sha') != expected_head:
            raise PathRejected('PR head differs from the retained publication commit')
        if pr.get('merged'):
            value = {'merged': True, 'sha': pr.get('merge_commit_sha')}
        elif pr.get('state') != 'open':
            raise PathRejected('PR is closed without a verified merge')
        else:
            value, _rh = client.call(
                'PUT',
                '/repos/%s/%s/pulls/%s/merge' % (owner, repo, int(pr_number)),
                body=merge_body,
                cache=False,
            )
    except GitHubError as exc:
        summary = {
            'ok': False,
            'merge_ok': False,
            'error': redact(str(exc))[:500],
            'pr_number': pr_number,
            'pr_url': propose.get('pr_url'),
            'merger': merger,
        }
        _update_meta(dest, status='MERGE_FAILED', propose={**propose, 'merge': summary})
        return summary
    confirmed = isinstance(value, dict) and value.get('merged') is True
    summary = {
        'ok': confirmed,
        'merge_ok': confirmed,
        'merged': confirmed,
        'pr_number': pr_number,
        'pr_url': propose.get('pr_url'),
        'merge_sha': (value or {}).get('sha'),
        'merger': merger,
        'merged_at': time.time(),
    }
    if not confirmed:
        summary['error'] = redact(str((value or {}).get('message') or 'GitHub did not confirm the merge'))[:500]
        _update_meta(dest, status='MERGE_FAILED', propose={**propose, 'merge': summary})
        return summary
    # A sibling candidate must apply against the new main even when the previous
    # publication finished inside the workspace's twenty-second SHA cache TTL.
    forget = getattr(client, 'forget', None)
    if forget:
        forget('sha:%s/%s@' % (owner, repo))
    _update_meta(dest, status='MERGED', propose={**propose, 'merge': summary, 'stage': 'merged'})
    ws.log(
        'batch_merged',
        'Brain merged PR #%s for batch %s' % (pr_number, batch_id),
        project_key=row['key'],
        repo=owner + '/' + repo,
    )
    return summary


def brain_accept_batch(ws, owner, repo, path, batch_id):
    """Full Brain path: check → apply → PR → merge. Michael never needs to approve."""
    return propose_batch(ws, owner, repo, path, batch_id, open_pr=True, merge=True, merger='brain')


def ingest_worker_batch(ws, owner, repo, path, packet, *, source='worker'):
    """Accept a worker JSON object with manifest/nodes/edges/reviews and save as draft."""
    if not isinstance(packet, dict):
        raise PathRejected('Worker batch must be a JSON object')
    batch_id = packet.get('batch_id') or (packet.get('manifest') or {}).get('batch_id')
    if not batch_id:
        batch_id = 'fog-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    batch_id = _validate_batch_id(str(batch_id))
    manifest = packet.get('manifest')
    if not isinstance(manifest, dict):
        manifest = {
            'protocol': 'fog-nemesis-batch/1',
            'batch_id': batch_id,
            'created_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'agent': str(packet.get('agent') or source)[:80],
            'mission': str(packet.get('mission') or packet.get('notes') or 'Fog expansion batch')[:500],
            'scope': packet.get('scope') or {'domains': ['physical'], 'topics': ['fog-expansion'], 'date_range': None},
            'source_policy': 'primary-preferred',
            'notes': str(packet.get('notes') or '')[:1000],
        }
    else:
        manifest = dict(manifest)
        manifest.setdefault('protocol', 'fog-nemesis-batch/1')
        manifest.setdefault('created_at', datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
        manifest.setdefault('agent', str(packet.get('agent') or source)[:80])
        manifest.setdefault('mission', str(packet.get('mission') or packet.get('notes') or 'Fog expansion batch')[:500])
        manifest.setdefault('source_policy', 'primary-preferred')
        manifest.setdefault('scope', {'domains': ['physical'], 'topics': ['fog-expansion'], 'date_range': None})
        manifest['batch_id'] = batch_id
    files = {
        'manifest.json': manifest,
        'nodes.jsonl': packet.get('nodes') or [],
        'edges.jsonl': packet.get('edges') or [],
        'reviews.jsonl': packet.get('reviews') or [],
    }
    for name in EVIDENCE_FILES:
        key = name.removesuffix('.jsonl')
        if key in packet:
            files[name] = packet[key]
    return save_batch(ws, owner, repo, path, files, source=source)
