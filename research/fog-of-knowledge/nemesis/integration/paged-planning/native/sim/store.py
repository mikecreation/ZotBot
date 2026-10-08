"""SQLite persistence. Zero-config, zero-dependency, zero dollars."""
from __future__ import annotations
import json, os, sqlite3, threading, time, zlib
from .migrations import migrate

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "arena.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS agents(
  id TEXT PRIMARY KEY, field_id TEXT, role TEXT, name TEXT, title TEXT,
  credits REAL, reputation REAL, elo REAL, wins INTEGER, losses INTEGER,
  streak INTEGER, rank TEXT, benefits TEXT, stats TEXT, updated REAL);
CREATE TABLE IF NOT EXISTS inventions(
  id TEXT PRIMARY KEY, cycle INTEGER, field_id TEXT, scientist_id TEXT, destroyer_id TEXT,
  title TEXT, thesis TEXT, mechanism TEXT, rigor TEXT,
  novelty REAL, feasibility REAL, impact REAL, award REAL,
  verdict TEXT, critique TEXT, attack_type TEXT, fix TEXT, refs TEXT,
  problem TEXT, llm INTEGER, created REAL);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, cycle INTEGER, ts REAL, kind TEXT,
  field_id TEXT, agent_id TEXT, text TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, value TEXT, ts REAL);
CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS problems(
  id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, field_id TEXT, source TEXT, used INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_events_cycle ON events(cycle);
CREATE INDEX IF NOT EXISTS ix_inv_field ON inventions(field_id);
"""


class Store:
    def __init__(self, path: str = DB_PATH):
        if os.path.dirname(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
        self.path = path
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        # Bounded SQLite page cache; disk history must never turn into proportional RAM.
        self.db.execute("PRAGMA cache_size=-8192")  # KiB, approx 8 MiB per connection.
        self.db.execute("PRAGMA temp_store=FILE")    # large indexed sorts spill to disk.
        self.db.execute("PRAGMA busy_timeout=3000")
        self.lock = threading.RLock()
        with self.lock:
            self.db.executescript(SCHEMA)
            self.db.commit()
            self.schema_version = migrate(self.db)

    def query(self, sql: str, params=()):
        """Bounded read helpers; callers supply LIMIT for growing tables."""
        with self.lock:
            return [dict(r) for r in self.db.execute(sql, params).fetchall()]

    def one(self, sql: str, params=()):
        with self.lock:
            r = self.db.execute(sql, params).fetchone()
            return dict(r) if r else None

    def execute(self, sql: str, params=()):
        with self.lock, self.db:
            return self.db.execute(sql, params).rowcount

    # ------------------------------------------------------------------ kv
    def kv_get(self, k, default=None):
        with self.lock:
            r = self.db.execute("SELECT value FROM kv WHERE key=?", (k,)).fetchone()
        return json.loads(r["value"]) if r else default

    def kv_set(self, k, v):
        with self.lock:
            self.db.execute("INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                            (k, json.dumps(v)))
            self.db.commit()

    # --------------------------------------------------------------- cache
    def cache_get(self, key, ttl=86400.0):
        with self.lock:
            r = self.db.execute("SELECT value,ts FROM cache WHERE key=?", (key,)).fetchone()
        if not r:
            return None
        if time.time() - r["ts"] > ttl:
            return None
        try:
            return json.loads(r["value"])
        except Exception:
            return None

    def cache_set(self, key, value):
        with self.lock:
            self.db.execute("INSERT INTO cache(key,value,ts) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, ts=excluded.ts",
                            (key, json.dumps(value), time.time()))
            self.db.commit()

    def cache_clear(self):
        with self.lock:
            self.db.execute("DELETE FROM cache")
            self.db.commit()

    def cache_prune(self, max_age_days=7, limit=1000):
        """Compact expired *request cache* only; canonical source objects remain."""
        with self.lock, self.db:
            cur = self.db.execute("DELETE FROM cache WHERE key IN (SELECT key FROM cache WHERE ts<? ORDER BY ts LIMIT ?)",
                                  (time.time()-max_age_days*86400, min(max(1,int(limit)),1000)))
            return cur.rowcount

    # -------------------------------------------------------------- events
    def add_event(self, cycle, kind, text, field_id="", agent_id="", data=None):
        with self.lock:
            cursor = self.db.execute("INSERT INTO events(cycle,ts,kind,field_id,agent_id,text,data) VALUES(?,?,?,?,?,?,?)",
                                     (cycle, time.time(), kind, field_id, agent_id, text, json.dumps(data or {})))
            self.db.commit()
            return cursor.lastrowid

    def events(self, limit=200, after=0):
        with self.lock:
            rows = self.db.execute(
                "SELECT * FROM events WHERE id>? ORDER BY id DESC LIMIT ?", (after, limit)).fetchall()
        return [dict(r) for r in rows][::-1]

    def prune_events(self, keep=4000):
        """Cold-compress old *complete* event rows; never delete history without an archive.

        The legacy implementation silently discarded everything outside 4000 rows.
        Each bounded batch is inserted and removed in ONE transaction. Cold archive
        pages remain available via archived_events() with all original text/data.
        """
        keep=max(100,min(100000,int(keep)))
        with self.lock,self.db:
            cutoff=self.db.execute("SELECT id FROM events ORDER BY id DESC LIMIT 1 OFFSET ?",(keep-1,)).fetchone()
            if not cutoff:
                return 0
            rows=self.db.execute("SELECT * FROM events WHERE id<? ORDER BY id LIMIT 500",(cutoff["id"],)).fetchall()
            if not rows:
                return 0
            original=[dict(r) for r in rows]
            packed=zlib.compress(json.dumps(original,ensure_ascii=False,separators=(',',':')).encode('utf-8'),6)
            self.db.execute("INSERT INTO arena_event_archive(start_id,end_id,n,payload,created) VALUES(?,?,?,?,?)",
                            (original[0]['id'],original[-1]['id'],len(original),packed,time.time()))
            self.db.execute("DELETE FROM events WHERE id>=? AND id<=?",(original[0]['id'],original[-1]['id']))
            return len(original)

    def archived_events(self,before=0,limit=100):
        """Return one bounded cold-history page in ascending id order."""
        limit=min(max(1,int(limit)),200)
        with self.lock:
            batches=self.db.execute("SELECT payload FROM arena_event_archive WHERE start_id<? ORDER BY end_id DESC LIMIT 3",
                                    (int(before) if before else 2**62,)).fetchall()
        rows=[]
        for batch in batches:
            rows.extend(json.loads(zlib.decompress(batch['payload'])))
            if len(rows)>limit+500:
                break
        rows=[r for r in rows if not before or r['id']<before]
        rows.sort(key=lambda r:r['id'])
        return rows[-limit:]

    # ---------------------------------------------------------- inventions
    def save_invention(self, inv: dict):
        with self.lock:
            self.db.execute("""INSERT INTO inventions(id,cycle,field_id,scientist_id,destroyer_id,title,thesis,mechanism,rigor,
                novelty,feasibility,impact,award,verdict,critique,attack_type,fix,refs,problem,llm,created)
                VALUES(:id,:cycle,:field_id,:scientist_id,:destroyer_id,:title,:thesis,:mechanism,:rigor,
                :novelty,:feasibility,:impact,:award,:verdict,:critique,:attack_type,:fix,:refs,:problem,:llm,:created)
                ON CONFLICT(id) DO UPDATE SET verdict=excluded.verdict, critique=excluded.critique,
                attack_type=excluded.attack_type, fix=excluded.fix, award=excluded.award,
                novelty=excluded.novelty, feasibility=excluded.feasibility, impact=excluded.impact,
                title=excluded.title, thesis=excluded.thesis, mechanism=excluded.mechanism, llm=excluded.llm""", inv)
            self.db.commit()

    def inventions(self, limit=200, field_id=None, verdict=None):
        q = "SELECT * FROM inventions WHERE 1=1"
        args = []
        if field_id:
            q += " AND field_id=?"; args.append(field_id)
        if verdict:
            q += " AND verdict=?"; args.append(verdict)
        q += " ORDER BY cycle DESC, created DESC LIMIT ?"
        args.append(limit)
        with self.lock:
            rows = self.db.execute(q, args).fetchall()
        return [dict(r) for r in rows]

    def invention(self, iid):
        with self.lock:
            r = self.db.execute("SELECT * FROM inventions WHERE id=?", (iid,)).fetchone()
        return dict(r) if r else None

    def invention_summaries(self, limit=60):
        """Lean archive listing; refs/validation dossier only fetched on demand."""
        return self.query("""SELECT id,cycle,field_id,scientist_id,destroyer_id,title,novelty,feasibility,award,verdict,llm,created
            FROM inventions ORDER BY created DESC LIMIT ?""",(min(max(1,int(limit)),100),))

    # -------------------------------------------------------------- agents
    def save_agent(self, a: dict):
        with self.lock:
            self.db.execute("""INSERT INTO agents(id,field_id,role,name,title,credits,reputation,elo,wins,losses,streak,rank,benefits,stats,updated)
                VALUES(:id,:field_id,:role,:name,:title,:credits,:reputation,:elo,:wins,:losses,:streak,:rank,:benefits,:stats,:updated)
                ON CONFLICT(id) DO UPDATE SET credits=excluded.credits, reputation=excluded.reputation, elo=excluded.elo,
                wins=excluded.wins, losses=excluded.losses, streak=excluded.streak, rank=excluded.rank,
                benefits=excluded.benefits, stats=excluded.stats, updated=excluded.updated""", a)
            self.db.commit()

    def agents(self):
        with self.lock:
            rows = self.db.execute("SELECT * FROM agents").fetchall()
        return [dict(r) for r in rows]

    # ------------------------------------------------------------ problems
    def add_problem(self, text, field_id="", source="user"):
        with self.lock:
            cur=self.db.execute("INSERT INTO problems(text,field_id,source) VALUES(?,?,?)", (text, field_id, source))
            self.db.commit()
            return cur.lastrowid

    def problems(self, unused_only=False):
        q = "SELECT * FROM problems"
        if unused_only:
            q += " WHERE used=0"
        q += " ORDER BY id DESC LIMIT 200"
        with self.lock:
            rows = self.db.execute(q).fetchall()
        return [dict(r) for r in rows]

    def mark_problem_used(self, pid):
        with self.lock:
            self.db.execute("UPDATE problems SET used=1 WHERE id=?", (pid,))
            self.db.commit()

    def wipe(self):
        with self.lock:
            for t in ("agents", "inventions", "events", "problems"):
                self.db.execute(f"DELETE FROM {t}")
            self.db.commit()
