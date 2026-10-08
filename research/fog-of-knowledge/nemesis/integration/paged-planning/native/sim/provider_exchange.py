"""Quota-aware free-model provider exchange for Project NEMESIS.

Design goals:
- keep a genuinely keyless fallback online by default;
- make strong free-account providers one-click configurable from the UI;
- never expose stored secrets back to the browser;
- health/cooldown is per provider, not global;
- a provider failure is routing information, not an agent failure.

The catalog is intentionally curated and high-value. V9 also distinguishes a temporary
rate-limit from a manual account/billing block: retries are useful for 429/5xx, but are
wasteful for 401/402/403 until the operator fixes the account or credentials.
"""
from __future__ import annotations

import asyncio
import json
import os
import stat
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx


CATALOG: list[dict[str, Any]] = [
    # Zero-friction / low-friction fallbacks. Runtime verification is mandatory.
    {
        "id": "llm7", "name": "LLM7", "kind": "openai", "auth": "optional_bearer",
        "base_url": "https://api.llm7.io/v1", "model": "DeepSeek-V4-Flash-0731", "priority": 100,
        "signup_url": "https://dash.llm7.io/", "docs_url": "https://llm7.io/",
        "free_note": "Optional free token; anonymous availability is runtime-dependent.",
        "default_enabled": True, "quality": "strong-free", "region": "international",
    },
    {
        "id": "kilo", "name": "Kilo Code Free Gateway", "kind": "openai", "auth": "none",
        "base_url": "https://api.kilo.ai/api/gateway", "model": "kilo-auto/free", "priority": 95,
        "signup_url": "https://kilo.ai/", "docs_url": "https://kilo.ai/",
        "free_note": "Keyless/free capacity is best-effort; NEMESIS only routes after a real test passes.",
        "default_enabled": True, "quality": "strong-free", "region": "international",
    },
    {
        "id": "ovh-anon", "name": "OVH AI Endpoints (anonymous)", "kind": "openai", "auth": "none",
        "base_url": "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", "model": "Qwen3.8-27B", "priority": 80,
        "signup_url": "https://endpoints.ai.cloud.ovh.net/", "docs_url": "https://endpoints.ai.cloud.ovh.net/",
        "free_note": "Anonymous low-rate fallback; runtime test decides whether it is currently usable.",
        "default_enabled": True, "quality": "fallback", "region": "international",
    },
    {
        "id": "pollinations", "name": "Pollinations", "kind": "openai", "auth": "bearer",
        "base_url": "https://gen.pollinations.ai/v1", "model": "openai", "priority": 60,
        "signup_url": "https://enter.pollinations.ai/keys", "docs_url": "https://gen.pollinations.ai/",
        "free_note": "OpenAI-compatible generation with a Pollinations key.",
        "default_enabled": True, "quality": "fallback", "region": "international",
    },

    # Strong international free/free-tier account lanes. No Alibaba/ModelScope dependency.
    {
        "id": "groq", "name": "Groq", "kind": "openai", "auth": "bearer",
        "base_url": "https://api.groq.com/openai/v1", "model": "openai/gpt-oss-120b", "priority": 160,
        "signup_url": "https://console.groq.com/keys", "docs_url": "https://console.groq.com/docs/models",
        "free_note": "Fast free/developer lane. Current default is GPT-OSS 120B; model discovery is supported.",
        "default_enabled": False, "quality": "frontier-free", "region": "international",
    },
    {
        "id": "gemini", "name": "Google Gemini", "kind": "gemini", "auth": "api_key",
        "base_url": "https://generativelanguage.googleapis.com/v1beta", "model": "gemini-3.8-flash", "priority": 155,
        "signup_url": "https://aistudio.google.com/apikey", "docs_url": "https://ai.google.dev/gemini-api/docs",
        "free_note": "Official free tier on supported Gemini models; current default is Gemini 3.8 Flash.",
        "default_enabled": False, "quality": "frontier-free", "region": "international",
    },
    {
        "id": "openrouter", "name": "OpenRouter Free Router", "kind": "openai", "auth": "bearer",
        "base_url": "https://openrouter.ai/api/v1", "model": "openrouter/free", "priority": 150,
        "signup_url": "https://openrouter.ai/settings/keys", "docs_url": "https://openrouter.ai/openrouter/free",
        "free_note": "Official free-model router. Free-plan quotas are small, so NEMESIS treats 429 as temporary capacity evidence and fails over instead of hammering it.",
        "default_enabled": False, "quality": "frontier-free", "region": "international",
    },
    {
        "id": "cerebras", "name": "Cerebras Inference", "kind": "openai", "auth": "bearer",
        "base_url": "https://api.cerebras.ai/v1", "model": "gpt-oss-120b", "priority": 145,
        "signup_url": "https://cloud.cerebras.ai/", "docs_url": "https://inference-docs.cerebras.ai/quickstart",
        "free_note": "Official free API tier / trial lane with high-speed inference; current default GPT-OSS 120B.",
        "default_enabled": False, "quality": "frontier-free", "region": "international",
    },
    {
        "id": "modelscope-intl", "name": "ModelScope International", "kind": "openai", "auth": "bearer",
        "base_url": "https://api-inference.modelscope.ai/v1", "model": "zai-org/GLM-5.2", "priority": 140,
        "signup_url": "https://www.modelscope.ai/my/settings/account", "docs_url": "https://www.modelscope.ai/models/zai-org/GLM-5.2",
        "free_note": "International .ai API-Inference route only. Optional: requires a ModelScope token and whatever account eligibility ModelScope enforces. The China .cn endpoint is never used.",
        "default_enabled": False, "quality": "account-conditional", "region": "international",
    },
    {
        "id": "mistral", "name": "Mistral", "kind": "openai", "auth": "bearer",
        "base_url": "https://api.mistral.ai/v1", "model": "mistral-small-latest", "priority": 135,
        "signup_url": "https://console.mistral.ai/api-keys", "docs_url": "https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key",
        "free_note": "Studio Free mode supports API keys without a credit card; rate limits apply.",
        "default_enabled": False, "quality": "strong-free", "region": "international",
    },
    {
        "id": "huggingface", "name": "Hugging Face Inference Providers", "kind": "openai", "auth": "bearer",
        "base_url": "https://router.huggingface.co/v1", "model": "deepseek-ai/DeepSeek-R1:fastest", "priority": 125,
        "signup_url": "https://huggingface.co/settings/tokens", "docs_url": "https://huggingface.co/docs/inference-providers/index",
        "free_note": "OpenAI-compatible router across supported inference providers; account quota/credits apply.",
        "default_enabled": False, "quality": "strong-free", "region": "international",
    },
    {
        "id": "cloudflare", "name": "Cloudflare Workers AI", "kind": "cloudflare", "auth": "cloudflare",
        "base_url": "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}",
        "model": "@cf/zai-org/glm-4.7-flash", "priority": 115,
        "signup_url": "https://dash.cloudflare.com/", "docs_url": "https://developers.cloudflare.com/workers-ai/",
        "free_note": "Workers AI has a daily free-neuron allocation. Default model is a currently Free-plan-eligible GLM-4.7-Flash route; requires account ID + API token.",
        "default_enabled": False, "quality": "strong-free", "region": "international",
    },

    # Additional international gateways discovered during the V9 federation audit.
    # None are assumed free forever: runtime testing + provider account state decide.
    {
        "id": "aihubmix", "name": "AIHubMix Free Catalog", "kind": "openai", "auth": "bearer",
        "base_url": "https://aihubmix.com/v1", "model": "coding-glm-5.3-free", "priority": 148,
        "signup_url": "https://aihubmix.com/", "docs_url": "https://aihubmix.com/developers",
        "free_note": "Subsidized free-model catalog with live per-account quotas. Current default is coding-glm-5.3-free; availability and quotas are provider-controlled.",
        "default_enabled": False, "quality": "frontier-free", "region": "international",
    },
    {
        "id": "zhipu", "name": "Z.AI Global", "kind": "openai", "auth": "bearer",
        "base_url": "https://api.z.ai/api/paas/v4", "model": "glm-5.3", "priority": 132,
        "signup_url": "https://z.ai/model-api", "docs_url": "https://docs.z.ai/",
        "free_note": "International Z.AI OpenAI-compatible lane. Account plans/promotions vary; V9 does NOT assume unlimited or free-forever access. AIHubMix provides a separate subsidized free GLM lane.",
        "default_enabled": False, "quality": "trial-or-metered", "region": "international",
    },
    {
        "id": "siliconflow", "name": "SiliconFlow Global", "kind": "openai", "auth": "bearer",
        "base_url": "https://api.siliconflow.com/v1", "model": "deepseek-ai/DeepSeek-V4.1-Flash", "priority": 128,
        "signup_url": "https://cloud.siliconflow.com/", "docs_url": "https://docs.siliconflow.com/",
        "free_note": "Global OpenAI-compatible lane. Current serverless models are metered; useful with signup/promotional credit, not treated as permanently free.",
        "default_enabled": False, "quality": "credits-or-metered", "region": "international",
    },

    # Generic escape hatches. These keep the exchange future-proof instead of
    # requiring a code release every time a free OpenAI-compatible gateway changes.
    {
        "id": "custom-openai-1", "name": "Custom OpenAI-Compatible #1", "kind": "openai", "auth": "optional_bearer",
        "base_url": "", "model": "", "priority": 70,
        "signup_url": "", "docs_url": "",
        "free_note": "Paste any OpenAI-compatible base URL, model ID, and optional bearer token.",
        "default_enabled": False, "quality": "custom", "region": "user-defined", "custom": True,
    },
    {
        "id": "custom-openai-2", "name": "Custom OpenAI-Compatible #2", "kind": "openai", "auth": "optional_bearer",
        "base_url": "", "model": "", "priority": 65,
        "signup_url": "", "docs_url": "",
        "free_note": "Second user-defined OpenAI-compatible route for new gateways or local servers.",
        "default_enabled": False, "quality": "custom", "region": "user-defined", "custom": True,
    },
]


