"""Run a project's manifest-declared commands under NEMESIS policy.

Repository text never chooses what runs. A command runs only when ALL hold:
  1. its name is one NEMESIS knows (context / check_batch / apply_batch / validate);
  2. the parsed `.nemesis.json` declares it in the strict shape
     `python scripts/<name>.py [known flags]` (no shell, pipes, other interpreters);
  3. the project's permission mode allows it.
It then runs in a fresh temporary directory holding only the project's files at a
pinned commit (each blob verified against its git SHA-1), with the app's own
Python in isolated mode, a stripped environment (no tokens), a timeout and capped
diagnostics. Machine output is complete. This is process isolation, not a VM: the guarantee is the allowlist plus
pinned, verified code from the repository the user chose.
"""
from __future__ import annotations

import os, posixpath, shlex, shutil, subprocess, sys, tempfile, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .github_workspace import (MODE_RANK, RAW, GitHubError, PathRejected, git_blob_sha, redact, safe_path, within)

KNOWN = ('context', 'check_batch', 'apply_batch', 'validate', 'worker_contract', 'capture_sources', 'evidence_packet', 'review_evidence','graph_retrieval')
MIN_MODE = {'context': 'READ_ONLY', 'validate': 'READ_ONLY', 'check_batch': 'READ_ONLY', 'apply_batch': 'READ_PROPOSE', 'worker_contract': 'READ_ONLY', 'capture_sources':'READ_PROPOSE','evidence_packet':'READ_PROPOSE','review_evidence':'READ_PROPOSE','graph_retrieval':'READ_ONLY'}
ALLOWED_FLAGS = {'--compact', '--check', '--apply', '--prompt', '<batch_dir>', '--capture', '--packet', '--review'}
EXTRA_FLAGS = {'context': {'--compact'}, 'worker_contract': {'--prompt'}}
MAX_FILES = 3000
MAX_TOTAL = 80 * 1024 * 1024
MAX_FILE = 25 * 1024 * 1024
OUTPUT_CAP = 400 * 1024
TIMEOUT = 120
_NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


class CommandRejected(ValueError):
    pass


def parse_command(text):
    try:
        tokens = shlex.split(str(text or ''), posix=True)
    except ValueError as exc:
        raise CommandRejected('Command could not be parsed: %s' % exc)
    if len(tokens) < 2 or tokens[0] not in ('python', 'python3'):
        raise CommandRejected('Only `python scripts/<name>.py` commands are supported')
    script = tokens[1]
    try:
        script = safe_path(script, allow_empty=False)
    except PathRejected as exc:
        raise CommandRejected(str(exc))
    if not (script.startswith('scripts/') and script.endswith('.py') and script.count('/') == 1):
        raise CommandRejected('Script must be scripts/<name>.py inside the project')
    for t in tokens[2:]:
        if t not in ALLOWED_FLAGS:
            raise CommandRejected('Flag %r is not on the NEMESIS allowlist' % t[:40])
    return script, tokens[2:]


def command_plan(contract, name, mode):
    text = (contract.get('commands') or {}).get(name)
    if name not in KNOWN:
        return {'allowed': False, 'reason': 'Not a command NEMESIS runs'}
    if not text:
        return {'allowed': False, 'reason': 'Not declared in .nemesis.json'}
    try:
        script, args = parse_command(text)
    except CommandRejected as exc:
        return {'allowed': False, 'reason': str(exc)}
    if MODE_RANK.get(mode, 0) < MODE_RANK[MIN_MODE[name]]:
        return {'allowed': False, 'reason': 'Needs permission %s or higher' % MIN_MODE[name]}
    return {'allowed': True, 'reason': 'Allowlisted · sandboxed', 'script': script, 'args': args}


def _blob_path(ws, sha):
    return ws.cache_dir / 'blobs' / sha[:2] / sha


