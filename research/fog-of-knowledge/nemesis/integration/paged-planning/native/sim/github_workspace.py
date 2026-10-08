"""GitHub as a first-class NEMESIS workspace.

Read side: connection status, repository listing, lazy tree, file reads, search,
history, CI, `.nemesis.json` discovery, project registry and the persistent
active project. The write side (branches, commits, PRs) is not built yet; when it
is, it must stay gated by the per-project permission mode defined here.

Security model
* Credentials stay in the server process. Primary provider is the GitHub CLI: gh
  keeps the token in the OS credential store and `gh auth token` is read into
  memory when needed. The token is only ever sent in an Authorization header
  that urllib does not forward across redirects. It is never logged, returned to
  the browser, written to the database, placed in a URL or put in a model prompt.
* Without a login every read uses GitHub's public, unauthenticated API.
* Repository content (README, code, manifests, scripts) is DATA. Only a parsed
  `.nemesis.json` can *propose* commands, and only application policy
  (github_sandbox.py) decides whether one runs.
"""
from __future__ import annotations

import base64, hashlib, json, os, posixpath, re, shutil, subprocess, threading, time
import urllib.error, urllib.parse, urllib.request
from pathlib import Path

try:  # module-level so FastAPI can resolve string annotations (from __future__ import annotations)
    from fastapi import HTTPException, Request
except Exception:  # pragma: no cover
    HTTPException = Request = None

API = 'https://api.github.com'
RAW = 'https://raw.githubusercontent.com'
MODES = ('READ_ONLY', 'READ_PROPOSE', 'READ_BRANCH_PR', 'OWNER_AUTONOMOUS')
MODE_RANK = {m: i for i, m in enumerate(MODES)}
MODE_LABEL = {'READ_ONLY': 'Read only', 'READ_PROPOSE': 'Read + propose',
              'READ_BRANCH_PR': 'Read + branch + PR', 'OWNER_AUTONOMOUS': 'Owner autonomous'}
DEFAULT_MODE = 'READ_BRANCH_PR'
SUPPORTED_PROTOCOLS = ('nemesis-repo/1',)
FILE_VIEW_CAP = 512 * 1024
MANIFEST_CAP = 256 * 1024

TOKEN_RE = re.compile(r'(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|(?i:bearer|token)\s+[A-Za-z0-9._\-]{16,}|x-access-token:[^@\s]+)')
OWNER_RE = re.compile(r'^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$')
REPO_RE = re.compile(r'^[A-Za-z0-9._-]{1,100}$')
REF_RE = re.compile(r'^[A-Za-z0-9._/\-]{1,200}$')
SHA_RE = re.compile(r'^[0-9a-f]{40}$')
PROJECT_ID_RE = re.compile(r'^[A-Za-z0-9._-]{1,80}$')


def redact(value):
    """Remove anything token-shaped. Applied to every log line and error we keep."""
    return TOKEN_RE.sub('[redacted]', str(value if value is not None else ''))


class GitHubError(Exception):
    def __init__(self, status, message, rate=None):
        super().__init__(redact(message))
        self.status = int(status or 0)
        self.rate = rate or {}


class PathRejected(ValueError):
    pass


def check_owner(owner):
    if not isinstance(owner, str) or not OWNER_RE.match(owner):
        raise PathRejected('Not a valid GitHub owner name')
    return owner


def check_repo(repo):
    if not isinstance(repo, str) or not REPO_RE.match(repo) or repo in ('.', '..') or repo.endswith('.git'):
        raise PathRejected('Not a valid GitHub repository name')
    return repo


def check_ref(ref):
    if ref in (None, ''):
        return ''
    if (not isinstance(ref, str) or not REF_RE.match(ref) or '..' in ref or '//' in ref
            or ref.startswith(('/', '-')) or ref.endswith(('/', '.lock', '.'))):
        raise PathRejected('Not a valid branch, tag or commit')
    return ref


def safe_path(path, allow_empty=True):
    """A repository-relative POSIX path with no traversal, absolute or odd segments."""
    if path is None:
        path = ''
    if not isinstance(path, str) or len(path) > 500:
        raise PathRejected('Path is too long or not text')
    if '\\' in path or any(ord(ch) < 32 or ord(ch) == 127 for ch in path):
        raise PathRejected('Path contains a backslash or control character')
    path = path.strip().strip('/')
    if not path:
        if allow_empty:
            return ''
        raise PathRejected('A file path is required')
    parts = path.split('/')
    for part in parts:
        if part in ('', '.', '..'):
            raise PathRejected('Path traversal is not allowed')
    if parts[0] == '.git':
        raise PathRejected('The .git directory is not readable')
    return '/'.join(parts)


def within(base, path):
    """True when repository path `path` is `base` itself or inside it."""
    return not base or path == base or path.startswith(base.rstrip('/') + '/')


def git_blob_sha(data):
    return hashlib.sha1(b'blob %d\x00' % len(data) + data).hexdigest()


def parse_github_url(text):
    """github.com links (and owner/repo shorthand) -> route parts. Never fetches."""
    raw = str(text or '').strip()
    if not raw or len(raw) > 600 or any(ch.isspace() for ch in raw):
        return None
    if re.match(r'^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$', raw):
        raw = 'https://github.com/' + raw
    if raw.startswith('github.com/') or raw.startswith('www.github.com/'):
        raw = 'https://' + raw
    try:
        u = urllib.parse.urlparse(raw)
    except ValueError:
        return None
    if u.scheme not in ('http', 'https') or (u.hostname or '').lower() not in ('github.com', 'www.github.com') or u.username or u.password:
        return None
    parts = [urllib.parse.unquote(p) for p in u.path.split('/') if p]
    if len(parts) < 2:
        return None
    owner, repo = parts[0], parts[1]
    if repo.endswith('.git'):
        repo = repo[:-4]
    try:
        check_owner(owner); check_repo(repo)
    except PathRejected:
        return None
    out = {'owner': owner, 'repo': repo, 'kind': 'repo', 'ref': '', 'path': ''}
    if len(parts) >= 4 and parts[2] in ('tree', 'blob'):
        try:
            out['ref'] = check_ref(parts[3])
            out['path'] = safe_path('/'.join(parts[4:]))
            out['kind'] = 'file' if parts[2] == 'blob' else 'dir'
        except PathRejected:
            pass
    elif len(parts) >= 4 and parts[2] == 'pull' and parts[3].isdigit():
        out['kind'] = 'pull'; out['number'] = int(parts[3])
    return out


# --------------------------------------------------------------------- transport
class _NoAuthRedirect(urllib.request.HTTPRedirectHandler):
    pass


_OPENER = urllib.request.build_opener(_NoAuthRedirect)


def urllib_transport(method, url, headers, body=None, timeout=20, max_bytes=None, authorization=None):
    """Real HTTP. Authorization is an *unredirected* header: never follows a redirect."""
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    if authorization:
        req.add_unredirected_header('Authorization', authorization)
    try:
        with _OPENER.open(req, timeout=timeout) as r:
            data = r.read(max_bytes + 1) if max_bytes else r.read()
            return r.status, {k.lower(): v for k, v in r.headers.items()}, data
    except urllib.error.HTTPError as e:
        try:
            data = e.read(200_000)
        except Exception:
            data = b''
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, data
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise GitHubError(0, 'GitHub could not be reached: ' + str(getattr(e, 'reason', e))[:200])


# -------------------------------------------------------------------------- auth
class PublicAuth:
    """Unauthenticated public reads (60 requests/hour per IP)."""
    name = 'public'

    def token(self):
        return None


