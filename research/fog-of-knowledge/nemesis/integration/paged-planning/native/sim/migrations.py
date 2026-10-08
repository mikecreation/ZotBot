"""Additive, idempotent science migrations. NEVER delete the legacy arena or its history.

The shipped snapshot starts at user_version 0 (the base arena). If a future snapshot
already has some Pandora tables, CREATE IF NOT EXISTS leaves them intact.
"""

SCIENCE_V1 = """
CREATE TABLE IF NOT EXISTS research_campaigns (
 id TEXT PRIMARY KEY, field_id TEXT NOT NULL, lead_agent_id TEXT NOT NULL,
 invention_id TEXT UNIQUE, title TEXT NOT NULL, question TEXT NOT NULL,
 claim TEXT NOT NULL, mechanism TEXT NOT NULL DEFAULT '', novel_delta TEXT NOT NULL DEFAULT '',
 phase TEXT NOT NULL DEFAULT 'QUESTION_LOCKED', status TEXT NOT NULL DEFAULT 'HYPOTHESIS',
 evidence_status TEXT NOT NULL DEFAULT 'HYPOTHESIS', active_state TEXT NOT NULL DEFAULT '{}',
 state_hash TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
 locked_hash TEXT, review_round INTEGER NOT NULL DEFAULT 0,
 created REAL NOT NULL, updated REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_campaign_field_updated ON research_campaigns(field_id,updated DESC);
CREATE INDEX IF NOT EXISTS ix_campaign_status_updated ON research_campaigns(status,updated DESC);
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT NOT NULL DEFAULT '[]',
 year INTEGER, doi TEXT, openalex_id TEXT, pmid TEXT, url TEXT NOT NULL DEFAULT '',
 venue TEXT NOT NULL DEFAULT '', abstract_snippet TEXT NOT NULL DEFAULT '',
 provider TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'paper', peer_reviewed TEXT NOT NULL DEFAULT 'UNKNOWN',
 retracted INTEGER NOT NULL DEFAULT 0, correction_status TEXT NOT NULL DEFAULT 'UNKNOWN',
 citation_count INTEGER NOT NULL DEFAULT 0, retrieved REAL NOT NULL,
 metadata TEXT NOT NULL DEFAULT '{}');
CREATE UNIQUE INDEX IF NOT EXISTS ix_sources_doi ON sources(doi) WHERE doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_sources_openalex ON sources(openalex_id);
CREATE INDEX IF NOT EXISTS ix_sources_pmid ON sources(pmid);
CREATE TABLE IF NOT EXISTS source_citations (
 source_id TEXT NOT NULL, cited_identifier TEXT NOT NULL, kind TEXT NOT NULL,
 created REAL NOT NULL, PRIMARY KEY(source_id,cited_identifier,kind));
CREATE INDEX IF NOT EXISTS ix_source_citations_target ON source_citations(cited_identifier);
CREATE TABLE IF NOT EXISTS campaign_sources (
 campaign_id TEXT NOT NULL, source_id TEXT NOT NULL, query TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'PRIOR_ART_CANDIDATE',
 created REAL NOT NULL, PRIMARY KEY(campaign_id,source_id));
CREATE INDEX IF NOT EXISTS ix_campaign_sources_source ON campaign_sources(source_id);
CREATE TABLE IF NOT EXISTS coverage_certificates (
 campaign_id TEXT PRIMARY KEY, status TEXT NOT NULL, queries TEXT NOT NULL DEFAULT '[]',
 attempts TEXT NOT NULL DEFAULT '[]', gaps TEXT NOT NULL DEFAULT '[]',
 result_count INTEGER NOT NULL DEFAULT 0, graph_depth INTEGER NOT NULL DEFAULT 0,
 inspected_count INTEGER NOT NULL DEFAULT 0, issued REAL NOT NULL);
CREATE TABLE IF NOT EXISTS hypotheses (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, kind TEXT NOT NULL,
 mechanism TEXT NOT NULL, variables TEXT NOT NULL DEFAULT '[]',
 assumptions TEXT NOT NULL DEFAULT '[]', prediction TEXT NOT NULL DEFAULT '',
 falsifier TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'HYPOTHESIS',
 parent_id TEXT, signature TEXT NOT NULL, created REAL NOT NULL,
 UNIQUE(campaign_id,signature));
CREATE INDEX IF NOT EXISTS ix_hypotheses_campaign ON hypotheses(campaign_id,status);
"""

SCIENCE_V2 = """
CREATE TABLE IF NOT EXISTS science_nodes (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, node_type TEXT NOT NULL,
 label TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}',
 fingerprint TEXT NOT NULL, provenance_ref TEXT, created REAL NOT NULL, updated REAL NOT NULL,
 UNIQUE(campaign_id,fingerprint));
CREATE INDEX IF NOT EXISTS ix_nodes_campaign_type ON science_nodes(campaign_id,node_type);
CREATE INDEX IF NOT EXISTS ix_nodes_provenance ON science_nodes(provenance_ref);
CREATE TABLE IF NOT EXISTS science_edges (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL,
 source_node TEXT NOT NULL, target_node TEXT NOT NULL, edge_type TEXT NOT NULL,
 created REAL NOT NULL, UNIQUE(source_node,target_node,edge_type));
CREATE INDEX IF NOT EXISTS ix_edges_source ON science_edges(source_node);
CREATE INDEX IF NOT EXISTS ix_edges_target ON science_edges(target_node);
CREATE TABLE IF NOT EXISTS milestones (
 id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id TEXT NOT NULL,
 kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_milestones_campaign ON milestones(campaign_id,id DESC);
"""

SCIENCE_V3 = """
CREATE TABLE IF NOT EXISTS papers (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 title TEXT NOT NULL, status TEXT NOT NULL, manuscript TEXT NOT NULL DEFAULT '{}',
 locked_hash TEXT, created REAL NOT NULL, updated REAL NOT NULL,
 UNIQUE(campaign_id,revision));
CREATE INDEX IF NOT EXISTS ix_papers_status ON papers(status,updated DESC);
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, round INTEGER NOT NULL,
 revision INTEGER NOT NULL, reviewer_id TEXT NOT NULL, role TEXT NOT NULL,
 locked_hash TEXT NOT NULL, outcome TEXT NOT NULL, findings TEXT NOT NULL DEFAULT '[]',
 committed REAL NOT NULL, UNIQUE(campaign_id,round,role));
CREATE INDEX IF NOT EXISTS ix_reviews_campaign_round ON reviews(campaign_id,round);
CREATE TABLE IF NOT EXISTS replications (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, experiment_id TEXT NOT NULL,
 reviewer_id TEXT NOT NULL, method TEXT NOT NULL, result TEXT NOT NULL,
 output TEXT NOT NULL DEFAULT '{}', details TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_replications_campaign ON replications(campaign_id,created DESC);
CREATE TABLE IF NOT EXISTS disputes (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, node_id TEXT, source_id TEXT,
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', created REAL NOT NULL,
 resolved REAL);
CREATE INDEX IF NOT EXISTS ix_disputes_campaign ON disputes(campaign_id,status);
CREATE TABLE IF NOT EXISTS experiments (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, kind TEXT NOT NULL,
 question TEXT NOT NULL, assumptions TEXT NOT NULL DEFAULT '[]', code TEXT NOT NULL,
 inputs TEXT NOT NULL, output TEXT NOT NULL, environment TEXT NOT NULL,
 seed TEXT, data_origin TEXT NOT NULL, status TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_experiments_campaign ON experiments(campaign_id,created DESC);
CREATE TABLE IF NOT EXISTS agent_skills (
 agent_id TEXT NOT NULL, skill TEXT NOT NULL, verified_count INTEGER NOT NULL DEFAULT 0,
 rejected_count INTEGER NOT NULL DEFAULT 0, score REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(agent_id,skill));
CREATE TABLE IF NOT EXISTS science_rewards (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, agent_id TEXT NOT NULL,
 skill TEXT NOT NULL, amount REAL NOT NULL, evidence_ref TEXT NOT NULL,
 reason TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_rewards_agent ON science_rewards(agent_id,created DESC);
"""


SCIENCE_V4 = """
CREATE TABLE IF NOT EXISTS review_locks (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 round INTEGER NOT NULL, locked_hash TEXT NOT NULL, snapshot TEXT NOT NULL,
 created REAL NOT NULL, UNIQUE(campaign_id,revision,round));
CREATE INDEX IF NOT EXISTS ix_review_locks_campaign ON review_locks(campaign_id,round DESC);
CREATE INDEX IF NOT EXISTS ix_review_locks_hash ON review_locks(locked_hash);
"""


