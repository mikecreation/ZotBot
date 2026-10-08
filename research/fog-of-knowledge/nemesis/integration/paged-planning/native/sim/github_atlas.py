"""Serve a Nemesis project's atlas UI (index.html + assets) from a pinned checkout."""
from __future__ import annotations

import json
import re

import mimetypes
import os
import shutil
import time
import urllib.parse
from pathlib import Path

from .github_sandbox import materialize
from .github_workspace import GitHubError, PathRejected, check_owner, check_repo, check_ref, redact, safe_path

ATLAS_MARKER = '.nemesis_atlas_ready'


def _project_key(path: str) -> str:
    """URL-safe single segment; '/' becomes '__' (no percent-encoding — servers decode %2F)."""
    raw = (path or '').strip('/')
    if '..' in raw.split('/'):
        raise PathRejected('Invalid project path')
    return raw.replace('/', '__')


def atlas_cache_dir(ws, owner, repo, sha, path) -> Path:
    return ws.cache_dir / 'atlas' / owner / repo / sha / _project_key(path)


def _inject_atlas_shell_bounce(index_path: Path, owner: str, repo: str, path: str) -> None:
    """If the atlas is opened as a top-level tab (refresh inside the iframe), bounce
    back into the Nemesis GitHub atlas shell with the deep link hash intact."""
    try:
        html = index_path.read_text(encoding='utf-8', errors='replace')
    except OSError:
        return
    if 'nemesis-atlas-shell-bounce' in html:
        return
    # Keep path as a JS string literal
    path_js = json.dumps(path)
    owner_js = json.dumps(owner)
    repo_js = json.dumps(repo)
    snippet = (
        '<script id="nemesis-atlas-shell-bounce">(function(){if(window.top!==window)return;'
        'var o=' + owner_js + ',r=' + repo_js + ',p=' + path_js + ';'
        'location.replace("/#github/atlas/"+encodeURIComponent(o)+"/"+encodeURIComponent(r)+"?path="+encodeURIComponent(p));'
        '})();</script>'
    )
    if re.search(r'<head[^>]*>', html, flags=re.I):
        html = re.sub(r'(<head[^>]*>)', r'\1' + snippet, html, count=1, flags=re.I)
    else:
        html = snippet + html
    index_path.write_text(html, encoding='utf-8')


def prepare_atlas(ws, owner, repo, path):
    """Materialize the project at a pinned SHA and return a same-origin atlas URL."""
    owner = check_owner(owner)
    repo = check_repo(repo)
    path = safe_path(path, allow_empty=False)
    row = ws.project_row(owner, repo, path)
    sha = check_ref(ws.resolve(owner, repo, ''))
    dest = atlas_cache_dir(ws, owner, repo, sha, path)
    marker = dest / ATLAS_MARKER
    if not marker.exists() or marker.read_text(encoding='utf-8', errors='replace').strip() != sha:
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        dest.mkdir(parents=True, exist_ok=True)
        stats = materialize(ws, owner, repo, sha, path, dest)
        if not (dest / 'index.html').is_file():
            raise GitHubError(404, 'This project has no atlas UI (missing index.html).')
        _inject_atlas_shell_bounce(dest / 'index.html', owner, repo, path)
        marker.write_text(sha, encoding='utf-8')
        ws.log(
            'atlas',
            'Prepared atlas UI at %s (%d files)' % (sha[:7], stats.get('files') or 0),
            project_key=row.get('key') or '',
            repo=owner + '/' + repo,
        )
    else:
        _inject_atlas_shell_bounce(dest / 'index.html', owner, repo, path)
        stats = {'files': None, 'bytes': None, 'downloaded': 0}
    url = '/github-atlas/%s/%s/%s/%s/' % (
        urllib.parse.quote(owner, safe=''),
        urllib.parse.quote(repo, safe=''),
        urllib.parse.quote(sha, safe=''),
        urllib.parse.quote(_project_key(path), safe=''),
    )
    return {
        'ok': True,
        'owner': owner,
        'repo': repo,
        'path': path,
        'sha': sha,
        'name': row.get('name') or row.get('project_id') or path,
        'url': url,
        'files': stats,
        'prepared_at': time.time(),
    }


def resolve_atlas_file(ws, owner, repo, sha, project_key, rest):
    owner = check_owner(owner)
    repo = check_repo(repo)
    sha = check_ref(sha)
    # project_key uses '__' for '/'
    try:
        path = safe_path(str(project_key or '').replace('__', '/'), allow_empty=False)
    except PathRejected as exc:
        raise GitHubError(400, str(exc))
    dest = atlas_cache_dir(ws, owner, repo, sha, path)
    marker = dest / ATLAS_MARKER
    if not marker.is_file():
        raise GitHubError(404, 'Atlas not prepared yet. Open the atlas from the GitHub tab first.')
    rel = (rest or '').strip('/')
    if not rel:
        rel = 'index.html'
    # Reject traversal; keep relative to dest
    parts = [p for p in rel.replace('\\', '/').split('/') if p and p != '.']
    if any(p == '..' for p in parts):
        raise GitHubError(400, 'Invalid atlas path')
    base = os.path.normcase(os.path.abspath(str(dest)))
    target = Path(os.path.abspath(os.path.join(str(dest), *parts)))
    if os.path.commonpath([base, os.path.normcase(str(target))]) != base:
        raise GitHubError(400, 'Invalid atlas path')
    if not target.is_file():
        raise GitHubError(404, 'Atlas file not found')
    # Never serve the marker as content accidentally under weird names — fine
    mime, _ = mimetypes.guess_type(str(target))
    if target.suffix.lower() == '.tsv':
        mime = 'text/tab-separated-values; charset=utf-8'
    elif target.suffix.lower() == '.json':
        mime = 'application/json; charset=utf-8'
    elif target.suffix.lower() in ('.html', '.htm'):
        mime = 'text/html; charset=utf-8'
    elif target.suffix.lower() == '.js':
        mime = 'text/javascript; charset=utf-8'
    elif target.suffix.lower() == '.css':
        mime = 'text/css; charset=utf-8'
    return target, mime or 'application/octet-stream'