class GitHubAppAuth:
    """Least-privilege upgrade path. NOT ACTIVE YET.

    To enable later: create a GitHub App with Contents (read/write), Pull requests
    (read/write), Actions (read), Checks (read) and Metadata (read); install it only
    on the chosen repositories; save `data/github_app.json` as
    {"app_id": 123, "installation_id": 456, "private_key_path": "data/github-app.pem"}.
    The provider will then mint 1-hour installation tokens server-side (JWT signed
    with the private key) and the rest of this module stays unchanged.
    """
    name = 'github-app'

    def __init__(self, root):
        self.path = Path(root) / 'data' / 'github_app.json'

    def configured(self):
        try:
            cfg = json.loads(self.path.read_text(encoding='utf-8'))
            return bool(cfg.get('app_id') and cfg.get('installation_id') and cfg.get('private_key_path'))
        except Exception:
            return False

    def token(self):
        return None  # not implemented: see class docstring


def find_gh():
    exe = shutil.which('gh')
    if exe:
        return exe
    for candidate in (r'C:\Program Files\GitHub CLI\gh.exe', r'C:\Program Files (x86)\GitHub CLI\gh.exe',
                      os.path.expandvars(r'%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe'), '/usr/bin/gh', '/usr/local/bin/gh'):
        if candidate and os.path.isfile(candidate):
            return candidate
    return None


_NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
CODE_RE = re.compile(r'one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})')
DEVICE_URL_RE = re.compile(r'(https://github\.com/login/device)\b')


class GhCliAuth:
    """GitHub CLI provider. gh stores the token in the OS credential store."""
    name = 'gh'

    NEGATIVE_TTL = 30  # seconds to remember "no login" so status polling never spams gh

    def __init__(self, exe=None, runner=None, popen=None, ttl=300):
        self._exe = exe
        self.runner = runner or subprocess.run
        self.popen = popen or subprocess.Popen
        self.ttl = ttl
        self._token = None
        self._token_at = 0.0
        self._none_at = 0.0
        self._lock = threading.Lock()
        self.login = {'state': 'idle'}
        self._proc = None

    def exe(self):
        if self._exe is None:
            self._exe = find_gh() or ''
        return self._exe or None

    def _env(self):
        env = dict(os.environ)
        env.update({'GH_NO_UPDATE_NOTIFIER': '1', 'NO_COLOR': '1', 'GH_PROMPT_DISABLED': '1'})
        for k in ('GH_TOKEN', 'GITHUB_TOKEN'):
            env.pop(k, None)  # the user's gh login is the single source of truth
        return env

    def token(self):
        with self._lock:
            if self._token and time.time() - self._token_at < self.ttl:
                return self._token
            if not self._token and self._none_at and time.time() - self._none_at < self.NEGATIVE_TTL:
                return None
            exe = self.exe()
            if not exe:
                self._none_at = time.time()
                return None
            try:
                out = self.runner([exe, 'auth', 'token', '--hostname', 'github.com'], capture_output=True,
                                  text=True, timeout=10, env=self._env(), creationflags=_NO_WINDOW)
            except Exception:
                self._none_at = time.time()
                return None
            value = (out.stdout or '').strip() if out.returncode == 0 else ''
            if not value or len(value) > 255 or any(ch.isspace() for ch in value):
                self._token, self._token_at, self._none_at = None, 0.0, time.time()
                return None
            self._token, self._token_at, self._none_at = value, time.time(), 0.0
            return value

    def invalidate(self):
        with self._lock:
            self._token, self._token_at, self._none_at = None, 0.0, 0.0

    def start_login(self):
        """Launch `gh auth login --web` and capture the one-time device code."""
        exe = self.exe()
        if not exe:
            raise GitHubError(0, 'GitHub CLI (gh) is not installed on this computer')
        if self._proc and self._proc.poll() is None:
            return dict(self.login)
        argv = [exe, 'auth', 'login', '--web', '--git-protocol', 'https', '--hostname', 'github.com']
        proc = self.popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          text=True, encoding='utf-8', errors='replace', env=self._env(), creationflags=_NO_WINDOW)
        self._proc = proc
        self.login = {'state': 'starting', 'started': time.time(), 'code': '', 'url': ''}
        threading.Thread(target=self._watch, args=(proc,), daemon=True).start()
        deadline = time.time() + 12
        while time.time() < deadline and self.login.get('state') == 'starting':
            time.sleep(0.1)
        return dict(self.login)

    def _watch(self, proc):
        tail = []
        try:
            try:
                proc.stdin.write('\n'); proc.stdin.flush()  # accept "press Enter" if gh asks
            except Exception:
                pass
            for line in proc.stdout:
                tail = (tail + [redact(line.rstrip())])[-12:]
                m = CODE_RE.search(line)
                if m:
                    self.login['code'] = m.group(1)
                u = DEVICE_URL_RE.search(line)
                if u:
                    self.login['url'] = u.group(1)
                if self.login.get('code') and self.login.get('state') == 'starting':
                    self.login['url'] = self.login.get('url') or 'https://github.com/login/device'
                    self.login['state'] = 'waiting'
                if time.time() - self.login.get('started', time.time()) > 900:
                    proc.kill(); break
            code = proc.wait(timeout=30)
        except Exception as exc:
            code = -1; tail.append(redact(exc))
        self.invalidate()
        if code == 0:
            self.login.update(state='connected', finished=time.time())
        else:
            self.login.update(state='failed', finished=time.time(), detail=' '.join(t for t in tail if t)[-400:])

    def cancel_login(self):
        if self._proc and self._proc.poll() is None:
            self._proc.kill()
        self.login = {'state': 'idle'}


# ------------------------------------------------------------------------ client
class GitHubClient:
    def __init__(self, store, token_source, transport=None, on_bad_token=None):
        self.s = store
        self.token_source = token_source
        self.transport = transport or urllib_transport
        self.on_bad_token = on_bad_token
        self.rate = {}
        self._mem = {}
        self._mem_lock = threading.Lock()

    # small in-process TTL cache for hot metadata
    def mem(self, key, ttl, fn):
        now = time.time()
        with self._mem_lock:
            hit = self._mem.get(key)
            if hit and now - hit[0] < ttl:
                return hit[1]
        value = fn()
        with self._mem_lock:
            if len(self._mem) > 2000:
                self._mem.clear()
            self._mem[key] = (now, value)
        return value

    def forget(self, prefix=''):
        with self._mem_lock:
            for k in [k for k in self._mem if k.startswith(prefix)]:
                self._mem.pop(k, None)

    def _note_rate(self, headers, authed):
        if 'x-ratelimit-limit' in headers:
            try:
                self.rate = {'limit': int(headers['x-ratelimit-limit']), 'remaining': int(headers.get('x-ratelimit-remaining', 0)),
                             'reset': int(headers.get('x-ratelimit-reset', 0)), 'resource': headers.get('x-ratelimit-resource', 'core'),
                             'authenticated': bool(authed), 'observed': time.time()}
            except (TypeError, ValueError):
                pass

    def call(self, method, path, params=None, body=None, accept='application/vnd.github+json',
             raw=False, max_bytes=None, cache=True, base=API, anonymous=False):
        """Returns (value, headers). Uses ETag revalidation for GETs."""
        url = base + path + ('?' + urllib.parse.urlencode(params) if params else '')
        token = None if anonymous else self.token_source()
        headers = {'Accept': accept, 'User-Agent': 'NEMESIS-local-workspace', 'X-GitHub-Api-Version': '2022-11-28'}
        data = json.dumps(body).encode('utf-8') if body is not None else None
        if data is not None:
            headers['Content-Type'] = 'application/json'
        key = 'gh:etag:%s:%s:%s' % ('a' if token else 'p', accept, url)
        cached = None
        if method == 'GET' and cache and not max_bytes:
            cached = self.s.cache_get(key, ttl=7 * 86400)
            if cached and cached.get('etag'):
                headers['If-None-Match'] = cached['etag']
        status, rh, payload = self.transport(method, url, headers, data, 25, max_bytes,
                                             ('Bearer ' + token) if token else None)
        if base == API:
            self._note_rate(rh, bool(token))
        if status == 401 and token:
            if self.on_bad_token:
                self.on_bad_token()
            return self.call(method, path, params, body, accept, raw, max_bytes, cache, base, anonymous=True)
        if status == 304 and cached:
            value = cached['body']
            if raw:
                value = base64.b64decode(value)
            return value, rh
        if status >= 400 or status == 0:
            message = ''
            try:
                message = json.loads(payload or b'{}').get('message', '')
            except Exception:
                message = (payload or b'')[:200].decode('utf-8', 'replace')
            if status in (403, 429) and str(rh.get('x-ratelimit-remaining', '1')) == '0':
                reset = int(rh.get('x-ratelimit-reset', 0) or 0)
                message = 'GitHub rate limit reached' + (' until ' + time.strftime('%I:%M %p', time.localtime(reset)).lstrip('0') + ' CT' if reset else '') + ('' if token else '. Connect GitHub for 5,000 requests per hour.')
            raise GitHubError(status, message or ('GitHub returned HTTP %d' % status), self.rate)
        if raw:
            value = payload
            if method == 'GET' and cache and not max_bytes and rh.get('etag') and len(payload) <= 1_000_000:
                self.s.cache_set(key, {'etag': rh['etag'], 'body': base64.b64encode(payload).decode('ascii')})
            return value, rh
        value = json.loads(payload or b'null') if payload else None
        if method == 'GET' and cache and rh.get('etag') and len(payload or b'') <= 2_000_000:
            self.s.cache_set(key, {'etag': rh['etag'], 'body': value})
        return value, rh

    def get(self, path, **kw):
        return self.call('GET', path, **kw)[0]