SCIENCE_V5 = """
CREATE INDEX IF NOT EXISTS ix_milestones_created ON milestones(created DESC);
CREATE INDEX IF NOT EXISTS ix_campaign_created ON research_campaigns(created DESC);
CREATE INDEX IF NOT EXISTS ix_replications_experiment ON replications(experiment_id,result);
CREATE INDEX IF NOT EXISTS ix_papers_campaign_revision ON papers(campaign_id,revision DESC);
"""


WORLD_V6 = """
CREATE TABLE IF NOT EXISTS world_chunks (
 cx INTEGER NOT NULL, cy INTEGER NOT NULL, biome TEXT NOT NULL,
 discovered_at REAL NOT NULL, discovered_by TEXT NOT NULL,
 delta TEXT NOT NULL DEFAULT '{}', summary TEXT NOT NULL DEFAULT '{}',
 PRIMARY KEY(cx,cy));
CREATE INDEX IF NOT EXISTS ix_chunks_discovered ON world_chunks(discovered_at DESC);
CREATE TABLE IF NOT EXISTS world_regions (
 rx INTEGER NOT NULL, ry INTEGER NOT NULL, discovered_count INTEGER NOT NULL DEFAULT 0,
 latest_discovery REAL NOT NULL, PRIMARY KEY(rx,ry));
CREATE TABLE IF NOT EXISTS world_facilities (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, field_id TEXT,
 x REAL NOT NULL, y REAL NOT NULL, cx INTEGER NOT NULL, cy INTEGER NOT NULL,
 status TEXT NOT NULL, origin_type TEXT NOT NULL, origin_id TEXT,
 created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_facilities_chunk ON world_facilities(cx,cy);
CREATE TABLE IF NOT EXISTS agent_positions (
 agent_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL,
 from_x REAL NOT NULL, from_y REAL NOT NULL, dest_x REAL NOT NULL, dest_y REAL NOT NULL,
 depart REAL NOT NULL DEFAULT 0, arrival REAL NOT NULL DEFAULT 0,
 chunk_x INTEGER NOT NULL DEFAULT 0, chunk_y INTEGER NOT NULL DEFAULT 0,
 activity TEXT NOT NULL, task TEXT NOT NULL DEFAULT '', facility_id TEXT,
 campaign_id TEXT, itinerary TEXT NOT NULL DEFAULT '[]', next_task INTEGER NOT NULL DEFAULT 0,
 explore_seq INTEGER NOT NULL DEFAULT 0, updated REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_positions_arrival ON agent_positions(arrival);
CREATE INDEX IF NOT EXISTS ix_positions_chunk ON agent_positions(chunk_x,chunk_y);
CREATE INDEX IF NOT EXISTS ix_positions_idle ON agent_positions(next_task,arrival,updated);
CREATE TABLE IF NOT EXISTS world_discoveries (
 id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL,
 cx INTEGER NOT NULL, cy INTEGER NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL,
 origin TEXT NOT NULL, discovered_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_world_discoveries_chunk ON world_discoveries(cx,cy);
CREATE TABLE IF NOT EXISTS world_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, agent_id TEXT,
 facility_id TEXT, cx INTEGER, cy INTEGER, detail TEXT NOT NULL DEFAULT '{}',
 created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_world_events_agent ON world_events(agent_id,created DESC);
CREATE INDEX IF NOT EXISTS ix_world_events_chunk ON world_events(cx,cy,created DESC);
"""


WORLD_V7 = """
CREATE TABLE IF NOT EXISTS world_event_summaries (
 day INTEGER NOT NULL, agent_id TEXT NOT NULL, kind TEXT NOT NULL,
 n INTEGER NOT NULL DEFAULT 0, first_at REAL NOT NULL, last_at REAL NOT NULL,
 min_cx INTEGER, max_cx INTEGER, min_cy INTEGER, max_cy INTEGER,
 PRIMARY KEY(day,agent_id,kind));
CREATE INDEX IF NOT EXISTS ix_world_events_created ON world_events(created);
"""


MAINTENANCE_V8 = """
CREATE INDEX IF NOT EXISTS ix_cache_ts ON cache(ts);
CREATE INDEX IF NOT EXISTS ix_events_ts ON events(ts DESC);
"""


COLD_ARENA_V9 = """
CREATE TABLE IF NOT EXISTS arena_event_archive (
 start_id INTEGER PRIMARY KEY, end_id INTEGER NOT NULL, n INTEGER NOT NULL,
 payload BLOB NOT NULL, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_event_archive_end ON arena_event_archive(end_id DESC);
"""


GOVERNANCE_V10 = """
CREATE TABLE IF NOT EXISTS system_amendments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL DEFAULT 'SYSTEM_AMENDMENT',
 proposed_by TEXT NOT NULL, engineer_id TEXT NOT NULL, title TEXT NOT NULL,
 observation TEXT NOT NULL, category TEXT NOT NULL, risk_level INTEGER NOT NULL,
 affected_files TEXT NOT NULL DEFAULT '[]', hypothesis TEXT NOT NULL DEFAULT '{}',
 state TEXT NOT NULL DEFAULT 'PROPOSED', patch_diff TEXT NOT NULL DEFAULT '',
 baseline_metrics TEXT NOT NULL DEFAULT '{}', candidate_metrics TEXT NOT NULL DEFAULT '{}',
 tests TEXT NOT NULL DEFAULT '{}', security TEXT NOT NULL DEFAULT '{}',
 vote_tally TEXT NOT NULL DEFAULT '{}', post_metrics TEXT NOT NULL DEFAULT '{}',
 known_good_path TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
 created REAL NOT NULL, updated REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_amendments_updated ON system_amendments(updated DESC);
CREATE TABLE IF NOT EXISTS amendment_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, amendment_id INTEGER NOT NULL,
 stage TEXT NOT NULL, actor_id TEXT NOT NULL DEFAULT '',
 detail TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_amendment_history ON amendment_history(amendment_id,id DESC);
CREATE TABLE IF NOT EXISTS amendment_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT, amendment_id INTEGER NOT NULL,
 reviewer_id TEXT NOT NULL, dimension TEXT NOT NULL, verdict TEXT NOT NULL,
 finding TEXT NOT NULL, created REAL NOT NULL,
 UNIQUE(amendment_id,reviewer_id,dimension));
CREATE INDEX IF NOT EXISTS ix_amendment_reviews ON amendment_reviews(amendment_id);
CREATE TABLE IF NOT EXISTS amendment_votes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, amendment_id INTEGER NOT NULL,
 agent_id TEXT NOT NULL, stance TEXT NOT NULL, technical_weight REAL NOT NULL,
 dimensions TEXT NOT NULL DEFAULT '{}', reason TEXT NOT NULL, created REAL NOT NULL,
 UNIQUE(amendment_id,agent_id));
CREATE INDEX IF NOT EXISTS ix_amendment_votes ON amendment_votes(amendment_id);
CREATE TABLE IF NOT EXISTS governance_credibility (
 agent_id TEXT NOT NULL, dimension TEXT NOT NULL,
 score REAL NOT NULL DEFAULT 1, proven INTEGER NOT NULL DEFAULT 0,
 reversals INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(agent_id,dimension));
CREATE TABLE IF NOT EXISTS tool_registry (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL,
 capability TEXT NOT NULL, implementation TEXT NOT NULL, origin TEXT NOT NULL,
 manifest TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'PROPOSED',
 amendment_id INTEGER, created REAL NOT NULL, updated REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_tool_registry_status ON tool_registry(status,updated DESC);
"""



CAMPAIGN_WORKERS_V11 = """
-- Reuse the 36 persisted Arena agents. Campaign work is not a second agent system.
CREATE TABLE IF NOT EXISTS campaign_runtime (
 campaign_id TEXT PRIMARY KEY, origin TEXT NOT NULL, priority INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE', paused INTEGER NOT NULL DEFAULT 0,
 blocker TEXT NOT NULL DEFAULT '', last_dispatched REAL NOT NULL DEFAULT 0,
 source_cursor TEXT NOT NULL DEFAULT '', updated REAL NOT NULL, last_progress REAL NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_campaign_runtime_priority ON campaign_runtime(paused,origin,last_dispatched);
CREATE TABLE IF NOT EXISTS campaign_workers (
 campaign_id TEXT NOT NULL, role TEXT NOT NULL, agent_id TEXT NOT NULL,
 capability TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ASSIGNED',
 assigned REAL NOT NULL, last_active REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(campaign_id,role));
CREATE INDEX IF NOT EXISTS ix_campaign_workers_agent ON campaign_workers(agent_id,status);
CREATE TABLE IF NOT EXISTS campaign_tasks (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 question_hash TEXT NOT NULL, claim_node_id TEXT, hypothesis_id TEXT,
 target_ref TEXT NOT NULL, task_type TEXT NOT NULL,
 obligation TEXT NOT NULL, role TEXT NOT NULL, agent_id TEXT NOT NULL,
 capability TEXT NOT NULL, dependencies TEXT NOT NULL DEFAULT '[]',
 priority INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'QUEUED',
 attempts INTEGER NOT NULL DEFAULT 0, not_before REAL NOT NULL DEFAULT 0,
 created REAL NOT NULL, started REAL, completed REAL,
 result_ref TEXT, result TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '',
 UNIQUE(campaign_id,revision,task_type,target_ref));
CREATE INDEX IF NOT EXISTS ix_campaign_tasks_queue ON campaign_tasks(status,not_before,priority DESC,created);
CREATE INDEX IF NOT EXISTS ix_campaign_tasks_campaign ON campaign_tasks(campaign_id,revision,status,created);
CREATE INDEX IF NOT EXISTS ix_campaign_tasks_agent ON campaign_tasks(agent_id,status,created);
"""


