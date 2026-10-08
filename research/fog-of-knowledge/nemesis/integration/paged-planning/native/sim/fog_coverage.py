"""Durable, fair research admission. Scheduling never adjudicates knowledge."""
from __future__ import annotations

import hashlib
import json
import os
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from .github_workspace import check_owner, check_repo, safe_path, MODE_RANK

PROTOCOL = 'fog-coverage/1'
BRANCH_KINDS = {'field', 'subfield', 'concept', 'method', 'theory', 'model', 'law', 'question', 'technology'}
FINISHED = {'MERGED', 'READY', 'PR_OPEN', 'BLOCKED', 'STALE', 'QUARANTINED'}
DISCOVERY_FINISHED = {'HANDED_OFF', 'BLOCKED', 'QUARANTINED'}
TAG_EXPRESSION = "CASE WHEN json_valid(packet) THEN json_extract(packet,'$.STATE.tag') ELSE NULL END"


def discovery_tag(owner, repo, path, key):
    identity = hashlib.sha256((owner + '/' + repo + '/' + path + '\n' + key).encode()).hexdigest()
    return 'fog-crew:discover:coverage:' + identity


def url_key(value):
    """Scheduling key only; never rewrite a captured source or infer identity."""
    parts = urlsplit(value)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, ''))


def choose_branch(inventory, tasks, domains, last_domain=None):
    """Visit every domain before returning; no global Physics priority cutoff."""
    visited = set(tasks)
    ordered = list(dict.fromkeys(domains))
    if last_domain in ordered:
        index = ordered.index(last_domain) + 1
        ordered = ordered[index:] + ordered[:index]
    for domain in ordered:
        eligible = [node for node in inventory if node['domain'] == domain
                    and node['kind'] in BRANCH_KINDS and node['id'] not in visited]
        if eligible:
            return min(eligible, key=lambda node: (
                bool(node.get('has_sources')), node['kind'] not in {'field', 'subfield'}, node['id']))
    return None