CATALOG_BY_ID = {p["id"]: p for p in CATALOG}


@dataclass
class RuntimeState:
    calls: int = 0
    ok: int = 0
    failed: int = 0
    consecutive_failures: int = 0
    cooldown_until: float = 0.0
    last_error: str = ""
    last_ok: float = 0.0
    last_latency_ms: int | None = None
    discovered_model: str = ""
    verified: bool = False
    last_headers: dict[str, str] = field(default_factory=dict)
    hard_block_code: int | None = None
    hard_block_reason: str = ""


class ProviderHTTPError(RuntimeError):
    """HTTP failure with enough structure for routing policy to act intelligently."""
    def __init__(self, status: int, body: str, *, retry_after: float | None = None):
        self.status = int(status)
        self.body = str(body or "")[:500]
        self.retry_after = retry_after
        super().__init__(f"HTTP {self.status} {self.body[:260]}")


class ProviderExchange:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.secret_path = Path(os.environ.get(
            "NEMESIS_PROVIDER_SECRETS",
            str(self.root / "data" / "provider_secrets.json"),
        ))
        self.config: dict[str, dict[str, Any]] = self._load_config()
        self._migrate_legacy_secret_fields()
        self.performance_path = self.root / "data" / "provider_performance.json"
        self.performance: dict[str, dict[str, dict[str, Any]]] = self._load_performance()
        self.runtime: dict[str, RuntimeState] = {p["id"]: RuntimeState() for p in CATALOG}
        self._locks: dict[str, asyncio.Semaphore] = {p["id"]: asyncio.Semaphore(1) for p in CATALOG}
        self.timeout = 45.0

    # ------------------------------------------------------------- secrets
    def _load_config(self) -> dict[str, dict[str, Any]]:
        try:
            raw = json.loads(self.secret_path.read_text(encoding="utf-8"))
            return raw if isinstance(raw, dict) else {}
        except FileNotFoundError:
            return {}
        except Exception:
            # Corrupt secret configuration must never make the application unavailable.
            return {}

    def _load_performance(self) -> dict[str, dict[str, dict[str, Any]]]:
        try:
            raw=json.loads(self.performance_path.read_text(encoding="utf-8"))
            return raw if isinstance(raw,dict) else {}
        except Exception:
            return {}

    def _persist_performance(self) -> None:
        self.performance_path.parent.mkdir(parents=True,exist_ok=True)
        tmp=self.performance_path.with_suffix('.tmp')
        tmp.write_text(json.dumps(self.performance,indent=2,sort_keys=True),encoding='utf-8')
        os.replace(tmp,self.performance_path)

    def competence(self,provider_id: str,domain: str='general') -> tuple[float,int]:
        row=((self.performance.get(provider_id) or {}).get(domain) or {})
        ok=int(row.get('ok') or 0);failed=int(row.get('failed') or 0);trials=ok+failed
        # Beta(2,2) prior keeps one lucky success from dominating the fleet.
        return (ok+2)/(trials+4),trials

    def record_outcome(self,provider_id: str,domain: str,success: bool,detail: str='') -> None:
        if provider_id not in CATALOG_BY_ID:return
        domains=self.performance.setdefault(provider_id,{})
        row=domains.setdefault(domain,{'ok':0,'failed':0,'last':0.0,'last_detail':''})
        row['ok']=int(row.get('ok') or 0)+(1 if success else 0)
        row['failed']=int(row.get('failed') or 0)+(0 if success else 1)
        row['last']=time.time();row['last_detail']=str(detail or '')[:300]
        self._persist_performance()

    @staticmethod
    def _looks_like_secret(value: str) -> bool:
        v = str(value or "").strip()
        if not v:
            return False
        if v.startswith(("sk_", "pk_", "gsk_", "AIza", "ghp_", "github_pat_", "hf_")):
            return True
        # Free-provider tokens are sometimes opaque/JWT-like rather than prefixed.
        # Model IDs are normally short human-readable identifiers; a long opaque
        # token in MODEL is overwhelmingly a pasted credential.
        return len(v) >= 64 and " " not in v and "/" not in v

    def _migrate_legacy_secret_fields(self) -> None:
        """Repair the first Model Exchange UI bug without exposing credentials.

        Earlier builds hid credential inputs for LLM7/Pollinations, so users could
        only paste a token into MODEL.  Move obvious tokens into the secret field
        and let the provider's real default model take over.
        """
        changed = False
        for pid in ("llm7", "pollinations"):
            cfg = dict(self.config.get(pid) or {})
            model = str(cfg.get("model") or "").strip()
            if model and not cfg.get("key") and self._looks_like_secret(model):
                cfg["key"] = model
                cfg.pop("model", None)
                self.config[pid] = cfg
                changed = True
        if changed:
            self._persist()

    def _persist(self) -> None:
        self.secret_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.secret_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.config, ensure_ascii=False, indent=2), encoding="utf-8")
        try:
            os.chmod(tmp, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
        os.replace(tmp, self.secret_path)
        try:
            os.chmod(self.secret_path, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass

    def configure(self, provider_id: str, *, enabled: bool | None = None, key: str | None = None,
                  account_id: str | None = None, model: str | None = None,
                  base_url: str | None = None) -> None:
        if provider_id not in CATALOG_BY_ID:
            raise KeyError(provider_id)
        cfg = dict(self.config.get(provider_id) or {})
        if enabled is not None:
            cfg["enabled"] = bool(enabled)
        if key is not None:
            if key:
                cfg["key"] = key.strip()
            else:
                cfg.pop("key", None)
        if account_id is not None:
            if account_id:
                cfg["account_id"] = account_id.strip()
            else:
                cfg.pop("account_id", None)
        if model is not None:
            clean_model = model.strip() if model else ""
            # Be forgiving: the original UI made LLM7/Pollinations look keyless and
            # users naturally pasted credentials into MODEL.  Treat an obvious
            # secret as a credential, never as a model ID.
            if clean_model and provider_id in ("llm7", "pollinations") and self._looks_like_secret(clean_model):
                if not cfg.get("key"):
                    cfg["key"] = clean_model
                cfg.pop("model", None)
            elif clean_model:
                cfg["model"] = clean_model
            else:
                cfg.pop("model", None)
        if base_url is not None:
            if base_url:
                cfg["base_url"] = base_url.strip()
            else:
                cfg.pop("base_url", None)
        self.config[provider_id] = cfg
        self.runtime[provider_id] = RuntimeState()
        self._persist()

    # ------------------------------------------------------------- public
    def _effective(self, item: dict[str, Any]) -> dict[str, Any]:
        cfg = self.config.get(item["id"]) or {}
        return {
            **item,
            "enabled": bool(cfg.get("enabled", item.get("default_enabled", False))),
            "key": cfg.get("key", ""),
            "account_id": cfg.get("account_id", ""),
            "model": cfg.get("model", item.get("model", "")),
            "base_url": cfg.get("base_url", item.get("base_url", "")),
        }

    def public_catalog(self) -> list[dict[str, Any]]:
        now = time.time()
        out = []
        for item in CATALOG:
            p = self._effective(item)
            r = self.runtime[item["id"]]
            needs_key = item["auth"] in ("bearer", "api_key", "cloudflare")
            configured = not needs_key or bool(p.get("key"))
            if item["auth"] == "cloudflare":
                configured = configured and bool(p.get("account_id"))
            if item.get("custom"):
                configured = configured and bool(p.get("base_url"))
            out.append({
                "id": item["id"], "name": item["name"], "kind": item["kind"], "auth": item["auth"],
                "signup_url": item["signup_url"], "docs_url": item["docs_url"], "free_note": item["free_note"],
                "quality": item["quality"], "priority": item["priority"], "enabled": p["enabled"],
                "region": item.get("region", "international"), "custom": bool(item.get("custom")),
                "configured": configured, "model": p.get("model") or r.discovered_model,
                "base_url": p.get("base_url", ""), "verified": r.verified,
                "healthy": (r.cooldown_until <= now and not r.hard_block_code),
                "cooling_for": round(max(0.0, r.cooldown_until-now), 1),
                "blocked": bool(r.hard_block_code), "blocked_code": r.hard_block_code,
                "blocked_reason": r.hard_block_reason,
                "calls": r.calls, "ok": r.ok, "failed": r.failed, "last_error": r.last_error,
                "last_ok": r.last_ok, "last_latency_ms": r.last_latency_ms,
                "credential_hint": "stored" if p.get("key") else "none",
                "account_id_hint": (p.get("account_id", "")[-6:] if p.get("account_id") else ""),
                "rate_headers": r.last_headers,
                "engineering_score": round(self.competence(item["id"],"engineering")[0],3),
                "engineering_trials": self.competence(item["id"],"engineering")[1],
            })
        return out

    def summary(self) -> dict[str, Any]:
        cat = self.public_catalog()
        return {
            "providers": cat,
            "enabled": sum(1 for p in cat if p["enabled"]),
            "verified": sum(1 for p in cat if p["verified"]),
            "healthy": sum(1 for p in cat if p["enabled"] and p["configured"] and p["healthy"]),
            "removed_routes": ["modelscope-cn", "github-models"],
            "policy_note": "V9 keeps ModelScope International as an optional .ai route, never uses the China .cn endpoint, does not make Alibaba/ModelScope a dependency, and classifies 401/402/403 as manual account blocks so dead credentials cannot consume the engineering loop.",
            "secret_store": str(self.secret_path),
            "secret_store_mode": "local file; API keys never returned by this endpoint",
        }

    # ------------------------------------------------------------- routing
    def candidates(self, domain: str = "general") -> list[dict[str, Any]]:
        now = time.time()
        rows = []
        for item in CATALOG:
            p = self._effective(item)
            r = self.runtime[item["id"]]
            if not p["enabled"] or r.cooldown_until > now or r.hard_block_code:
                continue
            if not str(p.get("base_url") or "").strip():
                continue
            if item["auth"] in ("bearer", "api_key") and not p.get("key"):
                continue
            if item["auth"] == "cloudflare" and (not p.get("key") or not p.get("account_id")):
                continue
            # Proven routes first; unverified keyless routes are still allowed to self-probe.
            verified_bonus = 1000 if r.verified else 0
            health_penalty = r.consecutive_failures * 25
            competence,trials=self.competence(item["id"],domain)
            # Once we have tested outcomes, task-specific empirical competence can
            # outrank a nominal catalog priority. With no trials, the prior is neutral.
            competence_bonus=(competence-0.5)*240 if trials else 0
            rows.append((verified_bonus + int(item["priority"]) + competence_bonus - health_penalty, p))
        rows.sort(key=lambda x: x[0], reverse=True)
        return [p for _, p in rows]

    def _cooldown(self, provider_id: str, seconds: float, error: str) -> None:
        r = self.runtime[provider_id]
        r.cooldown_until = max(r.cooldown_until, time.time() + max(1.0, seconds))
        r.last_error = error[:300]
        r.failed += 1
        r.consecutive_failures += 1
        r.verified = False if r.consecutive_failures >= 3 else r.verified

    def _hard_block(self, provider_id: str, code: int, reason: str, error: str) -> None:
        r = self.runtime[provider_id]
        r.hard_block_code = int(code)
        r.hard_block_reason = str(reason)[:180]
        r.cooldown_until = 0.0
        r.last_error = error[:300]
        r.failed += 1
        r.consecutive_failures += 1
        r.verified = False

    def _clear_hard_block(self, provider_id: str) -> None:
        r = self.runtime[provider_id]
        r.hard_block_code = None
        r.hard_block_reason = ""
        r.cooldown_until = 0.0

    def _record_failure(self, provider_id: str, exc: Exception) -> str:
        """Convert provider errors into either retryable cooldowns or manual blocks.

        402 is deliberately non-retryable: Google explicitly documents that a depleted
        prepay balance will keep returning 402 until funds are added. 401/403 likewise
        need a credential/permission change. 404 is treated as a model/endpoint config
        defect. Everything else gets a bounded local cooldown and fleet failover.
        """
        msg = f"{type(exc).__name__}: {str(exc)[:260]}"
        if isinstance(exc, ProviderHTTPError):
            code = exc.status
            if code == 402:
                self._hard_block(provider_id, code, "CREDITS / BILLING DEPLETED · fix account, then TEST NOW", msg)
                return msg
            if code in (401, 403):
                self._hard_block(provider_id, code, "AUTH / ENTITLEMENT BLOCKED · fix key/account, then TEST NOW", msg)
                return msg
            if code == 404:
                self._hard_block(provider_id, code, "MODEL / ENDPOINT NOT FOUND · update model or base URL, then TEST NOW", msg)
                return msg
            if code == 429:
                self._cooldown(provider_id, exc.retry_after or 60.0, msg)
                return msg
            if 500 <= code <= 599:
                self._cooldown(provider_id, exc.retry_after or 45.0, msg)
                return msg
        seconds = 90.0 if "timeout" in msg.lower() else 45.0
        self._cooldown(provider_id, seconds, msg)
        return msg

    @staticmethod
    def _retry_seconds(resp: httpx.Response) -> float:
        raw = resp.headers.get("retry-after", "").strip()
        try:
            return min(3600.0, max(2.0, float(raw)))
        except Exception:
            return 45.0 if resp.status_code == 429 else 120.0

    def _capture_rate_headers(self, provider_id: str, headers: httpx.Headers) -> None:
        keep = {}
        for k, v in headers.items():
            lk = k.lower()
            if lk == "retry-after" or lk.startswith("x-ratelimit-") or lk.startswith("ratelimit-"):
                keep[lk] = v[:120]
        self.runtime[provider_id].last_headers = keep

    async def ask(self, system: str, user: str, max_tokens: int, temperature: float,
                  tag: str = "", domain: str = "general") -> tuple[str | None, str | None]:
        last_error = ""
        for p in self.candidates(domain):
            pid = p["id"]
            started = time.monotonic()
            rstate = self.runtime[pid]
            rstate.calls += 1
            try:
                async with self._locks[pid]:
                    text = await self._call(p, system, user, max_tokens, temperature)
                if text:
                    rstate.ok += 1
                    rstate.consecutive_failures = 0
                    rstate.last_error = ""
                    rstate.cooldown_until = 0.0
                    rstate.last_ok = time.time()
                    rstate.last_latency_ms = int((time.monotonic()-started)*1000)
                    rstate.verified = True
                    rstate.hard_block_code = None; rstate.hard_block_reason = ""
                    return text, pid
                raise RuntimeError("empty completion")
            except Exception as exc:  # provider failure must not fail the task
                msg = self._record_failure(pid, exc)
                last_error = f"{pid}: {msg}"
                continue
        return None, last_error or None

    async def ask_provider(self, provider_id: str, system: str, user: str, max_tokens: int, temperature: float) -> tuple[str | None, str | None]:
        """Ask one exact configured route. Used when governance needs route diversity.

        This never falls through to a different provider, so a recorded ballot can
        truthfully name the route that produced it. Provider failure remains local
        routing evidence and does not crash the caller.
        """
        if provider_id not in CATALOG_BY_ID:
            return None, f"unknown provider: {provider_id}"
        p = self._effective(CATALOG_BY_ID[provider_id])
        now = time.time()
        rs = self.runtime[provider_id]
        if not p.get("enabled"):
            return None, f"{provider_id}: disabled"
        if not str(p.get("base_url") or "").strip():
            return None, f"{provider_id}: base URL required"
        if rs.hard_block_code:
            return None, f"{provider_id}: BLOCKED HTTP {rs.hard_block_code} · {rs.hard_block_reason}"
        if rs.cooldown_until > now:
            return None, f"{provider_id}: cooling for {round(rs.cooldown_until-now,1)}s"
        if p["auth"] in ("bearer", "api_key") and not p.get("key"):
            return None, f"{provider_id}: credential required"
        if p["auth"] == "cloudflare" and (not p.get("key") or not p.get("account_id")):
            return None, f"{provider_id}: credential/account required"
        started = time.monotonic(); rs.calls += 1
        try:
            async with self._locks[provider_id]:
                out = await self._call(p, system, user, max_tokens, temperature)
            if not out:
                raise RuntimeError("empty completion")
            rs.ok += 1; rs.consecutive_failures = 0; rs.last_error = ""; rs.cooldown_until = 0.0
            rs.hard_block_code = None; rs.hard_block_reason = ""
            rs.last_ok = time.time(); rs.last_latency_ms = int((time.monotonic()-started)*1000); rs.verified = True
            return out, provider_id
        except Exception as exc:
            msg = self._record_failure(provider_id, exc)
            return None, f"{provider_id}: {msg}"

    async def test(self, provider_id: str) -> dict[str, Any]:
        if provider_id not in CATALOG_BY_ID:
            raise KeyError(provider_id)
        p = self._effective(CATALOG_BY_ID[provider_id])
        if not str(p.get("base_url") or "").strip():
            raise PermissionError("Base URL required")
        if p["auth"] in ("bearer", "api_key") and not p.get("key"):
            raise PermissionError("API key/token required")
        if p["auth"] == "cloudflare" and (not p.get("key") or not p.get("account_id")):
            raise PermissionError("Cloudflare API token and account ID required")
        # TEST NOW is the operator's explicit signal that credentials/billing may
        # have been repaired, so it is allowed to clear a prior manual block.
        self._clear_hard_block(provider_id)
        started = time.monotonic()
        self.runtime[provider_id].calls += 1
        try:
            async with self._locks[provider_id]:
                text = await self._call(p, "Reply with exactly READY", "health check", 16, 0.0)
            rs = self.runtime[provider_id]
            rs.ok += 1; rs.consecutive_failures = 0; rs.last_error = ""; rs.cooldown_until = 0.0
            rs.hard_block_code = None; rs.hard_block_reason = ""
            rs.last_ok = time.time(); rs.last_latency_ms = int((time.monotonic()-started)*1000); rs.verified = True
            return {"ok": True, "provider": provider_id, "latency_ms": rs.last_latency_ms,
                    "sample": (text or "")[:120], "model": p.get("model") or rs.discovered_model}
        except Exception as exc:
            msg = self._record_failure(provider_id, exc)
            rs = self.runtime[provider_id]
            return {"ok": False, "provider": provider_id, "error": msg,
                    "blocked": bool(rs.hard_block_code), "blocked_code": rs.hard_block_code,
                    "blocked_reason": rs.hard_block_reason}

    async def discover_models(self, provider_id: str) -> dict[str, Any]:
        """Return live model IDs without making a completion when the provider exposes them."""
        if provider_id not in CATALOG_BY_ID:
            raise KeyError(provider_id)
        p = self._effective(CATALOG_BY_ID[provider_id])
        if p["kind"] != "openai":
            return {"ok": False, "provider": provider_id, "error": "model discovery is currently implemented for OpenAI-compatible routes"}
        if not str(p.get("base_url") or "").strip():
            return {"ok": False, "provider": provider_id, "error": "base URL required"}
        if p["auth"] == "bearer" and not p.get("key"):
            return {"ok": False, "provider": provider_id, "error": "API key/token required"}
        timeout = httpx.Timeout(self.timeout, connect=12.0)
        headers = {"Accept": "application/json"}
        if p.get("key"):
            headers["Authorization"] = f"Bearer {p['key']}"
        url = p["base_url"].rstrip("/") + "/models"
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
            self._capture_rate_headers(provider_id, resp.headers)
            if resp.status_code != 200:
                return {"ok": False, "provider": provider_id, "error": f"HTTP {resp.status_code} {resp.text[:220]}"}
            payload = resp.json()
            raw = payload.get("data") if isinstance(payload, dict) else None
            names = [str(x.get("id")) for x in (raw or []) if isinstance(x, dict) and x.get("id")]
            if not names:
                return {"ok": False, "provider": provider_id, "error": "provider returned no model IDs"}
            return {"ok": True, "provider": provider_id, "models": names[:200], "count": len(names)}
        except Exception as exc:
            return {"ok": False, "provider": provider_id, "error": f"{type(exc).__name__}: {str(exc)[:240]}"}

    # ------------------------------------------------------------- adapters
    async def _openai_model(self, p: dict[str, Any], client: httpx.AsyncClient) -> str:
        if p.get("model"):
            return p["model"]
        pid = p["id"]
        rs = self.runtime[pid]
        if rs.discovered_model:
            return rs.discovered_model
        url = p["base_url"].rstrip("/") + "/models"
        headers = {"Accept": "application/json"}
        if p.get("key"):
            headers["Authorization"] = f"Bearer {p['key']}"
        resp = await client.get(url, headers=headers)
        self._capture_rate_headers(pid, resp.headers)
        if resp.status_code != 200:
            raise ProviderHTTPError(resp.status_code, "model discovery " + resp.text[:200], retry_after=self._retry_seconds(resp))
        data = resp.json().get("data") or []
        names = [str(x.get("id")) for x in data if isinstance(x, dict) and x.get("id")]
        if not names:
            raise RuntimeError("provider returned no discoverable models; enter model ID manually")
        rs.discovered_model = names[0]
        return names[0]

    async def _call(self, p: dict[str, Any], system: str, user: str,
                    max_tokens: int, temperature: float) -> str:
        timeout = httpx.Timeout(self.timeout, connect=12.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            if p["kind"] == "openai":
                return await self._call_openai(client, p, system, user, max_tokens, temperature)
            if p["kind"] == "gemini":
                return await self._call_gemini(client, p, system, user, max_tokens, temperature)
            if p["kind"] == "cloudflare":
                return await self._call_cloudflare(client, p, system, user, max_tokens, temperature)
            raise RuntimeError("unsupported provider adapter")

    async def _call_openai(self, client: httpx.AsyncClient, p: dict[str, Any], system: str, user: str,
                           max_tokens: int, temperature: float) -> str:
        pid = p["id"]
        model = await self._openai_model(p, client)
        base = p["base_url"].rstrip("/")
        url = base if base.endswith("/chat/completions") else base + "/chat/completions"
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if p.get("key"):
            headers["Authorization"] = f"Bearer {p['key']}"
        payload = {"model": model,
                   "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                   "max_tokens": max_tokens, "temperature": temperature}
        resp = await client.post(url, json=payload, headers=headers)
        self._capture_rate_headers(pid, resp.headers)
        if resp.status_code != 200:
            raise ProviderHTTPError(resp.status_code, resp.text[:320], retry_after=self._retry_seconds(resp))
        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("no choices in provider response")
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if isinstance(content, list):
            content = "".join(str(x.get("text", "")) for x in content if isinstance(x, dict))
        text = str(content or "").strip()
        if not text:
            raise RuntimeError("empty completion")
        return text

    async def _call_gemini(self, client: httpx.AsyncClient, p: dict[str, Any], system: str, user: str,
                           max_tokens: int, temperature: float) -> str:
        model = p.get("model") or "gemini-3.8-flash"
        url = p["base_url"].rstrip("/") + f"/models/{model}:generateContent"
        params = {"key": p["key"]}
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
        }
        resp = await client.post(url, params=params, json=payload)
        self._capture_rate_headers(p["id"], resp.headers)
        if resp.status_code != 200:
            raise ProviderHTTPError(resp.status_code, resp.text[:320], retry_after=self._retry_seconds(resp))
        data = resp.json()
        candidates = data.get("candidates") or []
        parts = (((candidates[0] if candidates else {}).get("content") or {}).get("parts") or [])
        text = "".join(str(x.get("text", "")) for x in parts if isinstance(x, dict)).strip()
        if not text:
            raise RuntimeError("empty Gemini completion")
        return text

    async def _call_cloudflare(self, client: httpx.AsyncClient, p: dict[str, Any], system: str, user: str,
                               max_tokens: int, temperature: float) -> str:
        model = p.get("model") or "@cf/zai-org/glm-4.7-flash"
        url = p["base_url"].format(account_id=p["account_id"], model=model)
        payload = {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                   "max_tokens": max_tokens, "temperature": temperature}
        resp = await client.post(url, json=payload,
                                 headers={"Authorization": f"Bearer {p['key']}", "Content-Type": "application/json"})
        self._capture_rate_headers(p["id"], resp.headers)
        if resp.status_code != 200:
            raise ProviderHTTPError(resp.status_code, resp.text[:320], retry_after=self._retry_seconds(resp))
        data = resp.json()
        result = data.get("result") or {}

        # Workers AI has multiple successful response shapes. Older text models
        # commonly return result.response, while chat models such as
        # GLM-4.7-Flash can return an OpenAI-style completion in result.choices.
        text = ""
        if isinstance(result, dict):
            text = str(result.get("response") or result.get("text") or "").strip()
            if not text:
                choices = result.get("choices") or []
                if choices and isinstance(choices[0], dict):
                    message = choices[0].get("message") or {}
                    if isinstance(message, dict):
                        content = message.get("content")
                        if isinstance(content, list):
                            content = "".join(
                                str(item.get("text", ""))
                                for item in content
                                if isinstance(item, dict)
                            )
                        text = str(content or message.get("reasoning_content") or "").strip()

        # Also accept an unwrapped OpenAI-compatible payload.
        if not text and isinstance(data, dict):
            choices = data.get("choices") or []
            if choices and isinstance(choices[0], dict):
                message = choices[0].get("message") or {}
                if isinstance(message, dict):
                    text = str(message.get("content") or message.get("reasoning_content") or "").strip()

        if not text:
            keys = sorted(result.keys()) if isinstance(result, dict) else [type(result).__name__]
            raise RuntimeError(f"empty Cloudflare completion; result keys={keys}")
        return text