MOBILIZATION_V12 = """
-- At most one primary user objective. No changes to Arena running controls/economy.
CREATE TABLE IF NOT EXISTS campaign_mobilization (
 campaign_id TEXT PRIMARY KEY, level TEXT NOT NULL DEFAULT 'NORMAL'
 CHECK(level IN ('NORMAL','PRIORITY','FULL_MOBILIZATION')),
 is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
 generation INTEGER NOT NULL DEFAULT 1, changed REAL NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ix_mobilization_primary ON campaign_mobilization(is_primary) WHERE is_primary=1;
CREATE TABLE IF NOT EXISTS campaign_swarm_branches (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 generation INTEGER NOT NULL, task_id TEXT NOT NULL UNIQUE,
 family TEXT NOT NULL, track TEXT NOT NULL, agent_id TEXT NOT NULL,
 capability TEXT NOT NULL, rationale TEXT NOT NULL, target_ref TEXT NOT NULL,
 independence_group TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ASSIGNED',
 created REAL NOT NULL, committed REAL,
 UNIQUE(campaign_id,revision,generation,family,target_ref));
CREATE INDEX IF NOT EXISTS ix_swarm_branches_campaign ON campaign_swarm_branches(campaign_id,revision,generation,status);
CREATE INDEX IF NOT EXISTS ix_swarm_branches_agent ON campaign_swarm_branches(agent_id,status);
CREATE TABLE IF NOT EXISTS campaign_swarm_commits (
 id TEXT PRIMARY KEY, branch_id TEXT NOT NULL UNIQUE, campaign_id TEXT NOT NULL,
 revision INTEGER NOT NULL, generation INTEGER NOT NULL, agent_id TEXT NOT NULL,
 outcome TEXT NOT NULL, provider TEXT, model_id TEXT,
 result TEXT NOT NULL DEFAULT '{}', evidence_refs TEXT NOT NULL DEFAULT '[]',
 created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_swarm_commits_campaign ON campaign_swarm_commits(campaign_id,revision,generation,created);
CREATE TABLE IF NOT EXISTS campaign_swarm_merges (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 generation INTEGER NOT NULL, committed_hash TEXT NOT NULL,
 agreement TEXT NOT NULL DEFAULT '[]', disagreement TEXT NOT NULL DEFAULT '[]',
 frontier TEXT NOT NULL DEFAULT '[]', blockers TEXT NOT NULL DEFAULT '[]',
 created REAL NOT NULL, UNIQUE(campaign_id,revision,generation,committed_hash));
CREATE INDEX IF NOT EXISTS ix_swarm_merges_campaign ON campaign_swarm_merges(campaign_id,revision,generation);
"""


SCHEDULER_V13 = """
-- Per-campaign liveness; does not change immutable scientific evidence or v11 tasks.
CREATE TABLE IF NOT EXISTS campaign_scheduler_heartbeats (
 campaign_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL,
 last_pass REAL NOT NULL DEFAULT 0,
 next_pass REAL NOT NULL DEFAULT 0,
 pass_count INTEGER NOT NULL DEFAULT 0,
 stall_intervals INTEGER NOT NULL DEFAULT 0,
 stall_detected REAL,
 diagnosis TEXT NOT NULL DEFAULT '',
 recovery TEXT NOT NULL DEFAULT '',
 last_error TEXT NOT NULL DEFAULT '',
 last_started INTEGER NOT NULL DEFAULT 0,
 last_ready INTEGER NOT NULL DEFAULT 0,
 updated REAL NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_scheduler_heartbeat_next ON campaign_scheduler_heartbeats(next_pass,campaign_id);
-- Readiness scans never sort or hydrate an unlimited current-version task backlog.
CREATE INDEX IF NOT EXISTS ix_campaign_tasks_scheduler_scan
 ON campaign_tasks(campaign_id,revision,priority DESC,created ASC)
 WHERE status IN ('QUEUED','RETRY');
-- Durable execution leases: preserve original task.started as the actual claim time.
CREATE TABLE IF NOT EXISTS campaign_task_leases (
 task_id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL,
 agent_id TEXT NOT NULL,
 owner TEXT NOT NULL,
 owner_pid INTEGER NOT NULL,
 claimed REAL NOT NULL,
 last_heartbeat REAL NOT NULL,
 finished REAL);
CREATE INDEX IF NOT EXISTS ix_campaign_task_leases_campaign ON campaign_task_leases(campaign_id,last_heartbeat DESC);
"""


REVIEW_REVISION_V14 = """
-- Add membership tables, never destroy the previously locked review or source records.
CREATE TABLE IF NOT EXISTS campaign_revisions (
 campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 lifecycle TEXT NOT NULL CHECK(lifecycle IN ('WORKING','SUPERSEDED_WORKING','LOCKED_REVIEW')),
 question TEXT NOT NULL, claim TEXT NOT NULL, mechanism TEXT NOT NULL,
 novel_delta TEXT NOT NULL, objective_hash TEXT NOT NULL,
 prior_locked_hash TEXT, locked_hash TEXT,
 review_round INTEGER NOT NULL DEFAULT 0,
 initial_state TEXT NOT NULL DEFAULT '{}', frozen_coverage TEXT NOT NULL DEFAULT '{}',
 review_snapshot TEXT NOT NULL DEFAULT '', review_reports TEXT NOT NULL DEFAULT '[]',
 reports_hash TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', created REAL NOT NULL,
 PRIMARY KEY(campaign_id,revision));
CREATE INDEX IF NOT EXISTS ix_campaign_revisions_lifecycle ON campaign_revisions(campaign_id,lifecycle,revision DESC);
CREATE TRIGGER IF NOT EXISTS immutable_campaign_review_revision_update
 BEFORE UPDATE ON campaign_revisions WHEN OLD.lifecycle='LOCKED_REVIEW'
 BEGIN SELECT RAISE(ABORT,'locked campaign revision cannot be edited'); END;
CREATE TRIGGER IF NOT EXISTS immutable_campaign_review_revision_delete
 BEFORE DELETE ON campaign_revisions WHEN OLD.lifecycle='LOCKED_REVIEW'
 BEGIN SELECT RAISE(ABORT,'locked campaign revision cannot be deleted'); END;
-- Complete archived rounds cannot lose or rewrite their original lock or reports.
-- Before archiving, crash recovery may still fill in a missing role report.
CREATE TRIGGER IF NOT EXISTS immutable_archived_review_lock_update BEFORE UPDATE ON review_locks
 WHEN EXISTS(SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=OLD.campaign_id
  AND v.revision=OLD.revision AND v.locked_hash=OLD.locked_hash AND v.lifecycle='LOCKED_REVIEW')
 BEGIN SELECT RAISE(ABORT,'archived review lock immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_archived_review_lock_delete BEFORE DELETE ON review_locks
 WHEN EXISTS(SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=OLD.campaign_id
  AND v.revision=OLD.revision AND v.locked_hash=OLD.locked_hash AND v.lifecycle='LOCKED_REVIEW')
 BEGIN SELECT RAISE(ABORT,'archived review lock immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_archived_review_report_update BEFORE UPDATE ON reviews
 WHEN EXISTS(SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=OLD.campaign_id
  AND v.revision=OLD.revision AND v.locked_hash=OLD.locked_hash AND v.lifecycle='LOCKED_REVIEW')
 BEGIN SELECT RAISE(ABORT,'archived review report immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_archived_review_report_delete BEFORE DELETE ON reviews
 WHEN EXISTS(SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=OLD.campaign_id
  AND v.revision=OLD.revision AND v.locked_hash=OLD.locked_hash AND v.lifecycle='LOCKED_REVIEW')
 BEGIN SELECT RAISE(ABORT,'archived review report immutable'); END;
CREATE TABLE IF NOT EXISTS campaign_revision_blockers (
 campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 reason TEXT NOT NULL, created REAL NOT NULL, status TEXT NOT NULL DEFAULT 'NEEDS_INTEGRITY_REVIEW',
 PRIMARY KEY(campaign_id,revision));
CREATE TABLE IF NOT EXISTS campaign_review_obligations (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 prior_revision INTEGER NOT NULL, review_round INTEGER NOT NULL, review_id TEXT NOT NULL,
 prior_locked_hash TEXT NOT NULL, finding_index INTEGER NOT NULL, check_code TEXT NOT NULL, severity TEXT NOT NULL,
 objection TEXT NOT NULL, evidence_refs TEXT NOT NULL DEFAULT '[]',
 task_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN',
 resolution_ref TEXT NOT NULL DEFAULT '', created REAL NOT NULL,
 UNIQUE(campaign_id,revision,review_id,finding_index));
CREATE INDEX IF NOT EXISTS ix_review_obligations_revision ON campaign_review_obligations(campaign_id,revision,status,created);
CREATE TABLE IF NOT EXISTS campaign_source_revisions (
 campaign_id TEXT NOT NULL, revision INTEGER NOT NULL, source_id TEXT NOT NULL,
 query TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'PRIOR_ART_CANDIDATE',
 created REAL NOT NULL, PRIMARY KEY(campaign_id,revision,source_id));
CREATE INDEX IF NOT EXISTS ix_campaign_source_revisions_source ON campaign_source_revisions(source_id,revision);
CREATE TABLE IF NOT EXISTS science_node_revisions (
 campaign_id TEXT NOT NULL, revision INTEGER NOT NULL, node_id TEXT NOT NULL,
 created REAL NOT NULL, PRIMARY KEY(campaign_id,revision,node_id));
CREATE INDEX IF NOT EXISTS ix_science_node_revisions_node ON science_node_revisions(node_id,revision);
"""


