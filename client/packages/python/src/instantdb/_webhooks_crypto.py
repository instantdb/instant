"""Shared helpers for verifying incoming webhook requests."""

from __future__ import annotations

import base64
import binascii
import json
import time
from collections.abc import Mapping
from typing import Any, NamedTuple, TypedDict
from urllib.parse import urlparse

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from instantdb._errors import InstantError

DEFAULT_MAX_AGE_SECONDS = 300

# kid -> base64url-encoded raw Ed25519 public key, keyed by API URI prefix.
# Mirrors the `knownKeys` map in @instantdb/webhooks. Any localhost port uses
# the dev key the local server image serves.
_PROD_KEYS = {
    "1034696293": "N-C41432STKAKkXAWmeIOXMnZcGRR1b9u1L3bTVqI_o",
}
_LOCAL_KEYS = {
    "503090235": "qrSkwDaMITRMF9nOgpueqxgaAiuFmJperYE3mkyl8Ow",
}
_KEY_CACHE: dict[str, Ed25519PublicKey] = {}


class WebhookBody(TypedDict):
    payloadUrl: str
    token: str


class Signature(NamedTuple):
    t: int
    kid: str
    v1: bytes


def _trusted_keys(api_uri: str) -> dict[str, str]:
    parsed = urlparse(api_uri)
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}:
        return _LOCAL_KEYS
    if parsed.scheme == "https" and parsed.hostname == "api.instantdb.com":
        return _PROD_KEYS
    return {}


def parse_signature_header(header: str) -> Signature:
    parts: dict[str, str] = {}
    for piece in header.split(","):
        k, _, v = piece.partition("=")
        k, v = k.strip(), v.strip()
        if k and v:
            parts[k] = v
    missing = [k for k in ("t", "kid", "v1") if k not in parts]
    if missing:
        raise InstantError(f"Invalid Instant-Signature header (missing: {','.join(missing)})")
    try:
        t_int = int(parts["t"])
    except ValueError as e:
        raise InstantError(f"Invalid Instant-Signature header (bad t): {parts['t']}") from e
    try:
        v1_bytes = bytes.fromhex(parts["v1"])
    except ValueError as e:
        raise InstantError("Invalid Instant-Signature header (v1 is not hex)") from e
    return Signature(t=t_int, kid=parts["kid"], v1=v1_bytes)


def validate_timestamp(
    *,
    timestamp: int,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
    received_at: int | None = None,
) -> None:
    now = int(received_at if received_at is not None else time.time())
    age = now - timestamp
    # Only reject stale timestamps (one-sided, like JS): a two-sided check
    # false-rejects valid signatures when the receiver clock lags the signer.
    if age > max_age_seconds:
        raise InstantError(
            f"Webhook signature is too old (age={age}s, tolerance={max_age_seconds}s)"
        )


def normalize_body(body: bytes | str) -> bytes:
    return body if isinstance(body, bytes) else body.encode()


def parse_webhook_body(body: bytes | str) -> WebhookBody:
    try:
        parsed = json.loads(body)
    except ValueError as e:
        raise InstantError("Webhook body is not valid JSON") from e
    return coerce_webhook_body(parsed)


def coerce_webhook_body(value: Any) -> WebhookBody:
    if not isinstance(value, dict):
        raise InstantError("Invalid webhook body: expected an object with payloadUrl and token")
    payload_url = value.get("payloadUrl")
    token = value.get("token")
    if not (isinstance(payload_url, str) and payload_url) or not (isinstance(token, str) and token):
        raise InstantError("Invalid webhook body: expected an object with payloadUrl and token")
    return {"payloadUrl": payload_url, "token": token}


def known_key(api_uri: str, kid: str) -> Ed25519PublicKey | None:
    raw_key_b64 = _trusted_keys(api_uri).get(kid)
    if raw_key_b64 is None:
        return None
    return key_from_x(api_uri=api_uri, kid=kid, x=raw_key_b64)


def key_from_jwks(api_uri: str, kid: str, jwks: Any) -> Ed25519PublicKey:
    if not isinstance(jwks, Mapping):
        raise InstantError("Invalid webhook JWKS response")
    keys = jwks.get("keys")
    if not isinstance(keys, list):
        raise InstantError("Invalid webhook JWKS response")
    for jwk in keys:
        if isinstance(jwk, Mapping) and jwk.get("kid") == kid:
            return key_from_jwk(api_uri=api_uri, kid=kid, jwk=jwk)
    raise InstantError("Could not find matching signing key")


def key_from_jwk(
    *,
    api_uri: str,
    kid: str,
    jwk: Mapping[str, Any],
) -> Ed25519PublicKey:
    x = jwk.get("x")
    if jwk.get("kty") != "OKP" or jwk.get("crv") != "Ed25519" or not isinstance(x, str):
        raise InstantError("Invalid webhook signing key")
    return key_from_x(api_uri=api_uri, kid=kid, x=x)


def key_from_x(*, api_uri: str, kid: str, x: str) -> Ed25519PublicKey:
    cache_key = f"{api_uri}:{kid}"
    cached = _KEY_CACHE.get(cache_key)
    if cached is not None:
        return cached
    try:
        key = Ed25519PublicKey.from_public_bytes(_b64url_decode(x))
    except (binascii.Error, ValueError) as e:
        raise InstantError("Invalid webhook signing key") from e
    _KEY_CACHE[cache_key] = key
    return key


def verify_signature(*, signature: Signature, key: Ed25519PublicKey, body: bytes) -> None:
    message = f"{signature.t}.".encode() + body
    try:
        key.verify(signature.v1, message)
    except InvalidSignature as e:
        raise InstantError("Instant signature did not validate") from e


def _b64url_decode(s: str) -> bytes:
    # Add padding back; base64url uses `-` and `_` in place of `+` / `/`.
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)