# --------------------------------------------------------------------- manifest
def _title(project_id):
    small = {'of', 'and', 'the', 'in', 'on', 'for', 'to', 'a'}
    words = re.split(r'[-_.\s]+', project_id)
    return ' '.join(w if (i and w in small) else w[:1].upper() + w[1:] for i, w in enumerate(words) if w)


def _scalar(v, limit=200):
    if isinstance(v, bool) or v is None or isinstance(v, (int, float)):
        return v
    return redact(str(v))[:limit]


def parse_manifest(text, manifest_path):
    """Parse a `.nemesis.json` into a bounded contract. Unknown keys are ignored."""
    errors = []
    try:
        m = json.loads(text)
    except (TypeError, ValueError) as exc:
        return {'valid': False, 'errors': ['Manifest is not valid JSON: ' + str(exc)[:120]]}
    if not isinstance(m, dict):
        return {'valid': False, 'errors': ['Manifest must be a JSON object']}
    base = posixpath.dirname(manifest_path)
    protocol = str(m.get('protocol') or '')[:60]
    pid = str(m.get('project_id') or '')
    if not PROJECT_ID_RE.match(pid):
        errors.append('project_id is missing or invalid')
        pid = (posixpath.basename(base) or 'project')[:80]
    if protocol not in SUPPORTED_PROTOCOLS:
        errors.append('Unsupported protocol %r; NEMESIS understands %s' % (protocol, ', '.join(SUPPORTED_PROTOCOLS)))

    def rel(p):
        try:
            return safe_path(str(p), allow_empty=False)
        except PathRejected:
            errors.append('Rejected unsafe path %r' % str(p)[:80])
            return None

    def path_map(obj):
        out = {}
        for k, v in list((obj or {}).items())[:24] if isinstance(obj, dict) else []:
            if isinstance(v, str) and ('/' in v or '.' in v) and not re.search(r'protocol|version', str(k), re.I):
                p = rel(v)
                if p:
                    out[str(k)[:60]] = p
            else:
                out[str(k)[:60]] = _scalar(v)
        return out

    commands = {}
    for k, v in list((m.get('commands') or {}).items())[:12] if isinstance(m.get('commands'), dict) else []:
        if isinstance(v, str):
            commands[str(k)[:40]] = v[:300]
    contract = {
        'valid': not any(e.startswith(('Manifest', 'Unsupported', 'project_id')) for e in errors),
        'errors': errors,
        'protocol': protocol,
        'project_id': pid,
        'name': str(m.get('name') or _title(pid))[:80],
        'version': str(m.get('project_version') or m.get('version') or '')[:40],
        'purpose': redact(str(m.get('purpose') or ''))[:600],
        'path': base,
        'manifest_path': manifest_path,
        'read_first': [p for p in (rel(x) for x in (m.get('read_first') or [])[:20] if isinstance(x, str)) if p],
        'canonical': path_map(m.get('canonical')),
        'exchange': path_map(m.get('exchange')),
        'commands': commands,
        'update_policy': {str(k)[:60]: _scalar(v) for k, v in list((m.get('update_policy') or {}).items())[:24]} if isinstance(m.get('update_policy'), dict) else {},
        'scale': {str(k)[:60]: _scalar(v, 300) for k, v in list((m.get('scale') or {}).items())[:12]} if isinstance(m.get('scale'), dict) else {},
        'priorities': [str(x)[:80] for x in (m.get('priorities') or [])[:16]] if isinstance(m.get('priorities'), list) else [],
    }
    return contract