def _migrate_review_v14(db):
    """Crash-resumable, additive v14 upgrade. No DROP or rewrite of historical rows."""
    db.executescript(REVIEW_REVISION_V14)
    for table in ('hypotheses', 'experiments', 'replications'):
        if 'revision' not in {r[1] for r in db.execute('PRAGMA table_info(' + table + ')')}:
            db.execute('ALTER TABLE ' + table + ' ADD COLUMN revision INTEGER NOT NULL DEFAULT 1')
    db.execute('CREATE INDEX IF NOT EXISTS ix_hypotheses_revision ON hypotheses(campaign_id,revision,status,created)')
    db.execute('CREATE INDEX IF NOT EXISTS ix_experiments_revision ON experiments(campaign_id,revision,created DESC)')
    db.execute('CREATE INDEX IF NOT EXISTS ix_replications_revision ON replications(campaign_id,revision,created DESC)')
    db.execute('''INSERT OR IGNORE INTO campaign_source_revisions(campaign_id,revision,source_id,query,role,created)
        SELECT cs.campaign_id,1,cs.source_id,cs.query,cs.role,cs.created FROM campaign_sources cs
        JOIN research_campaigns c ON c.id=cs.campaign_id WHERE c.revision=1
        AND NOT EXISTS (SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=c.id)''')
    db.execute('''INSERT OR IGNORE INTO science_node_revisions(campaign_id,revision,node_id,created)
        SELECT n.campaign_id,1,n.id,n.created FROM science_nodes n
        JOIN research_campaigns c ON c.id=n.campaign_id WHERE c.revision=1
        AND NOT EXISTS (SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=c.id)''')
    db.execute('PRAGMA user_version=14')
    db.commit()


CLAIM_TYPES_V15 = "-- C3 additive, idempotent, claim/revision-scoped classification and honest gates.\nCREATE TABLE IF NOT EXISTS claim_type_assignments (\n campaign_id TEXT NOT NULL, revision INTEGER NOT NULL, claim_hash TEXT NOT NULL,\n claim_type TEXT NOT NULL CHECK(claim_type IN ('MATHEMATICAL','COMPUTATIONAL','EMPIRICAL','ENGINEERING')),\n inferred_by TEXT NOT NULL, rationale TEXT NOT NULL, created REAL NOT NULL,\n PRIMARY KEY(campaign_id,revision,claim_type));\nCREATE TABLE IF NOT EXISTS claim_gate_obligations (\n id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,\n claim_hash TEXT NOT NULL, claim_type TEXT NOT NULL,\n dimension TEXT NOT NULL CHECK(dimension IN ('SUFFICIENCY','MINIMALITY','VALIDATION','FEASIBILITY')),\n gate_code TEXT NOT NULL, requirement TEXT NOT NULL, agent_id TEXT NOT NULL,\n status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','WAITING_FOR_EVIDENCE','RESOLVED')),\n evidence_refs TEXT NOT NULL DEFAULT '[]', task_id TEXT, created REAL NOT NULL, updated REAL NOT NULL,\n UNIQUE(campaign_id,revision,claim_type,dimension,gate_code));\nCREATE INDEX IF NOT EXISTS ix_claim_gate_revision ON claim_gate_obligations(campaign_id,revision,status,claim_type);\nCREATE TRIGGER IF NOT EXISTS immutable_archived_claim_type_update BEFORE UPDATE ON claim_type_assignments\n WHEN EXISTS(SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=OLD.campaign_id AND v.revision=OLD.revision AND v.lifecycle='LOCKED_REVIEW')\n BEGIN SELECT RAISE(ABORT,'archived claim classification immutable'); END;\nCREATE TRIGGER IF NOT EXISTS immutable_archived_claim_type_delete BEFORE DELETE ON claim_type_assignments\n WHEN EXISTS(SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=OLD.campaign_id AND v.revision=OLD.revision AND v.lifecycle='LOCKED_REVIEW')\n BEGIN SELECT RAISE(ABORT,'archived claim classification immutable'); END;\nCREATE TRIGGER IF NOT EXISTS immutable_archived_claim_gate_update BEFORE UPDATE ON claim_gate_obligations\n WHEN EXISTS(SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=OLD.campaign_id AND v.revision=OLD.revision AND v.lifecycle='LOCKED_REVIEW')\n BEGIN SELECT RAISE(ABORT,'archived claim gate immutable'); END;\nCREATE TRIGGER IF NOT EXISTS immutable_archived_claim_gate_delete BEFORE DELETE ON claim_gate_obligations\n WHEN EXISTS(SELECT 1 FROM campaign_revisions v WHERE v.campaign_id=OLD.campaign_id AND v.revision=OLD.revision AND v.lifecycle='LOCKED_REVIEW')\n BEGIN SELECT RAISE(ABORT,'archived claim gate immutable'); END;\n"