def materialize(ws, owner, repo, sha, project_path, dest):
    """Copy the project's files at commit `sha` into dest. Downloads only unseen blobs."""
    tree = ws.full_tree(owner, repo, sha)
    if tree.get('truncated'):
        raise GitHubError(0, 'Repository tree is too large for a pinned checkout')
    files = [e for e in tree['entries'] if e['type'] == 'blob' and within(project_path, e['path'])]
    if len(files) > MAX_FILES:
        raise GitHubError(0, 'Project has more than %d files' % MAX_FILES)
    total = sum(int(e.get('size') or 0) for e in files)
    if total > MAX_TOTAL or any(int(e.get('size') or 0) > MAX_FILE for e in files):
        raise GitHubError(0, 'Project files exceed the sandbox size cap')
    dest = Path(dest).resolve()
    fetched = 0

    def one(e):
        blob = _blob_path(ws, e['sha'])
        if not blob.exists():
            url_path = '/%s/%s/%s/%s' % (owner, repo, sha, urllib.parse.quote(e['path']))
            data, _ = ws.client.call('GET', url_path, base=RAW, raw=True, cache=False, max_bytes=MAX_FILE)
            if git_blob_sha(data) != e['sha']:
                raise GitHubError(0, 'Integrity check failed for %s' % e['path'])
            blob.parent.mkdir(parents=True, exist_ok=True)
            tmp = blob.with_suffix('.tmp%d' % os.getpid())
            tmp.write_bytes(data); os.replace(tmp, blob)
            got = 1
        else:
            got = 0
        rel = e['path'][len(project_path):].lstrip('/') if project_path else e['path']
        # Lexical containment (no resolve(): on Windows it can return \\?\ paths mid-write).
        base = os.path.normcase(os.path.abspath(str(dest)))
        target = Path(os.path.abspath(os.path.join(str(dest), *rel.split('/'))))
        if not rel or os.path.commonpath([base, os.path.normcase(str(target))]) != base or os.path.normcase(str(target)) == base:
            raise PathRejected('Unsafe path in repository tree: %s' % rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(blob, target)
        return got

    with ThreadPoolExecutor(max_workers=8) as pool:
        fetched = sum(pool.map(one, files))
    return {'files': len(files), 'bytes': total, 'downloaded': fetched}


def sandbox_env(tmp):
    env = {'PYTHONIOENCODING': 'utf-8', 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONUTF8': '1',
           'TEMP': str(tmp), 'TMP': str(tmp), 'TMPDIR': str(tmp), 'HOME': str(tmp)}
    for k in ('SYSTEMROOT', 'SystemRoot', 'WINDIR', 'PATH', 'LANG'):
        if k in os.environ:
            env[k] = os.environ[k]
    return env


def execute(workdir, script, args, timeout=TIMEOUT, runner=None):
    # -I ignores PYTHONUTF8/PYTHONIOENCODING from sandbox_env. Select UTF-8
    # explicitly so compiler JSON survives Windows pipe encoding unchanged.
    argv = [sys.executable, '-I', '-B', '-X', 'utf8', script] + list(args)
    started = time.time()
    runner = runner or subprocess.run
    try:
        proc = runner(argv, cwd=str(workdir), env=sandbox_env(Path(workdir).parent), capture_output=True,
                      timeout=timeout, stdin=subprocess.DEVNULL, creationflags=_NO_WINDOW)
        code, out, err = proc.returncode, proc.stdout or b'', proc.stderr or b''
        error = None
    except subprocess.TimeoutExpired as exc:
        code, out, err, error = -1, exc.stdout or b'', exc.stderr or b'', 'Timed out after %ds' % timeout
    def dec(b, errors='replace', limit=None):
        raw=b if isinstance(b,bytes) else str(b).encode('utf-8')
        decoded=(raw if limit is None else raw[:limit]).decode('utf-8',errors)
        return decoded if errors=='strict' and limit is None else redact(decoded)
    try:
        stdout = dec(out, 'strict')
    except UnicodeDecodeError:
        # stdout is a machine-readable compiler response. A lossy replacement
        # may remain in diagnostics, but must never be accepted as compiler data.
        code = -1
        error = error or 'Compiler stdout is not valid UTF-8; response was not accepted'
        stdout = dec(out)
    return {'exit_code': code, 'stdout': stdout, 'stderr': dec(err,limit=OUTPUT_CAP), 'duration': round(time.time() - started, 2),
            'error': error, 'display': 'python %s' % ' '.join([script] + list(args))}


def run_manifest_command(ws, row, name, sha, extra=None, batch_dir=None, prepare=None, keep=False, runner=None):
    contract = row['manifest']
    plan = command_plan(contract, name, row['mode'])
    if not plan['allowed']:
        return {'exit_code': None, 'error': 'Blocked by NEMESIS policy: ' + plan['reason'], 'display': name}
    args = []
    for a in plan['args']:
        if a == '<batch_dir>':
            if not batch_dir:
                return {'exit_code': None, 'error': 'This command needs a batch', 'display': name}
            args.append(batch_dir)
        else:
            args.append(a)
    for a in extra or []:
        if a in EXTRA_FLAGS.get(name, set()) and a not in args:
            args.append(a)
    tmp = Path(tempfile.mkdtemp(prefix='nemesis-gh-'))
    work = tmp / 'project'
    try:
        info = materialize(ws, row['owner'], row['repo'], sha, row['path'], work)
        if prepare:
            prepare(work)  # caller stages batch files into the checkout before running
        result = execute(work, plan['script'], args, runner=runner)
        result['files'] = info
        result['workdir'] = str(work) if keep else None
        return result
    except (GitHubError, PathRejected, OSError) as exc:
        return {'exit_code': None, 'error': redact(exc)[:400], 'display': name}
    finally:
        if not keep:
            shutil.rmtree(tmp, ignore_errors=True)