# ---------------------------------------------------------------------- service
class GitHubWorkspace:
    def __init__(self, store, root, transport=None, gh=None):
        self.s = store
        self.root = Path(root)
        self.gh = gh or GhCliAuth()
        self.app_auth = GitHubAppAuth(self.root)
        self.client = GitHubClient(store, self.token, transport, on_bad_token=self.gh.invalidate)
        self.cache_dir = self.root / 'data' / 'github_cache'

    # ---- auth
    def token(self):
        if self.s.kv_get('github_auth_mode', 'auto') == 'public':
            return None
        return self.gh.token()

    def status(self):
        token = self.token()
        out = {'mode': 'public', 'login': None, 'scopes': [], 'gh_installed': bool(self.gh.exe()),
               'app_configured': self.app_auth.configured(), 'connect': dict(self.gh.login),
               'rate': dict(self.client.rate)}
        out['connect'].pop('detail', None) if out['connect'].get('state') != 'failed' else None
        if token:
            try:
                def who():
                    value, headers = self.client.call('GET', '/user', cache=False)
                    return {'login': value.get('login'), 'name': value.get('name'),
                            'scopes': [x.strip() for x in headers.get('x-oauth-scopes', '').split(',') if x.strip()]}
                me = self.client.mem('user', 120, who)
                out.update(mode='gh', login=me['login'], name=me.get('name'), scopes=me['scopes'])
            except GitHubError as exc:
                out['error'] = str(exc)
        out['rate'] = dict(self.client.rate)
        return out

    def connect(self):
        state = self.gh.start_login()
        self.log('connect', 'Started GitHub device login' + (' · code shown' if state.get('code') else ''), status='OK')
        return state

    # ---- activity
    def log(self, op, summary, *, project_key='', repo='', status='OK', detail=None, actor='user'):
        self.s.execute('INSERT INTO github_activity(ts,project_key,repo,op,status,summary,detail,actor) VALUES(?,?,?,?,?,?,?,?)',
                       (time.time(), project_key, repo, op[:40], status[:16], redact(summary)[:600],
                        redact(json.dumps(detail or {}, ensure_ascii=False))[:4000], actor[:40]))

    def activity(self, limit=40, project_key=None, before=None):
        limit = max(1, min(200, int(limit)))
        sql = 'SELECT id,ts,project_key,repo,op,status,summary,actor FROM github_activity WHERE 1=1'
        args = []
        if project_key:
            sql += ' AND project_key=?'; args.append(project_key)
        if before:
            sql += ' AND id<?'; args.append(int(before))
        return self.s.query(sql + ' ORDER BY id DESC LIMIT ?', tuple(args + [limit]))

    # ---- repositories
    @staticmethod
    def _summary(r):
        return {'full_name': r.get('full_name'), 'name': r.get('name'), 'owner': (r.get('owner') or {}).get('login'),
                'private': bool(r.get('private')), 'default_branch': r.get('default_branch'),
                'description': redact(r.get('description') or '')[:220], 'pushed_at': r.get('pushed_at'),
                'html_url': r.get('html_url'), 'stars': r.get('stargazers_count'), 'archived': bool(r.get('archived')),
                'permissions': {k: bool(v) for k, v in (r.get('permissions') or {}).items() if k in ('pull', 'push', 'admin')}}

    def _remember(self, full_name):
        recent = [x for x in self.s.kv_get('github_recent', []) if x != full_name]
        self.s.kv_set('github_recent', ([full_name] + recent)[:12])

    def _aware(self):
        rows = self.s.query("SELECT owner,repo,COUNT(*) n FROM github_projects WHERE status='DISCOVERED' GROUP BY owner,repo LIMIT 500")
        return {r['owner'] + '/' + r['repo']: r['n'] for r in rows}

    def repos(self, page=1, q=''):
        page = max(1, min(50, int(page or 1)))
        aware = self._aware()
        out = {'yours': [], 'recent': [], 'search': [], 'authenticated': bool(self.token()), 'page': page}
        if out['authenticated']:
            rows = self.client.get('/user/repos', params={'per_page': 30, 'page': page, 'sort': 'pushed',
                                                          'affiliation': 'owner,collaborator,organization_member'})
            out['yours'] = [self._summary(r) for r in rows or []]
            out['has_more'] = len(rows or []) == 30
        for full in self.s.kv_get('github_recent', [])[:12]:
            owner, _, repo = full.partition('/')
            try:
                out['recent'].append(self._summary(self.client.mem('repo:' + full, 300, lambda: self.client.get('/repos/%s/%s' % (owner, repo)))))
            except GitHubError:
                out['recent'].append({'full_name': full, 'name': repo, 'owner': owner, 'unavailable': True})
        if q:
            q = str(q)[:120]
            rows = self.client.get('/search/repositories', params={'q': q, 'per_page': 15})
            out['search'] = [self._summary(r) for r in (rows or {}).get('items', [])]
        for group in ('yours', 'recent', 'search'):
            for r in out[group]:
                r['nemesis_projects'] = aware.get(r.get('full_name') or '', 0)
        out['rate'] = dict(self.client.rate)
        return out

    def repo(self, owner, repo, remember=True):
        check_owner(owner); check_repo(repo)
        full = owner + '/' + repo
        meta = self.client.mem('repo:' + full, 60, lambda: self.client.get('/repos/%s/%s' % (owner, repo)))
        summary = self._summary(meta)
        summary['head_sha'] = self.resolve(owner, repo, summary['default_branch'])
        summary['nemesis_projects'] = self._aware().get(full, 0)
        if remember:
            self._remember(full)
        return summary

    def resolve(self, owner, repo, ref):
        ref = check_ref(ref)
        if SHA_RE.match(ref or ''):
            return ref
        if not ref:
            ref = self.client.mem('repo:%s/%s' % (owner, repo), 60, lambda: self.client.get('/repos/%s/%s' % (owner, repo)))['default_branch']
        def fetch():
            raw, _ = self.client.call('GET', '/repos/%s/%s/commits/%s' % (owner, repo, urllib.parse.quote(ref, safe='/')),
                                      accept='application/vnd.github.sha', raw=True)
            sha = raw.decode('ascii', 'replace').strip()
            if not SHA_RE.match(sha):
                raise GitHubError(502, 'GitHub returned an unexpected commit id')
            return sha
        return self.client.mem('sha:%s/%s@%s' % (owner, repo, ref), 20, fetch)

    def tree(self, owner, repo, ref='', path=''):
        check_owner(owner); check_repo(repo); path = safe_path(path); ref = check_ref(ref)
        sha = self.resolve(owner, repo, ref)
        value = self.client.get('/repos/%s/%s/contents/%s' % (owner, repo, urllib.parse.quote(path)), params={'ref': sha})
        if isinstance(value, dict):
            return {'sha': sha, 'path': path, 'is_file': True, 'entries': []}
        entries = [{'name': e.get('name'), 'path': e.get('path'), 'type': e.get('type'), 'size': e.get('size'), 'sha': e.get('sha')}
                   for e in (value or [])[:1000]]
        entries.sort(key=lambda e: (e['type'] != 'dir', (e['name'] or '').lower()))
        manifests = {p['path'] for p in self.s.query('SELECT path FROM github_projects WHERE owner=? AND repo=? AND status=\'DISCOVERED\'', (owner, repo))}
        for e in entries:
            if e['type'] == 'dir' and e['path'] in manifests:
                e['nemesis_project'] = True
        return {'sha': sha, 'path': path, 'entries': entries, 'truncated': len(value or []) > 1000,
                'html_url': 'https://github.com/%s/%s/tree/%s/%s' % (owner, repo, sha, path)}

    def read_bytes(self, owner, repo, sha, path, max_bytes=FILE_VIEW_CAP):
        data, _ = self.client.call('GET', '/repos/%s/%s/contents/%s' % (owner, repo, urllib.parse.quote(path)),
                                   params={'ref': sha}, accept='application/vnd.github.raw', raw=True, max_bytes=max_bytes)
        return data

    def file(self, owner, repo, ref='', path='', max_bytes=FILE_VIEW_CAP):
        check_owner(owner); check_repo(repo); path = safe_path(path, allow_empty=False); ref = check_ref(ref)
        max_bytes = max(1024, min(int(max_bytes or FILE_VIEW_CAP), 2 * 1024 * 1024))
        sha = self.resolve(owner, repo, ref)
        data = self.read_bytes(owner, repo, sha, path, max_bytes)
        truncated = len(data) > max_bytes
        data = data[:max_bytes]
        binary = b'\x00' in data[:8000]
        return {'path': path, 'sha': sha, 'bytes': len(data), 'truncated': truncated, 'binary': binary,
                'text': '' if binary else data.decode('utf-8', 'replace'),
                'language': posixpath.splitext(path)[1].lstrip('.').lower(),
                'html_url': 'https://github.com/%s/%s/blob/%s/%s' % (owner, repo, sha, urllib.parse.quote(path)),
                'untrusted': True}

    def full_tree(self, owner, repo, sha):
        key = 'gh:tree-integrity-v2:%s/%s:%s' % (owner, repo, sha)
        hit = self.s.cache_get(key, ttl=30 * 86400)
        if hit:
            return hit
        value = self.client.get('/repos/%s/%s/git/trees/%s' % (owner, repo, sha), params={'recursive': '1'}, cache=False)
        entries = [{'path': e['path'], 'type': e['type'], 'size': e.get('size'), 'sha': e['sha']}
                   for e in (value or {}).get('tree', [])[:200_000]]
        received=len((value or {}).get('tree', []))
        truncated=bool((value or {}).get('truncated')) or received>len(entries)
        out = {'entries': entries, 'truncated': truncated, 'received_entries':received, 'returned_entries':len(entries), 'complete':not truncated}
        self.s.cache_set(key, out)
        return out

    def search(self, owner, repo, q, ref=''):
        check_owner(owner); check_repo(repo)
        q = ' '.join(str(q or '').split())[:120]
        if len(q) < 2:
            raise PathRejected('Search needs at least 2 characters')
        sha = self.resolve(owner, repo, ref)
        low = q.lower()
        paths = [e['path'] for e in self.full_tree(owner, repo, sha)['entries'] if low in e['path'].lower()][:60]
        out = {'q': q, 'sha': sha, 'paths': paths, 'code': None}
        if self.token():
            try:
                rows = self.client.get('/search/code', params={'q': '%s repo:%s/%s' % (q, owner, repo), 'per_page': 30}, cache=False)
                out['code'] = [{'path': r.get('path'), 'html_url': r.get('html_url')} for r in (rows or {}).get('items', [])]
            except GitHubError as exc:
                out['code_note'] = str(exc)
        else:
            out['code_note'] = 'Connect GitHub to search inside files. File names are searched now.'
        return out

    def history(self, owner, repo, ref='', path=''):
        check_owner(owner); check_repo(repo); path = safe_path(path)
        sha = self.resolve(owner, repo, ref)
        params = {'sha': sha, 'per_page': 20}
        if path:
            params['path'] = path
        rows = self.client.get('/repos/%s/%s/commits' % (owner, repo), params=params)
        return [{'sha': r['sha'], 'message': redact((r.get('commit') or {}).get('message', '').split('\n')[0])[:200],
                 'author': ((r.get('author') or {}).get('login') or ((r.get('commit') or {}).get('author') or {}).get('name')),
                 'date': ((r.get('commit') or {}).get('author') or {}).get('date'), 'html_url': r.get('html_url')} for r in rows or []]

    def commit(self, owner, repo, sha):
        check_owner(owner); check_repo(repo); check_ref(sha)
        r = self.client.get('/repos/%s/%s/commits/%s' % (owner, repo, sha))
        return {'sha': r['sha'], 'message': redact((r.get('commit') or {}).get('message', ''))[:2000],
                'stats': r.get('stats'), 'html_url': r.get('html_url'),
                'files': [{'filename': f.get('filename'), 'status': f.get('status'), 'additions': f.get('additions'),
                           'deletions': f.get('deletions'), 'patch': (f.get('patch') or '')[:4000]} for f in (r.get('files') or [])[:100]]}

    # ---- CI
    def ci(self, owner, repo, ref=''):
        check_owner(owner); check_repo(repo)
        sha = self.resolve(owner, repo, ref)
        def fetch():
            out = {'sha': sha, 'checks': [], 'statuses': [], 'runs': [], 'errors': []}
            try:
                v = self.client.get('/repos/%s/%s/commits/%s/check-runs' % (owner, repo, sha), params={'per_page': 50})
                out['checks'] = [{'name': c.get('name'), 'status': c.get('status'), 'conclusion': c.get('conclusion'),
                                  'html_url': c.get('html_url'), 'completed_at': c.get('completed_at')} for c in (v or {}).get('check_runs', [])]
            except GitHubError as exc:
                out['errors'].append('checks: ' + str(exc))
            try:
                v = self.client.get('/repos/%s/%s/commits/%s/status' % (owner, repo, sha))
                out['statuses'] = [{'context': s.get('context'), 'state': s.get('state'), 'target_url': s.get('target_url')}
                                   for s in (v or {}).get('statuses', [])]
            except GitHubError as exc:
                out['errors'].append('status: ' + str(exc))
            try:
                v = self.client.get('/repos/%s/%s/actions/runs' % (owner, repo), params={'head_sha': sha, 'per_page': 20})
                out['runs'] = [{'name': r.get('name'), 'status': r.get('status'), 'conclusion': r.get('conclusion'),
                                'event': r.get('event'), 'html_url': r.get('html_url'), 'created_at': r.get('created_at')}
                               for r in (v or {}).get('workflow_runs', [])]
            except GitHubError as exc:
                out['errors'].append('runs: ' + str(exc))
            out['state'] = ci_state(out)
            return out
        return self.client.mem('ci:%s/%s@%s' % (owner, repo, sha), 30, fetch)

    # ---- discovery & registry
    def discover(self, owner, repo, ref='', log=True):
        check_owner(owner); check_repo(repo)
        sha = self.resolve(owner, repo, ref)
        key = 'gh:discover:%s/%s:%s' % (owner, repo, sha)
        hit = self.s.cache_get(key, ttl=30 * 86400)
        if hit is not None:
            return hit
        tree = self.full_tree(owner, repo, sha)
        manifests = [e for e in tree['entries'] if e['type'] == 'blob' and posixpath.basename(e['path']) == '.nemesis.json'][:50]
        projects = []
        now = time.time()
        for e in manifests:
            try:
                data = self.read_bytes(owner, repo, sha, e['path'], MANIFEST_CAP)
                if len(data) > MANIFEST_CAP:
                    raise ValueError('manifest larger than 256 KiB')
                contract = parse_manifest(data.decode('utf-8', 'replace'), e['path'])
            except (GitHubError, ValueError) as exc:
                contract = {'valid': False, 'errors': [str(exc)[:200]], 'path': posixpath.dirname(e['path']),
                            'manifest_path': e['path'], 'project_id': posixpath.basename(posixpath.dirname(e['path'])) or repo}
            contract['manifest_sha'] = e['sha']
            projects.append(contract)
            pkey = project_key(owner, repo, contract['path'])
            self.s.execute('''INSERT INTO github_projects(key,owner,repo,path,project_id,name,protocol,version,manifest_path,
                manifest_sha,commit_sha,manifest,status,discovered,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(key) DO UPDATE SET project_id=excluded.project_id,name=excluded.name,protocol=excluded.protocol,
                version=excluded.version,manifest_path=excluded.manifest_path,manifest_sha=excluded.manifest_sha,
                commit_sha=excluded.commit_sha,manifest=excluded.manifest,status=excluded.status,updated=excluded.updated''',
                (pkey, owner, repo, contract['path'], contract.get('project_id', ''), contract.get('name') or contract.get('project_id', ''),
                 contract.get('protocol', ''), contract.get('version', ''), e['path'], e['sha'], sha,
                 json.dumps(contract, ensure_ascii=False), 'DISCOVERED' if contract.get('valid') else 'INVALID', now, now))
        found = {project_key(owner, repo, p['path']) for p in projects}
        for row in self.s.query('SELECT key FROM github_projects WHERE owner=? AND repo=?', (owner, repo)):
            if row['key'] not in found:
                self.s.execute("UPDATE github_projects SET status='MISSING',updated=? WHERE key=?", (now, row['key']))
        result = {'sha': sha, 'truncated': tree['truncated'], 'files': len(tree['entries']),
                  'projects': [{k: p.get(k) for k in ('name', 'project_id', 'path', 'version', 'protocol', 'purpose', 'valid', 'errors', 'manifest_path')} for p in projects]}
        self.s.cache_set(key, result)
        if log:
            self.log('discover', 'Scanned %s/%s @ %s: %d file(s), %d NEMESIS manifest(s)%s' % (
                owner, repo, sha[:7], len(tree['entries']), len(projects),
                (' — ' + ', '.join(p['manifest_path'] for p in projects)) if projects else ''), repo=owner + '/' + repo)
        return result

    def project_row(self, owner, repo, path):
        check_owner(owner); check_repo(repo); path = safe_path(path)
        row = self.s.one('SELECT * FROM github_projects WHERE key=?', (project_key(owner, repo, path),))
        if not row:
            self.discover(owner, repo)
            row = self.s.one('SELECT * FROM github_projects WHERE key=?', (project_key(owner, repo, path),))
        if not row:
            raise KeyError('No .nemesis.json manifest at %s/%s/%s' % (owner, repo, path))
        row['manifest'] = json.loads(row['manifest'] or '{}')
        return row

    def project(self, owner, repo, path):
        row = self.project_row(owner, repo, path)
        meta = self.repo(owner, repo, remember=False)
        active = self.active() or {}
        ctx = self.s.cache_get('gh:context:' + row['key'], ttl=365 * 86400)
        from .github_sandbox import command_plan
        contract = row['manifest']
        commands = []
        for name, text in (contract.get('commands') or {}).items():
            plan = command_plan(contract, name, row['mode'])
            commands.append({'name': name, 'command': text, 'allowed': plan['allowed'], 'reason': plan['reason']})
        return {'key': row['key'], 'owner': owner, 'repo': repo, 'path': row['path'], 'name': row['name'],
                'project_id': row['project_id'], 'protocol': row['protocol'], 'version': row['version'],
                'status': row['status'], 'manifest_path': row['manifest_path'], 'manifest_sha': row['manifest_sha'],
                'commit_sha': row['commit_sha'], 'contract': contract, 'commands': commands,
                'mode': row['mode'], 'mode_label': MODE_LABEL.get(row['mode']), 'modes': [{'id': m, 'label': MODE_LABEL[m]} for m in MODES],
                'active': active.get('key') == row['key'], 'repo_meta': meta,
                'stale': bool(row['commit_sha'] and meta.get('head_sha') and meta['head_sha'] != row['commit_sha']),
                'context': ctx, 'activity': self.activity(25, row['key']),
                'html_url': 'https://github.com/%s/%s/tree/%s/%s' % (owner, repo, meta.get('default_branch'), row['path'])}

    def projects(self):
        rows = self.s.query("SELECT key,owner,repo,path,project_id,name,version,protocol,mode,status,commit_sha,updated FROM github_projects WHERE status='DISCOVERED' ORDER BY updated DESC LIMIT 100")
        active = (self.active() or {}).get('key')
        for r in rows:
            r['active'] = r['key'] == active
        return rows

    def set_mode(self, owner, repo, path, mode):
        if mode not in MODES:
            raise PathRejected('Unknown permission mode')
        row = self.project_row(owner, repo, path)
        self.s.execute('UPDATE github_projects SET mode=?,updated=? WHERE key=?', (mode, time.time(), row['key']))
        active = self.active()
        if active and active.get('key') == row['key']:
            active['mode'] = mode; self.s.kv_set('github_active_project', active)
        self.log('mode', 'Permission set to %s' % MODE_LABEL[mode], project_key=row['key'], repo=owner + '/' + repo)
        return {'mode': mode, 'label': MODE_LABEL[mode]}

    # ---- active project
    def use_project(self, owner, repo, path):
        self.discover(owner, repo, log=False)
        row = self.project_row(owner, repo, path)
        if row['status'] != 'DISCOVERED':
            raise PathRejected('This manifest is not a valid NEMESIS project: ' + '; '.join(row['manifest'].get('errors') or []))
        sha = self.resolve(owner, repo, '')
        meta = self.repo(owner, repo, remember=True)
        contract = row['manifest']
        read = []
        for rel in contract.get('read_first') or []:
            full = posixpath.join(row['path'], rel) if row['path'] else rel
            try:
                data = self.read_bytes(owner, repo, sha, full, 64 * 1024)
                read.append({'path': full, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()[:16]})
                self.log('read', 'Read %s (%s bytes)' % (full, format(len(data), ',')), project_key=row['key'], repo=owner + '/' + repo)
            except GitHubError as exc:
                read.append({'path': full, 'error': str(exc)[:160]})
                self.log('read', 'Could not read %s: %s' % (full, exc), project_key=row['key'], repo=owner + '/' + repo, status='FAILED')
        active = {'key': row['key'], 'owner': owner, 'repo': repo, 'path': row['path'], 'project_id': row['project_id'],
                  'name': row['name'], 'manifest_path': row['manifest_path'], 'manifest_sha': row['manifest_sha'],
                  'protocol': row['protocol'], 'version': row['version'], 'branch': meta['default_branch'],
                  'base_sha': sha, 'mode': row['mode'], 'read_first': read, 'set_at': time.time()}
        self.s.kv_set('github_active_project', active)
        self.log('use', 'Active project: %s (%s/%s/%s) at %s · %s' % (row['name'], owner, repo, row['path'], sha[:7], MODE_LABEL[row['mode']]),
                 project_key=row['key'], repo=owner + '/' + repo)
        return active

    def active(self):
        return self.s.kv_get('github_active_project', None)

    def clear_active(self):
        a = self.active()
        self.s.kv_set('github_active_project', None)
        if a:
            self.log('use', 'Stopped using %s' % a.get('name'), project_key=a.get('key', ''), repo=a.get('owner', '') + '/' + a.get('repo', ''))
        return {'ok': True}

    def run_context(self, owner, repo, path):
        from .github_sandbox import run_manifest_command
        row = self.project_row(owner, repo, path)
        sha = self.resolve(owner, repo, '')
        self.log('context', 'Running context command at %s' % sha[:7], project_key=row['key'], repo=owner + '/' + repo)
        result = run_manifest_command(self, row, 'context', sha, extra=['--compact'])
        parsed = None
        if result.get('exit_code') == 0:
            try:
                parsed = json.loads(result.get('stdout') or '')
            except ValueError:
                parsed = None
                result.update(exit_code=-1,error='Context command returned invalid JSON; no partial graph was accepted')
        summary = summarize_context(parsed) if isinstance(parsed, dict) else None
        record = {'sha': sha, 'ran_at': time.time(), 'exit_code': result.get('exit_code'), 'duration': result.get('duration'),
                  'command': result.get('display'), 'summary': summary, 'files': result.get('files'),
                  'stdout_excerpt': (result.get('stdout') or '')[:1500], 'stderr_excerpt': (result.get('stderr') or '')[-1500:],
                  'error': result.get('error')}
        if parsed is not None:
            self.s.cache_set('gh:context-full:' + row['key'], {'sha': sha, 'packet': parsed})
        self.s.cache_set('gh:context:' + row['key'], record)
        ok = result.get('exit_code') == 0
        self.log('context', ('Context finished in %.1fs (exit 0)%s' % (result.get('duration') or 0, (' · ' + summary['headline']) if summary and summary.get('headline') else ''))
                 if ok else 'Context failed: %s' % (result.get('error') or 'exit %s' % result.get('exit_code')),
                 project_key=row['key'], repo=owner + '/' + repo, status='OK' if ok else 'FAILED')
        return record




    def run_worker_contract(self, owner, repo, path):
        """Emit live Fog compiler contract for Expand/crew prompts (no stale enums)."""
        from .github_sandbox import run_manifest_command
        row = self.project_row(owner, repo, path)
        sha = self.resolve(owner, repo, '')
        self.log('worker_contract', 'Loading live worker contract at %s' % sha[:7], project_key=row['key'], repo=owner + '/' + repo)
        result = run_manifest_command(self, row, 'worker_contract', sha)
        prompt_result = run_manifest_command(self, row, 'worker_contract', sha, extra=['--prompt'])
        parsed = None
        if result.get('exit_code') == 0:
            try:
                parsed = json.loads(result.get('stdout') or '')
            except ValueError:
                parsed = None
        prompt_block = (prompt_result.get('stdout') or '').strip() if prompt_result.get('exit_code') == 0 else ''
        if not prompt_block and isinstance(parsed, dict):
            # Fallback formatter if --prompt run failed but JSON succeeded
            slim = {
                'atlas_domains': parsed.get('atlas_domains'),
                'atlas_eras': parsed.get('atlas_eras'),
                'allowed_kinds': parsed.get('allowed_kinds'),
                'allowed_statuses': parsed.get('allowed_statuses'),
                'allowed_relations': parsed.get('edge_kinds_distinct') or parsed.get('allowed_relations'),
                'worker_emits': parsed.get('worker_emits'),
                'worker_must_not': parsed.get('worker_must_not'),
                'compiler_decides': parsed.get('compiler_decides'),
                'prompt_rules': parsed.get('prompt_rules'),
            }
            prompt_block = 'FOG LIVE COMPILER CONTRACT (machine-generated; obey exactly)\n' + json.dumps(slim, ensure_ascii=False, indent=2)
        ok = result.get('exit_code') == 0 and bool(prompt_block)
        record = {
            'ok': ok,
            'sha': sha,
            'ran_at': time.time(),
            'exit_code': result.get('exit_code'),
            'duration': result.get('duration'),
            'command': result.get('display'),
            'prompt_block': prompt_block,
            'contract': parsed,
            'stdout_excerpt': (result.get('stdout') or '')[:1500],
            'stderr_excerpt': (result.get('stderr') or '')[-1500:],
            'error': result.get('error') or (None if ok else 'worker_contract failed'),
        }
        self.s.cache_set('gh:worker-contract:' + row['key'], {
            'sha': sha, 'prompt_block': prompt_block, 'contract': parsed, 'ran_at': record['ran_at']
        })
        self.log('worker_contract',
                 ('Live contract ready (%d chars)' % len(prompt_block)) if ok else 'Live contract failed: %s' % (record['error'] or 'exit %s' % result.get('exit_code')),
                 project_key=row['key'], repo=owner + '/' + repo, status='OK' if ok else 'FAILED')
        return record


    def save_batch(self, owner, repo, path, files, source='user'):
        from .github_batches import save_batch
        return save_batch(self, owner, repo, path, files, source=source)

    def list_batches(self, owner, repo):
        from .github_batches import list_batches
        return list_batches(self, owner, repo)

    def check_batch(self, owner, repo, path, batch_id):
        from .github_batches import check_batch
        return check_batch(self, owner, repo, path, batch_id)


    def ingest_worker_batch(self, owner, repo, path, packet, source='worker'):
        from .github_batches import ingest_worker_batch
        return ingest_worker_batch(self, owner, repo, path, packet, source=source)

    def brain_accept_batch(self, owner, repo, path, batch_id):
        from .github_batches import brain_accept_batch
        return brain_accept_batch(self, owner, repo, path, batch_id)

    def brain_merge_pr(self, owner, repo, path, batch_id):
        from .github_batches import brain_merge_pr
        return brain_merge_pr(self, owner, repo, path, batch_id)

    def propose_batch(self, owner, repo, path, batch_id, open_pr=True, merge=False):
        from .github_batches import propose_batch
        return propose_batch(self, owner, repo, path, batch_id, open_pr=open_pr, merge=merge, merger='brain')

    def prepare_atlas(self, owner, repo, path):
        from .github_atlas import prepare_atlas
        return prepare_atlas(self, owner, repo, path)