IDENTITY_V16 = r"""
-- C3.25 additive campaign-control lineage. No old rows, avatar files, or frozen
-- scientific reviews are changed by this schema. Legacy backfill is explicit Python.
CREATE TABLE IF NOT EXISTS campaign_directives (
 campaign_id TEXT PRIMARY KEY, capture_kind TEXT NOT NULL
  CHECK(capture_kind IN ('USER_HTTP_JSON','ARENA_INTAKE','DIRECT_CALL_UNATTESTED','LEGACY_RECONSTRUCTED','LEGACY_ARENA_RECONSTRUCTED')),
 raw_http_body BLOB, raw_http_sha256 TEXT,
 original_field_id TEXT NOT NULL, original_question TEXT NOT NULL,
 original_claim TEXT NOT NULL, original_mechanism TEXT NOT NULL,
 original_novel_delta TEXT NOT NULL, original_invention_id TEXT,
 original_sha256 TEXT NOT NULL, created REAL NOT NULL,
 CHECK((capture_kind='USER_HTTP_JSON' AND raw_http_body IS NOT NULL AND raw_http_sha256 IS NOT NULL)
       OR (capture_kind<>'USER_HTTP_JSON' AND raw_http_body IS NULL AND raw_http_sha256 IS NULL)));
CREATE INDEX IF NOT EXISTS ix_directive_kind ON campaign_directives(capture_kind,campaign_id);
CREATE TRIGGER IF NOT EXISTS immut_campaign_directive_update BEFORE UPDATE ON campaign_directives
 BEGIN SELECT RAISE(ABORT,'original user/lead directive immutable'); END;
CREATE TRIGGER IF NOT EXISTS immut_campaign_directive_delete BEFORE DELETE ON campaign_directives
 BEGIN SELECT RAISE(ABORT,'original user/lead directive immutable'); END;

CREATE TABLE IF NOT EXISTS campaign_interpretations (
 campaign_id TEXT NOT NULL, revision INTEGER NOT NULL, directive_sha256 TEXT NOT NULL,
 question TEXT NOT NULL, claim TEXT NOT NULL, mechanism TEXT NOT NULL, novel_delta TEXT NOT NULL,
 interpretation_sha256 TEXT NOT NULL, reason TEXT NOT NULL, authority TEXT NOT NULL,
 created REAL NOT NULL, PRIMARY KEY(campaign_id,revision));
CREATE INDEX IF NOT EXISTS ix_interpretation_identity ON campaign_interpretations(campaign_id,directive_sha256,revision);
CREATE TRIGGER IF NOT EXISTS immut_campaign_interpretation_update BEFORE UPDATE ON campaign_interpretations
 BEGIN SELECT RAISE(ABORT,'versioned scientific interpretation immutable'); END;
CREATE TRIGGER IF NOT EXISTS immut_campaign_interpretation_delete BEFORE DELETE ON campaign_interpretations
 BEGIN SELECT RAISE(ABORT,'versioned scientific interpretation immutable'); END;

CREATE TABLE IF NOT EXISTS campaign_task_identities (
 task_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 directive_sha256 TEXT NOT NULL, interpretation_sha256 TEXT NOT NULL,
 origin TEXT NOT NULL, created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_task_identities_campaign ON campaign_task_identities(campaign_id,revision,task_id);
CREATE TRIGGER IF NOT EXISTS immut_campaign_task_identity_update BEFORE UPDATE ON campaign_task_identities
 BEGIN SELECT RAISE(ABORT,'task campaign identity immutable'); END;
CREATE TRIGGER IF NOT EXISTS immut_campaign_task_identity_delete BEFORE DELETE ON campaign_task_identities
 BEGIN SELECT RAISE(ABORT,'task campaign identity immutable'); END;

CREATE TABLE IF NOT EXISTS campaign_query_events (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 directive_sha256 TEXT NOT NULL, interpretation_sha256 TEXT NOT NULL,
 task_id TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL, query TEXT NOT NULL,
 rationale TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
 intent_id TEXT, source_id TEXT, result_count INTEGER NOT NULL DEFAULT 0,
 detail TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL);
CREATE INDEX IF NOT EXISTS ix_query_events_campaign ON campaign_query_events(campaign_id,revision,created DESC,id DESC);
CREATE INDEX IF NOT EXISTS ix_query_events_source ON campaign_query_events(campaign_id,revision,source_id);
CREATE TRIGGER IF NOT EXISTS immut_campaign_query_event_update BEFORE UPDATE ON campaign_query_events
 BEGIN SELECT RAISE(ABORT,'audited search event immutable'); END;
CREATE TRIGGER IF NOT EXISTS immut_campaign_query_event_delete BEFORE DELETE ON campaign_query_events
 BEGIN SELECT RAISE(ABORT,'audited search event immutable'); END;

CREATE TABLE IF NOT EXISTS campaign_source_query_links (
 campaign_id TEXT NOT NULL, revision INTEGER NOT NULL, source_id TEXT NOT NULL,
 event_id TEXT NOT NULL, directive_sha256 TEXT NOT NULL,
 interpretation_sha256 TEXT NOT NULL, created REAL NOT NULL,
 PRIMARY KEY(campaign_id,revision,source_id,event_id));
CREATE INDEX IF NOT EXISTS ix_source_query_links_event ON campaign_source_query_links(event_id,source_id);
CREATE TRIGGER IF NOT EXISTS immut_campaign_source_query_link_update BEFORE UPDATE ON campaign_source_query_links
 BEGIN SELECT RAISE(ABORT,'source query lineage immutable'); END;
CREATE TRIGGER IF NOT EXISTS immut_campaign_source_query_link_delete BEFORE DELETE ON campaign_source_query_links
 BEGIN SELECT RAISE(ABORT,'source query lineage immutable'); END;

CREATE TABLE IF NOT EXISTS campaign_identity_quarantine (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, revision INTEGER NOT NULL,
 record_kind TEXT NOT NULL, record_id TEXT NOT NULL, reason TEXT NOT NULL,
 expected_hash TEXT NOT NULL, observed_hash TEXT NOT NULL DEFAULT '',
 detail TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL,
 UNIQUE(campaign_id,revision,record_kind,record_id,reason));
CREATE INDEX IF NOT EXISTS ix_identity_quarantine_campaign ON campaign_identity_quarantine(campaign_id,revision,created DESC);
CREATE INDEX IF NOT EXISTS ix_identity_quarantine_record ON campaign_identity_quarantine(campaign_id,revision,record_kind,record_id);
CREATE TRIGGER IF NOT EXISTS immut_campaign_quarantine_update BEFORE UPDATE ON campaign_identity_quarantine
 BEGIN SELECT RAISE(ABORT,'identity quarantine audit immutable'); END;
CREATE TRIGGER IF NOT EXISTS immut_campaign_quarantine_delete BEFORE DELETE ON campaign_identity_quarantine
 BEGIN SELECT RAISE(ABORT,'identity quarantine audit immutable'); END;

"""


def _migrate_identity_v16(db):
    """Legacy data is evidence of past DB state, NEVER fabricated HTTP submissions.

    Idempotent if the process stops between CREATE TABLE and user_version change.
    Bounded cursor pages for historical campaigns and revisions. Original stored
    strings of previously reviewed versions win over mutable current summaries.
    """
    import time
    from .identity import original_hash, interpretation_hash
    db.executescript(IDENTITY_V16)
    after = ''
    while True:
        rows = db.execute("""SELECT id,field_id,invention_id,question,claim,mechanism,novel_delta,revision,created
            FROM research_campaigns WHERE id>? ORDER BY id LIMIT 64""", (after,)).fetchall()
        if not rows:
            break
        for c in rows:
            cid = c['id']
            base = db.execute("""SELECT question,claim,mechanism,novel_delta,created
                FROM campaign_revisions WHERE campaign_id=? AND revision=1""", (cid,)).fetchone()
            q,claim,mechanism,delta = ((base['question'],base['claim'],base['mechanism'],base['novel_delta'])
                if base else (c['question'],c['claim'],c['mechanism'],c['novel_delta']))
            kind = 'LEGACY_ARENA_RECONSTRUCTED' if c['invention_id'] else 'LEGACY_RECONSTRUCTED'
            original = original_hash(cid,c['field_id'],q,claim,mechanism,delta,c['invention_id'])
            db.execute("""INSERT OR IGNORE INTO campaign_directives
                (campaign_id,capture_kind,raw_http_body,raw_http_sha256,
                original_field_id,original_question,original_claim,original_mechanism,
                original_novel_delta,original_invention_id,original_sha256,created)
                VALUES(?,?,NULL,NULL,?,?,?,?,?,?,?,?)""",
                (cid,kind,c['field_id'],q,claim,mechanism,delta,c['invention_id'],original,
                 base['created'] if base else c['created']))
            last = 0
            while True:
                versions = db.execute("""SELECT revision,question,claim,mechanism,novel_delta,reason,created
                    FROM campaign_revisions WHERE campaign_id=? AND revision>? ORDER BY revision LIMIT 64""",
                    (cid,last)).fetchall()
                if not versions:
                    break
                for v in versions:
                    ih=interpretation_hash(cid,v['revision'],original,v['question'],v['claim'],v['mechanism'],v['novel_delta'])
                    db.execute("""INSERT OR IGNORE INTO campaign_interpretations
                        (campaign_id,revision,directive_sha256,question,claim,mechanism,
                         novel_delta,interpretation_sha256,reason,authority,created)
                        VALUES(?,?,?,?,?,?,?,?,?,'LEGACY_RECONSTRUCTED',?)""",
                        (cid,v['revision'],original,v['question'],v['claim'],v['mechanism'],
                         v['novel_delta'],ih,v['reason'],v['created']))
                    last=v['revision']
            if not db.execute("SELECT 1 FROM campaign_interpretations WHERE campaign_id=? AND revision=?",(cid,c['revision'])).fetchone():
                ih=interpretation_hash(cid,c['revision'],original,c['question'],c['claim'],c['mechanism'],c['novel_delta'])
                db.execute("""INSERT INTO campaign_interpretations
                    (campaign_id,revision,directive_sha256,question,claim,mechanism,
                     novel_delta,interpretation_sha256,reason,authority,created)
                    VALUES(?,?,?,?,?,?,?,?,?,'LEGACY_RECONSTRUCTED',?)""",
                    (cid,c['revision'],original,c['question'],c['claim'],c['mechanism'],c['novel_delta'],ih,
                     'No original HTTP bytes; reconstructed from the stored campaign version',c['created']))
            active = db.execute("""SELECT * FROM campaign_interpretations WHERE campaign_id=? AND revision=?""",
                                (cid,c['revision'])).fetchone()
            if (q != c['question'] or c['field_id'] != db.execute('SELECT original_field_id FROM campaign_directives WHERE campaign_id=?',(cid,)).fetchone()[0]
                    or any(c[k] != active[k] for k in ('question','claim','mechanism','novel_delta'))):
                reason='LEGACY_CURRENT_OBJECTIVE_OR_INTERPRETATION_MISMATCH'
                eid=__import__('hashlib').sha256((cid+':'+str(c['revision'])+':'+reason).encode()).hexdigest()[:32]
                db.execute("""INSERT OR IGNORE INTO campaign_identity_quarantine
                    (id,campaign_id,revision,record_kind,record_id,reason,expected_hash,observed_hash,detail,created)
                    VALUES(?,?,?,'CAMPAIGN_CURRENT',?,?,?,?,'{}',?)""",
                    (eid,cid,c['revision'],cid,reason,original,active['interpretation_sha256'],time.time()))
                db.execute('UPDATE campaign_runtime SET paused=1,blocker=? WHERE campaign_id=?',
                           ('Objective/interpretation mismatch quarantined; audited human review required',cid))
                # Historical memberships stay byte-for-byte; exclude from current scientific dossier.
                db.execute("""INSERT OR IGNORE INTO campaign_identity_quarantine
                    (id,campaign_id,revision,record_kind,record_id,reason,expected_hash,observed_hash,detail,created)
                    SELECT lower(hex(randomblob(16))),?,?, 'SOURCE_MEMBERSHIP',source_id,?,?,?,'{}',?
                    FROM campaign_source_revisions WHERE campaign_id=? AND revision=?""",
                    (cid,c['revision'],reason,original,active['interpretation_sha256'],time.time(),cid,c['revision']))
        after=rows[-1]['id']
    # No inferred original user bytes for old tasks. Their identity is derived
    # from the specific archived campaign interpretation, never a new user claim.
    db.execute("""INSERT OR IGNORE INTO campaign_task_identities
        (task_id,campaign_id,revision,directive_sha256,interpretation_sha256,origin,created)
        SELECT t.id,t.campaign_id,t.revision,i.directive_sha256,i.interpretation_sha256,
        'LEGACY_RECONSTRUCTED',t.created FROM campaign_tasks t JOIN campaign_interpretations i
        ON i.campaign_id=t.campaign_id AND i.revision=t.revision""")
    db.execute('PRAGMA user_version=16')
    db.commit()


