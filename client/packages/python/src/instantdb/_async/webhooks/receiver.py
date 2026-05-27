"""Receiver primitives for incoming webhook requests.

Three independent steps users compose into framework integration:
    1. `validate_signature` — verify Ed25519 over the raw body (sync, pure crypto)
    2. `fetch_payloads` — exchange the signed body for the full record payload
    3. `process_payload` — dispatch each record to its matching handler

No framework adapter (FastAPI / Flask / Django) is bundled — users wire those
in ~10 lines per framework using these primitives.
"""

from __future__ import annotations

import json
from typing import Any

from instantdb._async.http import _AsyncHTTP
from instantdb._async.webhooks.manager import AsyncWebhooksManager
from instantdb._errors import InstantError
from instantdb._http_errors import api_error_from_response
from instantdb._webhooks_crypto import DEFAULT_MAX_AGE_SECONDS, verify_signature


class AsyncWebhooks:
    def __init__(
        self,
        http: _AsyncHTTP,
        *,
        app_id: str,
        schema: dict[str, Any] | None = None,
    ) -> None:
        self._http = http
        self._schema = schema
        self.manager = AsyncWebhooksManager(http, app_id=app_id)

    def validate_signature(
        self,
        *,
        signature_header: str,
        body: bytes,
        max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
        received_at: int | None = None,
    ) -> None:
        """Verify the `Instant-Signature` header against the raw body.

        Sync — pure Ed25519 crypto, no HTTP fetch. Raises `InstantError` on a
        malformed header, stale timestamp, unknown key id, or signature
        mismatch. Returns `None` on success.
        """
        verify_signature(
            api_uri=self._http._api_uri,
            signature_header=signature_header,
            body=body,
            max_age_seconds=max_age_seconds,
            received_at=received_at,
        )

    async def fetch_payloads(self, body: bytes) -> dict[str, Any]:
        """Exchange the signed body for the full payload of records.

        The body delivered to your webhook URL is a small JSON object with a
        `payloadUrl` + JWT `token`. This fetches that URL with the token, and
        returns the full payload (`{"data": [...], "idempotencyKey": "..."}`).
        """
        try:
            parsed = json.loads(body)
        except ValueError as e:
            raise InstantError("Webhook body is not valid JSON") from e
        if (
            not isinstance(parsed, dict)
            or not isinstance(parsed.get("payloadUrl"), str)
            or not isinstance(parsed.get("token"), str)
        ):
            raise InstantError("Invalid webhook body: expected an object with payloadUrl and token")
        response = await self._http._client.get(
            parsed["payloadUrl"],
            headers={
                "Authorization": f"Bearer {parsed['token']}",
                "accept": "application/json",
            },
        )
        if not response.is_success:
            raise api_error_from_response(response)
        return response.json()

    async def process_payload(
        self,
        handlers: dict[str, Any],
        payload: dict[str, Any],
    ) -> None:
        """Dispatch each record in the payload to its matching handler.

        Resolution per record (matches JS):
            handlers[namespace][action] →
            handlers[namespace]["$default"] →
            handlers["$default"]

        When `Instant(schema=...)` was set, each record is validated into
        its generated Pydantic model before being handed to the handler.
        Records with no matching handler are skipped. Handlers run
        sequentially in record order; the first to raise propagates and
        stops the remaining dispatches. Handlers under `AsyncInstant` must
        be `async def`; under `Instant` they're plain `def`. Mixing flavors
        is unsupported.
        """
        records_map = self._schema.get("records", {}) if self._schema else {}
        for record in payload.get("data") or []:
            namespace = record.get("namespace")
            action = record.get("action")
            handler = _resolve_handler(handlers, namespace, action)
            if handler is None:
                continue
            record_model = records_map.get((namespace, action))
            arg = record_model.model_validate(record) if record_model else record
            await handler(arg)


def _resolve_handler(
    handlers: dict[str, Any],
    namespace: Any,
    action: Any,
) -> Any:
    ns = handlers.get(namespace) if isinstance(namespace, str) else None
    if isinstance(ns, dict):
        exact = ns.get(action) if isinstance(action, str) else None
        if exact is not None:
            return exact
        ns_default = ns.get("$default")
        if ns_default is not None:
            return ns_default
    return handlers.get("$default")