def project_key(owner, repo, path):
    return '%s/%s:%s' % (owner, repo, path or '')


def ci_state(ci):
    states = []
    for c in ci.get('checks', []) + ci.get('runs', []):
        if c.get('status') != 'completed':
            states.append('running')
        elif c.get('conclusion') in ('failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'):
            states.append('failing')
        elif c.get('conclusion') in ('success', 'neutral', 'skipped'):
            states.append('passing')
    for s in ci.get('statuses', []):
        states.append({'success': 'passing', 'pending': 'running'}.get(s.get('state'), 'failing'))
    for verdict in ('failing', 'running', 'passing'):
        if verdict in states:
            return verdict
    return 'none'


def summarize_context(packet):
    """Generic, bounded view of a project context packet (only scalar facts + a table)."""
    out = {'protocol': str(packet.get('protocol') or '')[:60], 'counts': {}, 'table': [], 'lists': {}, 'headline': ''}
    counts = packet.get('counts') if isinstance(packet.get('counts'), dict) else {}
    out['counts'] = {k: v for k, v in counts.items() if isinstance(v, (int, float))}
    for k, v in packet.items():
        if isinstance(v, list) and v and all(isinstance(x, dict) for x in v[:3]):
            if not out['table']:
                cols = [c for c, val in v[0].items() if isinstance(val, (int, float, str))][:7]
                out['table'] = {'name': k, 'columns': cols, 'rows': [[_scalar(r.get(c), 80) for c in cols] for r in v[:8]], 'total': len(v)}
            else:
                out['lists'][k] = {'total': len(v), 'first': [_scalar(x.get('label') or x.get('id') or x.get('name'), 80) for x in v[:5]]}
        elif isinstance(v, (str, int, float)) and k not in ('protocol', 'generated_at') and len(out['lists']) < 20:
            out.setdefault('facts', {})[k] = _scalar(v, 120)
    nxt = packet.get('recommended_next_domain')
    if out['counts']:
        bits = ['%s %s' % (format(v, ','), k) for k, v in list(out['counts'].items())[:4]]
        out['headline'] = ', '.join(bits) + ((' · next: ' + str(nxt)) if nxt else '')
    return out


