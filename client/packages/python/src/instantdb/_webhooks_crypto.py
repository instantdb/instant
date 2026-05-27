"""Ed25519 signature parsing + verification for incoming webhook requests.

Pure sync. Both `AsyncInstant.webhooks.validate_signature` and (post-unasync)
`Instant.webhooks.validate_signature` route through here. Signing keys are
baked in — matches JS `knownKeys` for the prod + localhost API URIs, since
fetching JWKS dynamically would force `validate_signature` to be async.
"""

from __future__ import annotations

import base64
import time
from typing import NamedTuple

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from instantdb._errors import InstantError

DEFAULT_MAX_AGE_SECONDS = 300

# kid → base64url-encoded raw Ed25519 public key, keyed by API URI prefix.
# Mirrors the `knownKeys` map in @instantdb/webhooks. Any localhost port
# uses the dev key the local server image always serves (the published
# Docker image bakes the same kid=503090235 key as JS's localhost:8888).
_PROD_KEYS = {
    "1034696293": "N-C41432STKAKkXAWmeIOXMnZcGRR1b9u1L3bTVqI_o",
}
_LOCAL_KEYS = {
    "503090235": "qrSkwDaMITRMF9nOgpueqxgaAiuFmJperYE3mkyl8Ow",
}


def _trusted_keys(api_uri: str) -> dict[str, str]:
    if api_uri.startswith(("http://localhost", "http://127.0.0.1")):
        return _LOCAL_KEYS
    if api_uri.startswith("https://api.instantdb.com"):
        return _PROD_KEYS
    return {}


class _Signature(NamedTuple):
    t: int
    kid: str
    v1: bytes


def _parse_header(header: str) -> _Signature:
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
    return _Signature(t=t_int, kid=parts["kid"], v1=v1_bytes)


def _b64url_decode(s: str) -> bytes:
    # Add padding back; base64url uses `-` and `_` in place of `+` / `/`.
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def verify_signature(
    *,
    api_uri: str,
    signature_header: str,
    body: bytes,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
    received_at: int | None = None,
) -> None:
    """Verify the Ed25519 signature on a webhook delivery.

    Raises `InstantError` on a malformed header, stale timestamp, unknown
    `kid`, or signature mismatch. Returns `None` on success.
    """
    sig = _parse_header(signature_header)

    now = int(received_at if received_at is not None else time.time())
    age = now - sig.t
    # Reject both stale and forged-future timestamps.
    if abs(age) > max_age_seconds:
        raise InstantError(
            f"Webhook signature timestamp outside tolerance "
            f"(age={age}s, tolerance=±{max_age_seconds}s)"
        )

    keys = _trusted_keys(api_uri)
    raw_key_b64 = keys.get(sig.kid)
    if raw_key_b64 is None:
        raise InstantError(f"No trusted signing key for kid={sig.kid} on api_uri={api_uri}")

    public_key = Ed25519PublicKey.from_public_bytes(_b64url_decode(raw_key_b64))
    message = f"{sig.t}.".encode() + body
    try:
        public_key.verify(sig.v1, message)
    except InvalidSignature as e:
        raise InstantError("Instant signature did not validate") from e
