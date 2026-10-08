"""
LLM ROUTER — $0 by construction.

Tier 0 (always-on, instant, offline):  LocalBrain in synthesis.py
Tier 1 (keyless, best-effort, async):  Pollinations OpenAI-compatible endpoint
Tier 2 (optional BYO, if user pastes free keys later): Groq / Gemini / OpenRouter / Ollama

The router is intentionally a *polish* layer, never a blocker: every call has a
hard timeout, a serialized queue (the free endpoint allows ~1 in-flight request
per IP), bounded retries, and a result cache. If it fails, the simulation is
already complete without it.
"""
from __future__ import annotations
import asyncio, hashlib, json, os, time
from pathlib import Path
from typing import Optional

import httpx

from .provider_exchange import ProviderExchange
from .research_authority import ResearchBrainBridge as BrainBridge

POLLINATIONS_URL = "https://text.pollinations.ai/openai/v1/chat/completions"
DEFAULT_MODEL = "openai-fast"

# Hypothetical commercial pricing, used only to display "value generated" in the ledger.
# Nothing is ever actually billed: every provider used here is free.
SHADOW_RATE_IN = 0.60 / 1_000_000
SHADOW_RATE_OUT = 1.80 / 1_000_000


class LLMRouter:
    def __init__(self, store, model: str = DEFAULT_MODEL, enabled: bool = True):
        self.store = store
        self.model = model
        self.enabled = enabled
        self.gate = asyncio.Semaphore(1)          # retained for compatibility; provider exchange owns per-route gates
        self.min_interval = 1.2
        self._last_call = 0.0
        self.calls = 0
        self.ok = 0
        self.failed = 0
        self.queue_skips = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self.shadow_cost = 0.0
        self.last_error = None
        self.available = True
        self.cooldown_until = 0.0                 # backs off instead of hammering a sick host
        self.providers: list[dict] = []           # legacy runtime BYO API, kept for old callers
        self._timeout = 45.0
        root = Path(getattr(store, "path", ".")).resolve().parent.parent
        self.exchange = ProviderExchange(root)
        self.last_provider = None
        self.brain = BrainBridge(store)

    def healthy(self) -> bool:
        return time.time() >= self.cooldown_until

    def _trip(self, secs: float, why: str):
        self.cooldown_until = time.time() + secs
        self.available = False
        self.last_error = why[:200]

    # -------------------------------------------------------------- config
    def configure(self, model: Optional[str] = None, enabled: Optional[bool] = None,
                  providers: Optional[list[dict]] = None):
        if model:
            self.model = model
        if enabled is not None:
            self.enabled = enabled
        if providers is not None:
            self.providers = providers

    def stats(self) -> dict:
        return dict(
            enabled=self.enabled, available=self.healthy(), model=self.model,
            cooling_for=round(max(0.0, self.cooldown_until - time.time()), 1),
            calls=self.calls, ok=self.ok, failed=self.failed, queue_skips=self.queue_skips,
            tokens_in=self.tokens_in, tokens_out=self.tokens_out,
            tokens=self.tokens_in + self.tokens_out,
            shadow_cost=round(self.shadow_cost, 4),
            real_cost=0.0,
            last_error=self.last_error, last_provider=self.last_provider,
            providers=[p.get("name") for p in self.providers],
            exchange=self.exchange.summary(), brain=self.brain.status(),
        )

    def _hash(self, system: str, user: str) -> str:
        return hashlib.md5(f"{self.model}|{system[:400]}|{user}".encode()).hexdigest()

    # -------------------------------------------------------------- ask
    async def ask(self, system: str, user: str, max_tokens: int = 420,
                  temperature: float = 0.85, cache: bool = True, tag: str = "") -> Optional[str]:
        """Non-blocking-by-design: returns None on any failure. Never raises."""
        if not self.enabled or (not self.brain.enabled and not self.healthy()):
            return None
        # Browser Brain owns inference when enabled, with no silent API fallback or retries.
        if self.brain.enabled:
            if tag == 'arena-tribunal':
                self.last_error = 'Arena model verdict skipped: the Brain is reserved for user research and system engineering.'
                return None
            try:
                out = await self.brain.ask(system, user, max_tokens, tag)
                self.calls += 1; self.ok += 1; self.last_provider = 'chatgpt-brain'
                return out
            except Exception as exc:
                self.failed += 1; self.last_error = str(exc)[:200]
                return None
        key = "llm:" + self._hash(system, user)
        if cache:
            hit = self.store.cache_get(key, ttl=7 * 86400)
            if hit is not None:
                return hit

        for attempt in range(2):
            try:
                out = await self._dispatch(system, user, max_tokens, temperature)
                if out:
                    self.calls += 1
                    self.ok += 1
                    est_in = (len(system) + len(user)) // 4
                    est_out = len(out) // 4
                    self.tokens_in += est_in
                    self.tokens_out += est_out
                    self.shadow_cost += est_in * SHADOW_RATE_IN + est_out * SHADOW_RATE_OUT
                    if cache:
                        self.store.cache_set(key, out)
                    return out
            except Exception as e:                      # noqa: BLE001
                self.last_error = f"{type(e).__name__}: {str(e)[:140]}"
                self.failed += 1
                msg = str(e)
                if "Queue full" in msg or "429" in msg:
                    self.queue_skips += 1
                    self._trip(45, msg)
                    await asyncio.sleep(2.0)
                    continue
                if "ENOSPC" in msg or "500" in msg or "503" in msg:
                    self._trip(180, msg)                 # host is sick: back off, do not hammer
                break
        return None

    def inference_routes(self, domain='general'):
        if self.brain.enabled:
            return [{'id': 'chatgpt-brain', 'model': 'bound-chat-ui',
                     'independence': 'shared persistent conversation'}]
        return self.exchange.candidates(domain)

    async def ask_via_provider(self, provider_id: str, system: str, user: str, max_tokens: int = 420,
                               temperature: float = 0.2) -> Optional[str]:
        """Use one exact exchange route, with no provider fall-through.

        Governance uses this to know which provider/model actually authored each
        ballot. The normal ask() path remains the availability-first cascade.
        """
        if not self.enabled:
            return None
        if provider_id == 'chatgpt-brain':
            if not self.brain.enabled: return None
            return await self.ask(system, user, max_tokens, temperature, cache=False, tag='explicit-brain-route')
        out, route = await self.exchange.ask_provider(provider_id, system, user, max_tokens, temperature)
        if out:
            self.calls += 1; self.ok += 1; self.last_provider = route
            est_in = (len(system) + len(user)) // 4; est_out = len(out) // 4
            self.tokens_in += est_in; self.tokens_out += est_out
            self.shadow_cost += est_in * SHADOW_RATE_IN + est_out * SHADOW_RATE_OUT
            return out
        self.failed += 1; self.last_error = route or self.last_error
        return None

    async def _dispatch(self, system: str, user: str, max_tokens: int, temperature: float) -> Optional[str]:
        self.available = True
        # Legacy ad-hoc providers remain supported for old saved configurations.
        for p in self.providers:
            try:
                r = await self._byo(p, system, user, max_tokens, temperature)
                if r:
                    self.last_provider = p.get("name") or "legacy-byo"
                    return r
            except Exception as e:                      # noqa: BLE001
                self.last_error = f"{p.get('name')}: {str(e)[:100]}"
        out, provider_id = await self.exchange.ask(system, user, max_tokens, temperature)
        if out:
            self.last_provider = provider_id
            return out
        self.last_error = provider_id or self.last_error
        return None

    async def _pollinations(self, system: str, user: str, max_tokens: int, temperature: float) -> Optional[str]:
        async with self.gate:
            wait = self.min_interval - (time.time() - self._last_call)
            if wait > 0:
                await asyncio.sleep(wait)
            try:
                payload = {
                    "model": self.model,
                    "messages": [{"role": "system", "content": system},
                                 {"role": "user", "content": user}],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                }
                async with httpx.AsyncClient(timeout=self._timeout) as c:
                    r = await c.post(POLLINATIONS_URL, json=payload,
                                     headers={"Content-Type": "application/json"})
                self._last_call = time.time()
                if r.status_code != 200:
                    raise RuntimeError(f"HTTP {r.status_code} {r.text[:120]}")
                data = r.json()
                msg = data["choices"][0]["message"]
                txt = (msg.get("content") or "").strip()
                if not txt:
                    raise RuntimeError("empty completion")
                return txt
            finally:
                self._last_call = time.time()

    async def _byo(self, p: dict, system: str, user: str, max_tokens: int, temperature: float) -> Optional[str]:
        base = p["base_url"].rstrip("/")
        url = base + ("" if base.endswith("/chat/completions") else "/chat/completions")
        headers = {"Content-Type": "application/json"}
        if p.get("key"):
            headers["Authorization"] = f"Bearer {p['key']}"
        payload = {"model": p.get("model", "llama-3.1-8b-instant"),
                   "messages": [{"role": "system", "content": system},
                                {"role": "user", "content": user}],
                   "max_tokens": max_tokens, "temperature": temperature}
        async with httpx.AsyncClient(timeout=self._timeout) as c:
            r = await c.post(url, json=payload, headers=headers)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} {r.text[:100]}")
        return (r.json()["choices"][0]["message"].get("content") or "").strip()

    def set_providers(self, providers: list[dict]):
        """providers: [{name, base_url, model, key}] — all optional and all free-tier capable."""
        self.providers = [p for p in providers if p.get("base_url") and p.get("model")]
        self.cooldown_until = 0.0
        return self.providers

    @staticmethod
    def parse_json_or_none(text: Optional[str]) -> Optional[dict]:
        if not text:
            return None
        t = text.strip()
        if t.startswith("```"):
            t = t.strip("`")
            if t.lower().startswith("json"):
                t = t[4:]
        i, j = t.find("{"), t.rfind("}")
        if i < 0 or j <= i:
            return None
        try:
            return json.loads(t[i:j + 1])
        except Exception:                               # noqa: BLE001
            return None