def install_github_routes(app, store, root, transport=None, gh=None):
    """All /api/github routes are local-only and same-origin (private repo data)."""
    from fastapi import HTTPException, Request
    from fastapi.responses import FileResponse, JSONResponse
    from .github_atlas import resolve_atlas_file

    ws = GitHubWorkspace(store, root, transport=transport, gh=gh)
    app.state.github = ws

    def guard(request):
        host = request.client.host if request.client else ''
        if host not in ('127.0.0.1', '::1', 'testclient') or request.url.hostname not in ('127.0.0.1', 'localhost', '::1', 'testserver'):
            raise HTTPException(403, 'GitHub workspace is local only')
        origin = request.headers.get('origin')
        if origin and origin.rstrip('/') != str(request.base_url).rstrip('/'):
            raise HTTPException(403, 'Same-origin requests only')
        if request.headers.get('sec-fetch-site') == 'cross-site':
            raise HTTPException(403, 'Cross-site requests denied')

    def wrap(fn):
        try:
            return fn()
        except GitHubError as exc:
            code = 404 if exc.status == 404 else 429 if exc.status in (403, 429) and 'rate limit' in str(exc) else 502
            return JSONResponse({'error': str(exc), 'github_status': exc.status, 'rate': ws.client.rate}, status_code=code)
        except (PathRejected, ValueError) as exc:
            return JSONResponse({'error': redact(exc)[:400]}, status_code=400)
        except KeyError as exc:
            return JSONResponse({'error': redact(exc.args[0] if exc.args else 'Not found')[:400]}, status_code=404)
        except Exception as exc:  # crash instrumentation: redacted traceback to data/github_errors.log
            import traceback
            try:
                log = Path(root) / 'data' / 'github_errors.log'
                log.parent.mkdir(parents=True, exist_ok=True)
                with open(log, 'a', encoding='utf-8') as fh:
                    fh.write(time.strftime('[%Y-%m-%d %H:%M:%S] ') + redact(traceback.format_exc())[:8000] + '\n')
            except Exception:
                pass
            return JSONResponse({'error': 'GitHub workspace error: ' + redact(exc)[:300]}, status_code=500)

    async def body(request, limit=64_000):
        raw = await request.body()
        if len(raw) > limit:
            raise HTTPException(413, 'Request too large')
        try:
            value = json.loads(raw or b'{}')
        except ValueError:
            raise HTTPException(400, 'Invalid JSON')
        if not isinstance(value, dict):
            raise HTTPException(400, 'Expected a JSON object')
        return value

    @app.get('/api/github/status')
    def gh_status(request: Request):
        guard(request); return wrap(ws.status)

    @app.post('/api/github/connect')
    def gh_connect(request: Request):
        guard(request); return wrap(ws.connect)

    @app.get('/api/github/connect')
    def gh_connect_state(request: Request):
        guard(request)
        state = dict(ws.gh.login)
        if state.get('state') == 'connected':
            ws.client.forget('user')
        return state

    @app.post('/api/github/connect/cancel')
    def gh_connect_cancel(request: Request):
        guard(request); ws.gh.cancel_login(); return {'ok': True}

    @app.get('/api/github/repos')
    def gh_repos(request: Request, page: int = 1, q: str = ''):
        guard(request); return wrap(lambda: ws.repos(page, q))

    @app.get('/api/github/open')
    def gh_open(request: Request, url: str = ''):
        guard(request)
        parsed = parse_github_url(url)
        if not parsed:
            return JSONResponse({'error': 'That is not a GitHub repository link'}, status_code=400)
        return parsed

    @app.get('/api/github/projects')
    def gh_projects(request: Request):
        guard(request); return {'projects': ws.projects(), 'active': ws.active()}

    @app.get('/api/github/active')
    def gh_active(request: Request):
        guard(request); return {'active': ws.active()}

    @app.post('/api/github/active/clear')
    def gh_active_clear(request: Request):
        guard(request); return ws.clear_active()

    @app.get('/api/github/activity')
    def gh_activity(request: Request, limit: int = 40, project: str = '', before: int = 0):
        guard(request); return {'activity': ws.activity(limit, project or None, before or None)}

    @app.get('/api/github/repo/{owner}/{repo}')
    def gh_repo(owner: str, repo: str, request: Request):
        guard(request); return wrap(lambda: ws.repo(owner, repo))

    @app.get('/api/github/repo/{owner}/{repo}/tree')
    def gh_tree(owner: str, repo: str, request: Request, ref: str = '', path: str = ''):
        guard(request); return wrap(lambda: ws.tree(owner, repo, ref, path))

    @app.get('/api/github/repo/{owner}/{repo}/file')
    def gh_file(owner: str, repo: str, request: Request, path: str, ref: str = '', max_bytes: int = FILE_VIEW_CAP):
        guard(request); return wrap(lambda: ws.file(owner, repo, ref, path, max_bytes))

    @app.get('/api/github/repo/{owner}/{repo}/search')
    def gh_search(owner: str, repo: str, request: Request, q: str = '', ref: str = ''):
        guard(request); return wrap(lambda: ws.search(owner, repo, q, ref))

    @app.get('/api/github/repo/{owner}/{repo}/history')
    def gh_history(owner: str, repo: str, request: Request, ref: str = '', path: str = ''):
        guard(request); return wrap(lambda: {'commits': ws.history(owner, repo, ref, path)})

    @app.get('/api/github/repo/{owner}/{repo}/commit/{sha}')
    def gh_commit(owner: str, repo: str, sha: str, request: Request):
        guard(request); return wrap(lambda: ws.commit(owner, repo, sha))

    @app.get('/api/github/repo/{owner}/{repo}/ci')
    def gh_ci(owner: str, repo: str, request: Request, ref: str = ''):
        guard(request); return wrap(lambda: ws.ci(owner, repo, ref))

    @app.get('/api/github/repo/{owner}/{repo}/projects')
    def gh_discover(owner: str, repo: str, request: Request, ref: str = ''):
        guard(request); return wrap(lambda: ws.discover(owner, repo, ref))

    @app.get('/api/github/project/{owner}/{repo}')
    def gh_project(owner: str, repo: str, request: Request, path: str = ''):
        guard(request); return wrap(lambda: ws.project(owner, repo, path))

    @app.post('/api/github/project/{owner}/{repo}/use')
    async def gh_use(owner: str, repo: str, request: Request):
        guard(request); b = await body(request)
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(wrap, lambda: ws.use_project(owner, repo, str(b.get('path') or '')))

    @app.post('/api/github/project/{owner}/{repo}/mode')
    async def gh_mode(owner: str, repo: str, request: Request):
        guard(request); b = await body(request)
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(wrap, lambda: ws.set_mode(owner, repo, str(b.get('path') or ''), str(b.get('mode') or '')))

    @app.post('/api/github/project/{owner}/{repo}/context')
    async def gh_context(owner: str, repo: str, request: Request):
        guard(request); b = await body(request)
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(wrap, lambda: ws.run_context(owner, repo, str(b.get('path') or '')))

    @app.post('/api/github/project/{owner}/{repo}/atlas')
    async def gh_atlas_prepare(owner: str, repo: str, request: Request):
        guard(request); b = await body(request)
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(wrap, lambda: ws.prepare_atlas(owner, repo, str(b.get('path') or '')))

    @app.get('/api/github/project/{owner}/{repo}/atlas')
    def gh_atlas_prepare_get(owner: str, repo: str, request: Request, path: str = ''):
        guard(request); return wrap(lambda: ws.prepare_atlas(owner, repo, path))

    @app.get('/github-atlas/{owner}/{repo}/{sha}/{project_key}/{rest:path}')
    def gh_atlas_file(owner: str, repo: str, sha: str, project_key: str, rest: str, request: Request):
        guard(request)
        try:
            target, mime = resolve_atlas_file(ws, owner, repo, sha, project_key, rest)
        except GitHubError as exc:
            code = 404 if exc.status in (0, 404) else 400
            return JSONResponse({'error': str(exc)}, status_code=code)
        except PathRejected as exc:
            return JSONResponse({'error': str(exc)}, status_code=400)
        return FileResponse(str(target), media_type=mime)

    @app.get('/github-atlas/{owner}/{repo}/{sha}/{project_key}/')
    def gh_atlas_index(owner: str, repo: str, sha: str, project_key: str, request: Request):
        return gh_atlas_file(owner, repo, sha, project_key, '', request)

    @app.get('/github-atlas/{owner}/{repo}/{sha}/{project_key}')
    def gh_atlas_index_noslash(owner: str, repo: str, sha: str, project_key: str, request: Request):
        return gh_atlas_file(owner, repo, sha, project_key, '', request)


    @app.post('/api/github/project/{owner}/{repo}/batch')
    async def gh_batch_save(owner: str, repo: str, request: Request):
        guard(request); b = await body(request, 2_000_000)
        from starlette.concurrency import run_in_threadpool
        path = str(b.get('path') or '')
        if b.get('packet') is not None:
            return await run_in_threadpool(wrap, lambda: ws.ingest_worker_batch(owner, repo, path, b.get('packet'), str(b.get('source') or 'worker')))
        return await run_in_threadpool(wrap, lambda: ws.save_batch(owner, repo, path, b.get('files') or {}, str(b.get('source') or 'user')))

    @app.get('/api/github/project/{owner}/{repo}/batches')
    def gh_batch_list(owner: str, repo: str, request: Request):
        guard(request); return wrap(lambda: ws.list_batches(owner, repo))

    @app.post('/api/github/project/{owner}/{repo}/batch/{batch_id}/check')
    async def gh_batch_check(owner: str, repo: str, batch_id: str, request: Request):
        guard(request); b = await body(request)
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(wrap, lambda: ws.check_batch(owner, repo, str(b.get('path') or ''), batch_id))

    @app.post('/api/github/project/{owner}/{repo}/batch/{batch_id}/propose')
    async def gh_batch_propose(owner: str, repo: str, batch_id: str, request: Request):
        guard(request); b = await body(request)
        open_pr = bool(b.get('open_pr', True)) if isinstance(b, dict) else True
        merge = bool(b.get('merge', False)) if isinstance(b, dict) else False
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(wrap, lambda: ws.propose_batch(owner, repo, str(b.get('path') or ''), batch_id, open_pr=open_pr, merge=merge))

    @app.post('/api/github/project/{owner}/{repo}/batch/{batch_id}/brain-accept')
    async def gh_batch_brain_accept(owner: str, repo: str, batch_id: str, request: Request):
        guard(request); b = await body(request)
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(wrap, lambda: ws.brain_accept_batch(owner, repo, str(b.get('path') or ''), batch_id))


    @app.post('/api/github/project/{owner}/{repo}/worker-contract')
    async def gh_worker_contract(owner: str, repo: str, request: Request):
        guard(request); b = await body(request)
        from starlette.concurrency import run_in_threadpool
        return await run_in_threadpool(wrap, lambda: ws.run_worker_contract(owner, repo, str(b.get('path') or '')))

    @app.get('/api/github/project/{owner}/{repo}/worker-contract')
    def gh_worker_contract_get(owner: str, repo: str, request: Request, path: str = ''):
        guard(request); return wrap(lambda: ws.run_worker_contract(owner, repo, path))


    return ws