class FogCoveragePlanner:
    def __init__(self, crew):
        self.crew = crew
        self.root = crew.root / 'coverage'
        self.contexts = {}

    def location(self, owner, repo, path):
        owner, repo = check_owner(owner), check_repo(repo)
        path = safe_path(path, allow_empty=False)
        key = hashlib.sha256(path.encode()).hexdigest()[:24]
        return self.root / owner / repo / (key + '.json')

    @staticmethod
    def save(filename, state):
        from .durable_json import write_json
        write_json(filename,state)

    def load(self, owner, repo, path):
        filename = self.location(owner, repo, path)
        if not filename.exists():
            return {'protocol': PROTOCOL, 'owner': owner, 'repo': repo, 'path': path,
                    'enabled': False, 'state': 'PAUSED', 'tasks': {}, 'last_domain': None,
                    'totals': {'new_nodes': 0, 'updated_nodes': 0, 'edges': 0},
                    'created_at': time.time(), 'auto_publish': False}
        value = json.loads(filename.read_text(encoding='utf-8'))
        if value.get('protocol') != PROTOCOL or not isinstance(value.get('tasks'), dict):
            raise ValueError('Malformed coverage queue; original retained')
        if (value['owner'], value['repo'], value['path']) != (owner, repo, path):
            raise ValueError('Coverage queue belongs to another project')
        return value

    def configure(self, owner, repo, path, enabled, auto_publish=False):
        if not isinstance(enabled, bool) or not isinstance(auto_publish, bool):
            raise ValueError('Coverage enabled and auto_publish must be booleans')
        with self.crew.lock:
            state = self.load(owner, repo, path)
            if enabled and MODE_RANK.get(self.crew.ws.project_row(owner, repo, path)['mode'], 0) < MODE_RANK['READ_PROPOSE']:
                raise ValueError('Coverage expansion needs READ_PROPOSE or higher')
            state.update(enabled=enabled, auto_publish=auto_publish,
                         state='RUNNING' if enabled else 'PAUSED', next_attempt_at=0, error=None)
            if enabled:
                self.refresh(state)
            self.save(self.location(owner, repo, path), state)
            return self.public(state)

    def refresh(self, state):
        owner, repo, path = state['owner'], state['repo'], state['path']
        row = self.crew.ws.project_row(owner, repo, path)
        sha = self.crew.ws.resolve(owner, repo, '')
        cache_key = (owner, repo, path)
        if self.contexts.get(cache_key, {}).get('sha') == sha:
            return self.contexts[cache_key]['packet']
        result = self.crew.ws.run_context(owner, repo, path)
        context = self.crew.ws.s.cache_get('gh:context-full:' + row['key'])
        if result.get('exit_code') != 0 or not context or context.get('sha') != sha:
            raise ValueError('Fresh atlas context unavailable; no coverage work dispatched')
        packet = context['packet']
        inventory = packet.get('coverage_inventory')
        if not isinstance(inventory, list) or not inventory:
            raise ValueError('Refresh Fog main: complete coverage_inventory is required')
        ids = set()
        for node in inventory:
            if not isinstance(node, dict) or any(not isinstance(node.get(k), str) for k in ('id', 'label', 'domain', 'kind')):
                raise ValueError('Malformed atlas inventory; no coverage work dispatched')
            if node['id'] in ids:
                raise ValueError('Duplicate atlas inventory ID')
            ids.add(node['id'])
        domains = [domain['domain'] for domain in packet.get('coverage_by_domain', [])]
        if not domains or any(node['domain'] not in domains for node in inventory):
            raise ValueError('Inventory domain is missing from atlas coverage')
        state.update(inventory_sha=sha, inventory_count=len(inventory),
                     eligible_branches=sum(n['kind'] in BRANCH_KINDS for n in inventory),
                     domains=[{'id': d['domain'], 'label': d['label']} for d in packet['coverage_by_domain']])
        self.contexts[cache_key] = context
        return packet

    def reconcile(self, state):
        """Resume intents and record terminal outcomes exactly once."""
        for task in state['tasks'].values():
            if task.get('yield_counted'):
                continue
            jid = task.get('job_id')
            if not jid:
                tag = discovery_tag(state['owner'], state['repo'], state['path'], task['key'])
                found = self.crew.brain.store.one('SELECT id,status,packet FROM brain_jobs WHERE ' + TAG_EXPRESSION + '=? ORDER BY created DESC LIMIT 1', (tag,))
                if not found:
                    continue  # durable pre-enqueue intent is retried with the same tag
                jid = task['job_id'] = found['id']
            filename = self.crew.root / 'discoveries' / (jid + '.json')
            if not filename.exists():
                continue
            discovery = json.loads(filename.read_text(encoding='utf-8'))
            if discovery.get('state') in {'BLOCKED', 'QUARANTINED'}:
                task.update(state='HELD', reason=discovery.get('error'), finished_at=time.time())
                continue
            bid = discovery.get('batch_id')
            if not bid:
                task['state'] = discovery.get('state', 'QUEUED')
                continue
            flow = self.crew.load(self.crew.location(state['owner'], state['repo'], bid))
            task.update(batch_id=bid, state=flow['state'])
            if flow['state'] in {'BLOCKED', 'STALE', 'QUARANTINED'}:
                task.update(state='HELD', reason=flow.get('error'), finished_at=time.time())
            elif flow['state'] == 'MERGED':
                task.update(finished_at=time.time(), yield_counts=flow.get('yield_counts', {}), yield_counted=True)
                for key in state['totals']:
                    state['totals'][key] += flow.get('yield_counts', {}).get(key, 0)

    def active_count(self, state):
        # Existing/manual batches also occupy capacity: upgrade never interrupts them.
        count = 0
        for filename in (self.crew.root / state['owner'] / state['repo']).glob('*/flow.json'):
            flow = self.crew.load(filename.parent)
            if flow['path'] == state['path'] and flow['state'] not in FINISHED:
                count += 1
        for filename in self.crew.root.glob('discoveries/*.json'):
            entry = json.loads(filename.read_text(encoding='utf-8'))
            if (entry['owner'], entry['repo'], entry['path']) == (state['owner'], state['repo'], state['path']) and entry['state'] not in DISCOVERY_FINISHED:
                count += 1
        return count

    def history(self, state, node):
        """Reuse sources for distinct assertions, but expose prior use to the author."""
        used = Counter()
        for filename in (self.crew.root / state['owner'] / state['repo']).glob('*/flow.json'):
            flow = self.crew.load(filename.parent)
            for source in flow['discovery'].get('source_requests', []):
                used[url_key(source['url'])] += 1
        return [{'url': url, 'prior_capture_requests': count} for url, count in used.most_common(40)]

    def schedule(self, filename, state):
        self.reconcile(state)
        if not state['enabled']:
            self.save(filename, state)
            return
        if not self.crew.brain.enabled or self.crew.brain.store.kv_get('brain_hold', ''):
            state['state'] = 'WAITING_FOR_BRAIN'
            self.save(filename, state)
            return
        free = max(0, 3 - self.active_count(state))
        if not free:
            state['state'] = 'RUNNING'
            self.save(filename, state)
            return
        packet = self.refresh(state)
        inventory = packet['coverage_inventory']
        domains = [row['id'] for row in state['domains']]
        plans = []
        intents = [task for task in state['tasks'].values() if task['state'] == 'INTENT']
        for task in intents[:free]:
            plans.append(task)
        for _ in range(free - len(plans)):
            node = choose_branch(inventory, state['tasks'], domains, state.get('last_domain'))
            if node is None:
                break
            # Reserve before enqueue. A crash cannot silently dispatch the same branch twice.
            task = {'key': node['id'], 'domain': node['domain'], 'label': node['label'],
                    'state': 'INTENT', 'created_at': time.time(), 'target': node,
                    'source_history': self.history(state, node)}
            state['tasks'][node['id']] = task
            state['last_domain'] = node['domain']
            plans.append(task)
        state['state'] = 'RUNNING' if plans or self.active_count(state) else 'WAITING_FOR_NEW_BRANCHES'
        self.save(filename, state)
        if plans:
            queued = self.crew.discover(state['owner'], state['repo'], state['path'],
                [self.mission(task) for task in plans], state['auto_publish'], coverage_tasks=plans)
            for task, jid in zip(plans, queued['jobs']):
                task.update(job_id=jid, state='QUEUED')
            state.update(error=None, next_attempt_at=0)
            self.save(filename, state)

    @staticmethod
    def mission(task):
        return (f"Map the {task['label']} branch in atlas domain {task['domain']}. "
                "Research foundational concepts, methods, explicit results and publicly stated open questions beyond its current coverage. "
                "Discover up to four accessible primary sources supporting multiple DISTINCT, currently unrepresented assertions. "
                "Aim for 6–12 supported targets per author packet when evidence permits; this is a capacity goal, never a quota or permission to invent. "
                "Prefer unprocessed sources. Reuse a source only for a clearly different assertion. "
                "Preserve uncertainty, and do not infer taxonomy or current frontier status.")

    def tick(self):
        for filename in self.root.glob('*/*/*.json'):
            state = None
            validated = False
            try:
                state = json.loads(filename.read_text(encoding='utf-8'))
                if not isinstance(state, dict) or state.get('protocol') != PROTOCOL or not isinstance(state.get('tasks'), dict):
                    raise ValueError('Malformed coverage queue; original retained')
                if self.location(state['owner'], state['repo'], state['path']) != filename:
                    raise ValueError('Coverage queue belongs to another project; original retained')
                validated = True
                if time.time() < state.get('next_attempt_at', 0):
                    continue
                self.schedule(filename, state)
                self.crew.file_errors.pop(str(filename.relative_to(self.crew.root)), None)
            except Exception as exc:
                # Retain state and bounded retry; one bad queue cannot stop other projects.
                if validated:
                    state.update(state='RECOVERY_PENDING', error=str(exc)[:1000], next_attempt_at=time.time() + 60)
                    self.save(filename, state)
                self.crew.file_errors[str(filename.relative_to(self.crew.root))] = str(exc)[:300]

    @staticmethod
    def public(state):
        counts = Counter(task['state'] for task in state['tasks'].values())
        visited = Counter(task['domain'] for task in state['tasks'].values())
        active = [task for task in state['tasks'].values() if task['state'] not in {'MERGED', 'HELD', 'READY', 'PR_OPEN'}]
        return {'protocol': PROTOCOL, 'enabled': state['enabled'], 'state': state['state'],
                'auto_publish': state['auto_publish'], 'error': state.get('error'),
                'inventory_count': state.get('inventory_count', 0),
                'eligible_branches': state.get('eligible_branches', 0),
                'visited_branches': len(state['tasks']), 'states': dict(counts),
                'domains': [{**d, 'visited': visited[d['id']]} for d in state.get('domains', [])],
                'totals': state['totals'],
                'active_tasks': [{k: task.get(k) for k in ('key', 'domain', 'label', 'state', 'job_id', 'batch_id')} for task in active],
                'held_tasks': [{k: task.get(k) for k in ('key', 'domain', 'label', 'reason')} for task in state['tasks'].values() if task['state'] == 'HELD'][-12:]}
