"""C3.25 campaign-identity digests; deterministic UTF-8 framing, not an AI judgment.

A hash authenticates *which bytes the app persisted* relative to its own recorded
submission. It is not a signature of user authorship and cannot prove old HTTP
traffic that was never captured. Scientific relevance is separately unverified.
"""
from __future__ import annotations

import hashlib
import json


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def frame(values: list) -> bytes:
    return json.dumps(values, ensure_ascii=False, separators=(",", ":"),
                      allow_nan=False).encode("utf-8", "strict")


def original_hash(campaign_id: str, field_id: str, question: str, claim: str,
                  mechanism: str, novel_delta: str, invention_id: str | None) -> str:
    return sha256_bytes(frame(["NEMESIS_ORIGINAL_V1", campaign_id, field_id,
                               question, claim, mechanism, novel_delta, invention_id]))


def interpretation_hash(campaign_id: str, revision: int, directive_hash: str,
                        question: str, claim: str, mechanism: str, novel_delta: str) -> str:
    return sha256_bytes(frame(["NEMESIS_INTERPRETATION_V1", campaign_id, revision,
                               directive_hash, question, claim, mechanism, novel_delta]))


class IdentityViolation(ValueError):
    """Do not dispatch/link/promote a record whose campaign directive is mismatched."""


def validate_payload_fields(value: dict, *, max_body=16384) -> dict:
    """Accept only bounded typed new-submission fields, with no silent trimming.

    The raw JSON HTTP bytes are retained separately. Duplicate JSON names and
    unknown fields are rejected at ingress rather than creating ambiguous identity.
    """
    if not isinstance(value, dict):
        raise ValueError("scientific submission must be a JSON object")
    allowed = {"field_id", "question", "claim", "mechanism", "novel_delta", "lead_agent_id", "title"}
    unexpected = set(value) - allowed
    if unexpected:
        raise ValueError("unexpected scientific submission fields: " + ", ".join(sorted(unexpected)[:6]))
    for key in ("field_id", "question", "claim", "mechanism", "novel_delta"):
        if key in value and type(value[key]) is not str:
            raise ValueError(key + " must be an exact UTF-8 string")
    for key in ("lead_agent_id", "title"):
        if key in value and value[key] is not None and type(value[key]) is not str:
            raise ValueError(key + " must be a string or omitted")
    # Validate exact *untrimmed* user strings. Do not silently destroy newlines or
    # whitespace; a visually blank field is rejected as missing.
    for key, maxlen, mintrim in (("field_id", 40, 1), ("question", 1200, 12),
                                 ("claim", 1600, 12), ("mechanism", 8192, 0),
                                 ("novel_delta", 1200, 0), ("title", 260, 0),
                                 ("lead_agent_id", 100, 0)):
        raw = value.get(key, "") or ""
        if len(raw) > maxlen or len(raw.strip()) < mintrim:
            raise ValueError(key + " is empty, too short, or exceeds its exact-text limit (" + str(maxlen) + ")")
        raw.encode("utf-8", "strict")
    return value


def parse_http_submission(raw: bytes) -> dict:
    if len(raw) > 16384:
        raise ValueError("scientific submission exceeds 16 KiB raw JSON limit")
    try:
        text = raw.decode("utf-8", "strict")
    except UnicodeError as exc:
        raise ValueError("scientific submission must be UTF-8") from exc

    def no_duplicate_keys(pairs):
        obj = {}
        for k, v in pairs:
            if k in obj:
                raise ValueError("duplicate scientific submission field: " + k)
            obj[k] = v
        return obj

    try:
        data = json.loads(text, object_pairs_hook=no_duplicate_keys,
                          parse_constant=lambda x: (_ for _ in ()).throw(ValueError("non-finite JSON number")))
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise ValueError("scientific submission is not valid UTF-8 JSON") from exc
    return validate_payload_fields(data)