def migrate(db):
    """Run only missing schema steps, never overwrite existing rows or higher versions."""
    current = db.execute("PRAGMA user_version").fetchone()[0]
    for version, sql in ((1, SCIENCE_V1), (2, SCIENCE_V2), (3, SCIENCE_V3), (4, SCIENCE_V4), (5, SCIENCE_V5), (6, WORLD_V6), (7, WORLD_V7), (8, MAINTENANCE_V8), (9, COLD_ARENA_V9), (10, GOVERNANCE_V10), (11, CAMPAIGN_WORKERS_V11), (12, MOBILIZATION_V12), (13, SCHEDULER_V13)):
        if current < version:
            db.executescript(sql)
            db.execute(f"PRAGMA user_version={version}")
            db.commit()
    if current < 14:
        _migrate_review_v14(db)
    if current < 15:
        db.executescript(CLAIM_TYPES_V15)
        db.execute('PRAGMA user_version=15')
        db.commit()
    if current < 16:
        _migrate_identity_v16(db)
    # C3.4: scope-specific prerequisite and original-job rule ballots. Existing
    # amendment #003, its observation/risk/history and older governance rows stay intact.
    if current < 17:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS ui_jobs(
          amendment_id INTEGER PRIMARY KEY REFERENCES system_amendments(id),
          original_sha256 TEXT NOT NULL, artifact_sha256 TEXT, status TEXT NOT NULL,
          blocker TEXT NOT NULL DEFAULT '', evidence_sha256 TEXT, requested REAL NOT NULL,
          started REAL, finished REAL, heartbeat REAL);
        CREATE TABLE IF NOT EXISTS ui_job_events(
          id INTEGER PRIMARY KEY, amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          stage TEXT NOT NULL, actor_id TEXT NOT NULL, summary TEXT NOT NULL,
          evidence_sha256 TEXT, created REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_ui_job_events_parent ON ui_job_events(amendment_id,id DESC);
        CREATE TABLE IF NOT EXISTS ui_vote_rounds(
          id INTEGER PRIMARY KEY, amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          scope TEXT NOT NULL CHECK(scope IN ('CAPABILITY_PREREQUISITE','ORIGINAL_USER_PROPOSAL_003')),
          evidence_sha256 TEXT NOT NULL, approved INTEGER NOT NULL CHECK(approved IN (0,1)),
          quorum TEXT NOT NULL, created REAL NOT NULL, UNIQUE(amendment_id,scope,evidence_sha256));
        CREATE TABLE IF NOT EXISTS ui_reviews(
          id INTEGER PRIMARY KEY, round_id INTEGER NOT NULL REFERENCES ui_vote_rounds(id),
          agent_id TEXT NOT NULL REFERENCES agents(id), dimension TEXT NOT NULL,
          verdict TEXT NOT NULL, finding TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
          created REAL NOT NULL, UNIQUE(round_id,agent_id));
        CREATE TABLE IF NOT EXISTS ui_ballots(
          id INTEGER PRIMARY KEY, round_id INTEGER NOT NULL REFERENCES ui_vote_rounds(id),
          agent_id TEXT NOT NULL REFERENCES agents(id), stance TEXT NOT NULL,
          rule_version TEXT NOT NULL, reason TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
          created REAL NOT NULL, UNIQUE(round_id,agent_id));
        CREATE INDEX IF NOT EXISTS ix_ui_ballots_round ON ui_ballots(round_id,agent_id);
        """)
        db.execute('PRAGMA user_version=17')
        db.commit()
    # C3.45: additive, reversible user directive scheduling overlay. This table
    # stores ONE authorized focus and the physical mobilization modes to restore.
    # It never changes existing campaign identity or any review/safety decision.
    if current < 18:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS campaign_exclusive_focus(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          campaign_id TEXT NOT NULL REFERENCES research_campaigns(id),
          directive_sha256 TEXT NOT NULL CHECK(length(directive_sha256)=64),
          raw_http_sha256 TEXT NOT NULL CHECK(length(raw_http_sha256)=64),
          revision INTEGER NOT NULL CHECK(revision>=1),
          interpretation_sha256 TEXT NOT NULL CHECK(length(interpretation_sha256)=64),
          prior_target_level TEXT NOT NULL CHECK(prior_target_level IN ('NORMAL','PRIORITY','FULL_MOBILIZATION')),
          prior_target_primary INTEGER NOT NULL CHECK(prior_target_primary IN (0,1)),
          prior_other_campaign_id TEXT REFERENCES research_campaigns(id),
          prior_other_level TEXT CHECK(prior_other_level IN ('PRIORITY','FULL_MOBILIZATION')),
          prior_other_revision INTEGER,
          prior_other_directive_sha256 TEXT,
          active INTEGER NOT NULL CHECK(active IN (0,1)),
          requested_at REAL NOT NULL,
          changed_at REAL NOT NULL,
          reason TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS campaign_exclusive_events(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id TEXT NOT NULL REFERENCES research_campaigns(id),
          directive_sha256 TEXT NOT NULL,
          revision INTEGER NOT NULL,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          detail TEXT NOT NULL,
          created REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_exclusive_events_campaign ON campaign_exclusive_events(campaign_id,id DESC);
        """)
        db.execute('PRAGMA user_version=18')
        db.commit()
    # SYSTEM work is a durable user-directed job, not a UI-only #003 exception.
    # The original amendment row and its DRAFT_ONLY history are never rewritten
    # by this migration; reports/votes require separate, evidence-linked rows.
    if current < 19:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS system_jobs(
          amendment_id INTEGER PRIMARY KEY REFERENCES system_amendments(id),
          observation_sha256 TEXT NOT NULL CHECK(length(observation_sha256)=64),
          request_sha256 TEXT NOT NULL DEFAULT '', origin TEXT NOT NULL,
          is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
          status TEXT NOT NULL DEFAULT 'READY', capability TEXT NOT NULL DEFAULT '',
          blocker TEXT NOT NULL DEFAULT '', human_action_required TEXT NOT NULL DEFAULT '',
          input_sha256 TEXT NOT NULL DEFAULT '', evidence_sha256 TEXT NOT NULL DEFAULT '',
          attempts INTEGER NOT NULL DEFAULT 0, requested REAL NOT NULL,
          started REAL, heartbeat REAL NOT NULL, finished REAL);
        CREATE UNIQUE INDEX IF NOT EXISTS ix_system_primary ON system_jobs(is_primary) WHERE is_primary=1;
        CREATE INDEX IF NOT EXISTS ix_system_jobs_ready ON system_jobs(status,is_primary,heartbeat);
        CREATE TABLE IF NOT EXISTS system_job_events(
          id INTEGER PRIMARY KEY AUTOINCREMENT, amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          stage TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}',
          evidence_sha256 TEXT NOT NULL DEFAULT '', created REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_system_job_events ON system_job_events(amendment_id,id DESC);
        CREATE TABLE IF NOT EXISTS system_job_evidence(
          id INTEGER PRIMARY KEY AUTOINCREMENT, amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          kind TEXT NOT NULL, sha256 TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL,
          UNIQUE(amendment_id,kind,sha256));
        CREATE INDEX IF NOT EXISTS ix_system_job_evidence ON system_job_evidence(amendment_id,id DESC);
        CREATE TABLE IF NOT EXISTS system_vote_rounds(
          id INTEGER PRIMARY KEY AUTOINCREMENT, amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          scope TEXT NOT NULL CHECK(scope IN ('CAPABILITY_PREREQUISITE','USER_OBJECTIVE')),
          evidence_sha256 TEXT NOT NULL, quorum_met INTEGER NOT NULL CHECK(quorum_met IN (0,1)),
          rule_version TEXT NOT NULL, limitation TEXT NOT NULL, created REAL NOT NULL,
          UNIQUE(amendment_id,scope,evidence_sha256));
        CREATE TABLE IF NOT EXISTS system_rule_ballots(
          id INTEGER PRIMARY KEY AUTOINCREMENT, round_id INTEGER NOT NULL REFERENCES system_vote_rounds(id),
          agent_id TEXT NOT NULL REFERENCES agents(id), dimension TEXT NOT NULL,
          stance TEXT NOT NULL, reason TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
          created REAL NOT NULL, UNIQUE(round_id,agent_id));
        CREATE INDEX IF NOT EXISTS ix_system_rule_ballots ON system_rule_ballots(round_id);
        CREATE TABLE IF NOT EXISTS problem_jobs(
          problem_id INTEGER PRIMARY KEY REFERENCES problems(id), target TEXT NOT NULL
             CHECK(target IN ('ARENA','SYSTEM')),
          field_id TEXT NOT NULL DEFAULT '', amendment_id INTEGER REFERENCES system_amendments(id),
          invention_id TEXT REFERENCES inventions(id), status TEXT NOT NULL,
          blocker TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0,
          created REAL NOT NULL, started REAL, heartbeat REAL NOT NULL, finished REAL);
        CREATE INDEX IF NOT EXISTS ix_problem_jobs_status ON problem_jobs(status,created DESC);
        """)
        db.execute('PRAGMA user_version=19')
        db.commit()
    # v20 is additive: missing technical capability is durable CHILD engineering
    # work, never an inert terminal label on the parent. Preserve all old rows.
    if current < 20:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS system_engineering_children (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          objective_sha256 TEXT NOT NULL CHECK(length(objective_sha256)=64),
          capability_key TEXT NOT NULL,
          assigned_agent_id TEXT NOT NULL REFERENCES agents(id),
          phase TEXT NOT NULL DEFAULT 'DISCOVER',
          status TEXT NOT NULL DEFAULT 'READY',
          candidate_spec TEXT NOT NULL DEFAULT '{}',
          candidate_sha256 TEXT NOT NULL DEFAULT '',
          test_sha256 TEXT NOT NULL DEFAULT '',
          source_sha256 TEXT NOT NULL DEFAULT '',
          policy_sha256 TEXT NOT NULL DEFAULT '',
          tool_id TEXT NOT NULL DEFAULT '',
          attempts INTEGER NOT NULL DEFAULT 0,
          next_due REAL NOT NULL DEFAULT 0,
          started REAL,
          heartbeat REAL NOT NULL,
          finished REAL,
          detail TEXT NOT NULL DEFAULT '',
          created REAL NOT NULL,
          updated REAL NOT NULL,
          UNIQUE(parent_amendment_id,capability_key));
        CREATE INDEX IF NOT EXISTS ix_system_engineering_due
          ON system_engineering_children(status,next_due,parent_amendment_id);
        CREATE TABLE IF NOT EXISTS system_engineering_steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL REFERENCES system_engineering_children(id),
          stage TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          evidence_sha256 TEXT NOT NULL,
          detail TEXT NOT NULL,
          created REAL NOT NULL,
          UNIQUE(child_id,stage,evidence_sha256));
        CREATE INDEX IF NOT EXISTS ix_system_engineering_steps
          ON system_engineering_steps(child_id,id DESC);
        CREATE TABLE IF NOT EXISTS system_engineering_reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          child_id INTEGER NOT NULL REFERENCES system_engineering_children(id),
          candidate_sha256 TEXT NOT NULL,
          test_sha256 TEXT NOT NULL,
          actor_id TEXT NOT NULL CHECK(actor_id='LOCAL_POLICY_ENGINE'),
          dimension TEXT NOT NULL,
          verdict TEXT NOT NULL CHECK(verdict IN ('PASS','FAIL')),
          reason TEXT NOT NULL,
          created REAL NOT NULL,
          UNIQUE(child_id,candidate_sha256,test_sha256,actor_id,dimension));
        CREATE INDEX IF NOT EXISTS ix_system_engineering_reviews
          ON system_engineering_reviews(child_id,candidate_sha256);
        CREATE INDEX IF NOT EXISTS ix_campaign_tasks_agent_work_recall
          ON campaign_tasks(agent_id,created DESC,id DESC);
        """)
        db.execute('PRAGMA user_version=20')
        db.commit()
    # v21: guided Pandora missions + generic engineering ballots/deployment records.
    if current < 21:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS guided_research(
          campaign_id TEXT PRIMARY KEY REFERENCES research_campaigns(id),
          revision INTEGER NOT NULL,
          directive_text TEXT NOT NULL,
          directive_sha256 TEXT NOT NULL CHECK(length(directive_sha256)=64),
          mode TEXT NOT NULL CHECK(mode IN ('RESEARCH','SYSTEM_RESEARCH')),
          system_amendment_id INTEGER REFERENCES system_amendments(id),
          status TEXT NOT NULL CHECK(status IN ('ACTIVE','SATURATED','PAUSED','COMPLETE')),
          all_agents INTEGER NOT NULL DEFAULT 1 CHECK(all_agents IN (0,1)),
          adjacent INTEGER NOT NULL DEFAULT 1 CHECK(adjacent IN (0,1)),
          experiment_gate INTEGER NOT NULL DEFAULT 1 CHECK(experiment_gate IN (0,1)),
          min_waves INTEGER NOT NULL DEFAULT 3,
          max_waves INTEGER NOT NULL DEFAULT 6,
          wave INTEGER NOT NULL DEFAULT 1,
          stagnant_waves INTEGER NOT NULL DEFAULT 0,
          last_source_count INTEGER NOT NULL DEFAULT 0,
          prior_arena_running INTEGER NOT NULL DEFAULT 0 CHECK(prior_arena_running IN (0,1)),
          created REAL NOT NULL,
          updated REAL NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ix_guided_one_active ON guided_research(status) WHERE status='ACTIVE';
        CREATE TABLE IF NOT EXISTS guided_research_waves(
          campaign_id TEXT NOT NULL REFERENCES research_campaigns(id),
          revision INTEGER NOT NULL,
          wave INTEGER NOT NULL,
          source_before INTEGER NOT NULL,
          source_after INTEGER NOT NULL,
          new_sources INTEGER NOT NULL,
          tasks_total INTEGER NOT NULL,
          tasks_done INTEGER NOT NULL,
          tasks_blocked INTEGER NOT NULL,
          reflection TEXT NOT NULL,
          created REAL NOT NULL,
          PRIMARY KEY(campaign_id,revision,wave)
        );
        CREATE TABLE IF NOT EXISTS system_candidate_votes(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          child_id INTEGER NOT NULL REFERENCES system_engineering_children(id),
          candidate_sha256 TEXT NOT NULL,
          round_no INTEGER NOT NULL,
          agent_id TEXT NOT NULL REFERENCES agents(id),
          dimension TEXT NOT NULL,
          stance TEXT NOT NULL CHECK(stance IN ('APPROVE','REJECT','ABSTAIN')),
          reason TEXT NOT NULL,
          evidence_sha256 TEXT NOT NULL,
          created REAL NOT NULL,
          UNIQUE(child_id,candidate_sha256,round_no,agent_id)
        );
        CREATE INDEX IF NOT EXISTS ix_system_candidate_votes ON system_candidate_votes(child_id,candidate_sha256,round_no);
        CREATE TABLE IF NOT EXISTS system_generic_deployments(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          child_id INTEGER NOT NULL REFERENCES system_engineering_children(id),
          candidate_sha256 TEXT NOT NULL,
          manifest_sha256 TEXT NOT NULL,
          status TEXT NOT NULL,
          detail TEXT NOT NULL DEFAULT '{}',
          created REAL NOT NULL,
          updated REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_system_generic_deployments ON system_generic_deployments(amendment_id,id DESC);
        """)
        db.execute('PRAGMA user_version=21')
        db.commit()
    # v22: Pandora state compiler / MIPU-MAP-SPC surviving-memory layer.
    # Additive only: old campaigns, raw events and user data remain intact.
    if current < 22:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS pandora_state_snapshots(
          id INTEGER PRIMARY KEY AUTOINCREMENT, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
          state_hash TEXT NOT NULL, state_json TEXT NOT NULL, created REAL NOT NULL,
          UNIQUE(scope_type,scope_id,state_hash));
        CREATE INDEX IF NOT EXISTS ix_pandora_state_snapshots ON pandora_state_snapshots(scope_type,scope_id,id DESC);
        CREATE TABLE IF NOT EXISTS pandora_state_deltas(
          id INTEGER PRIMARY KEY AUTOINCREMENT, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
          kind TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 50, fingerprint TEXT NOT NULL UNIQUE,
          before_hash TEXT NOT NULL DEFAULT '', after_hash TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL, rationale TEXT NOT NULL DEFAULT '', consequence TEXT NOT NULL DEFAULT '',
          evidence TEXT NOT NULL DEFAULT '[]', actor_id TEXT NOT NULL DEFAULT '', created REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_pandora_state_deltas_scope ON pandora_state_deltas(scope_type,scope_id,priority DESC,created DESC);
        CREATE TABLE IF NOT EXISTS pandora_research_memory(
          id INTEGER PRIMARY KEY AUTOINCREMENT, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
          topic_key TEXT NOT NULL, status TEXT NOT NULL, statement TEXT NOT NULL, rationale TEXT NOT NULL DEFAULT '',
          evidence TEXT NOT NULL DEFAULT '[]', reopening_condition TEXT NOT NULL DEFAULT '', generator_key TEXT NOT NULL DEFAULT '',
          created REAL NOT NULL, updated REAL NOT NULL, UNIQUE(scope_type,scope_id,topic_key));
        CREATE INDEX IF NOT EXISTS ix_pandora_memory_scope ON pandora_research_memory(scope_type,scope_id,status,updated DESC);
        CREATE TABLE IF NOT EXISTS pandora_assets(
          id TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL, kind TEXT NOT NULL,
          label TEXT NOT NULL, path TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'READY',
          provenance TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL, updated REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_pandora_assets_scope ON pandora_assets(scope_type,scope_id,updated DESC);
        CREATE TABLE IF NOT EXISTS engineering_failure_cases(
          id INTEGER PRIMARY KEY AUTOINCREMENT, amendment_id INTEGER NOT NULL REFERENCES system_amendments(id),
          child_id INTEGER NOT NULL REFERENCES system_engineering_children(id), fingerprint TEXT NOT NULL,
          gate_name TEXT NOT NULL, failure_ids TEXT NOT NULL DEFAULT '[]', failure_paths TEXT NOT NULL DEFAULT '[]',
          causal_hypothesis TEXT NOT NULL DEFAULT '', repair_family TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
          status TEXT NOT NULL DEFAULT 'OPEN', attempts INTEGER NOT NULL DEFAULT 1, first_seen REAL NOT NULL,
          last_seen REAL NOT NULL, detail TEXT NOT NULL DEFAULT '{}',
          UNIQUE(child_id,fingerprint));
        CREATE INDEX IF NOT EXISTS ix_failure_cases_parent ON engineering_failure_cases(amendment_id,last_seen DESC);
        """)
        db.execute('PRAGMA user_version=22')
        db.commit()
    # v23: SYSTEM discovery-to-engineering missions are a first-class guided mode.
    # SQLite CHECK constraints require a table rebuild; all rows are copied byte-for-byte
    # across the same columns before the old table is dropped.
    if current < 23:
        db.executescript("""
        DROP INDEX IF EXISTS ix_guided_one_active;
        ALTER TABLE guided_research RENAME TO guided_research_v22_old;
        CREATE TABLE guided_research(
          campaign_id TEXT PRIMARY KEY REFERENCES research_campaigns(id),
          revision INTEGER NOT NULL,
          directive_text TEXT NOT NULL,
          directive_sha256 TEXT NOT NULL CHECK(length(directive_sha256)=64),
          mode TEXT NOT NULL CHECK(mode IN ('RESEARCH','SYSTEM_RESEARCH','SYSTEM_DISCOVERY')),
          system_amendment_id INTEGER REFERENCES system_amendments(id),
          status TEXT NOT NULL CHECK(status IN ('ACTIVE','SATURATED','PAUSED','COMPLETE')),
          all_agents INTEGER NOT NULL DEFAULT 1 CHECK(all_agents IN (0,1)),
          adjacent INTEGER NOT NULL DEFAULT 1 CHECK(adjacent IN (0,1)),
          experiment_gate INTEGER NOT NULL DEFAULT 1 CHECK(experiment_gate IN (0,1)),
          min_waves INTEGER NOT NULL DEFAULT 3,
          max_waves INTEGER NOT NULL DEFAULT 6,
          wave INTEGER NOT NULL DEFAULT 1,
          stagnant_waves INTEGER NOT NULL DEFAULT 0,
          last_source_count INTEGER NOT NULL DEFAULT 0,
          prior_arena_running INTEGER NOT NULL DEFAULT 0 CHECK(prior_arena_running IN (0,1)),
          created REAL NOT NULL,
          updated REAL NOT NULL
        );
        INSERT INTO guided_research(
          campaign_id,revision,directive_text,directive_sha256,mode,system_amendment_id,status,
          all_agents,adjacent,experiment_gate,min_waves,max_waves,wave,stagnant_waves,
          last_source_count,prior_arena_running,created,updated)
        SELECT campaign_id,revision,directive_text,directive_sha256,mode,system_amendment_id,status,
          all_agents,adjacent,experiment_gate,min_waves,max_waves,wave,stagnant_waves,
          last_source_count,prior_arena_running,created,updated
        FROM guided_research_v22_old;
        DROP TABLE guided_research_v22_old;
        CREATE UNIQUE INDEX IF NOT EXISTS ix_guided_one_active ON guided_research(status) WHERE status='ACTIVE';
        """)
        db.execute('PRAGMA user_version=23')
        db.commit()
    # v24: GitHub workspace. Purely additive: project registry, operation log,
    # batch staging records and the human-attention queue. No existing row changes.
    if current < 24:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS github_projects(
          key TEXT PRIMARY KEY, owner TEXT NOT NULL, repo TEXT NOT NULL, path TEXT NOT NULL,
          project_id TEXT NOT NULL, name TEXT NOT NULL, protocol TEXT NOT NULL DEFAULT '', version TEXT NOT NULL DEFAULT '',
          manifest_path TEXT NOT NULL, manifest_sha TEXT, commit_sha TEXT, manifest TEXT NOT NULL DEFAULT '{}',
          mode TEXT NOT NULL DEFAULT 'READ_BRANCH_PR' CHECK(mode IN ('READ_ONLY','READ_PROPOSE','READ_BRANCH_PR','OWNER_AUTONOMOUS')),
          status TEXT NOT NULL DEFAULT 'DISCOVERED', discovered REAL NOT NULL, updated REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_github_projects_repo ON github_projects(owner,repo);
        CREATE TABLE IF NOT EXISTS github_activity(
          id INTEGER PRIMARY KEY, ts REAL NOT NULL, project_key TEXT NOT NULL DEFAULT '', repo TEXT NOT NULL DEFAULT '',
          op TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OK', summary TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}',
          actor TEXT NOT NULL DEFAULT 'user');
        CREATE INDEX IF NOT EXISTS ix_github_activity_project ON github_activity(project_key,id DESC);
        CREATE TABLE IF NOT EXISTS github_batches(
          id TEXT PRIMARY KEY, project_key TEXT NOT NULL, mission_id TEXT NOT NULL DEFAULT '', base_sha TEXT NOT NULL,
          branch TEXT, status TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '{}', commit_sha TEXT, pr_number INTEGER,
          pr_url TEXT, created REAL NOT NULL, updated REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_github_batches_project ON github_batches(project_key,updated DESC);
        CREATE TABLE IF NOT EXISTS github_attention(
          id INTEGER PRIMARY KEY, project_key TEXT NOT NULL, batch_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
          title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'OPEN', resolution TEXT,
          created REAL NOT NULL, updated REAL NOT NULL);
        CREATE INDEX IF NOT EXISTS ix_github_attention_open ON github_attention(project_key,status,id DESC);
        """)
        db.execute('PRAGMA user_version=24')
        db.commit()
    return db.execute("PRAGMA user_version").fetchone()[0]
