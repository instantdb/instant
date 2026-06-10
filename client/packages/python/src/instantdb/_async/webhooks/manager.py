"""Webhook subscription manager: CRUD on subscriptions + event inspection.

Wire keys come back kebab-case + question-mark (`disabled-reason`,
`success?`); we translate to camelCase at the boundary so users porting a
webhooks pipeline from the JS SDK can keep their existing record-shape
expectations. Dates pass through as ISO strings.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from instantdb._async.http import _AsyncHTTP


def _webhook_info(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": raw.get("id"),
        "sink": raw.get("sink"),
        "namespaces": raw.get("namespaces") or [],
        "actions": raw.get("actions"),
        "status": raw.get("status"),
        "disabledReason": raw.get("disabled_reason"),
        "createdAt": raw.get("created_at"),
        "updatedAt": raw.get("updated_at"),
    }


def _webhook_attempt(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "attemptAt": raw.get("attempt-at"),
        "durationMs": raw.get("duration-ms"),
        "success": raw.get("success?"),
        "statusCode": raw.get("status-code"),
        "responseText": raw.get("response-text"),
        "errorType": raw.get("error-type"),
        "errorMessage": raw.get("error-message"),
    }


def _webhook_event(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "isn": raw.get("isn"),
        "status": raw.get("status"),
        "attempts": [_webhook_attempt(a) for a in (raw.get("attempts") or [])],
        "nextAttemptAfter": raw.get("next_attempt_after"),
        "createdAt": raw.get("created_at"),
        "updatedAt": raw.get("updated_at"),
    }


class AsyncWebhooksManager:
    def __init__(self, http: _AsyncHTTP, *, app_id: str) -> None:
        self._http = http
        self._app_id = app_id

    async def list(self) -> list[dict[str, Any]]:
        res = await self._http.get(f"/dash/apps/{self._app_id}/webhooks")
        return [_webhook_info(w) for w in (res.get("webhooks") or [])]

    async def create(
        self,
        *,
        url: str,
        namespaces: Sequence[str],
        actions: Sequence[str],
    ) -> dict[str, Any]:
        res = await self._http.post(
            f"/dash/apps/{self._app_id}/webhooks",
            json={"url": url, "namespaces": namespaces, "actions": actions},
        )
        return _webhook_info(res["webhook"])

    async def update(
        self,
        webhook_id: str,
        *,
        url: str | None = None,
        namespaces: Sequence[str] | None = None,
        actions: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if url is not None:
            body["url"] = url
        if namespaces is not None:
            body["namespaces"] = namespaces
        if actions is not None:
            body["actions"] = actions
        res = await self._http.post(
            f"/dash/apps/{self._app_id}/webhooks/{webhook_id}",
            json=body,
        )
        return _webhook_info(res["webhook"])

    async def delete(self, webhook_id: str) -> dict[str, Any]:
        res = await self._http.delete(f"/dash/apps/{self._app_id}/webhooks/{webhook_id}")
        return _webhook_info(res["webhook"])

    async def enable(self, webhook_id: str) -> dict[str, Any]:
        res = await self._http.post(
            f"/dash/apps/{self._app_id}/webhooks/{webhook_id}/enable",
            json={},
        )
        return _webhook_info(res["webhook"])

    async def disable(self, webhook_id: str, *, reason: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"reason": reason} if reason is not None else {}
        res = await self._http.post(
            f"/dash/apps/{self._app_id}/webhooks/{webhook_id}/disable",
            json=body,
        )
        return _webhook_info(res["webhook"])

    async def list_events(
        self,
        webhook_id: str,
        *,
        after: str | None = None,
    ) -> dict[str, Any]:
        params = {"after": after} if after else None
        res = await self._http.get(
            f"/dash/apps/{self._app_id}/webhooks/{webhook_id}/events",
            params=params,
        )
        page_info = res.get("pageInfo") or {}
        return {
            "events": [_webhook_event(e) for e in (res.get("events") or [])],
            "pageInfo": {
                "startCursor": page_info.get("startCursor"),
                "endCursor": page_info.get("endCursor"),
                "hasNextPage": bool(page_info.get("hasNextPage")),
            },
        }

    async def get_event(self, webhook_id: str, *, isn: str) -> dict[str, Any]:
        res = await self._http.get(f"/dash/apps/{self._app_id}/webhooks/{webhook_id}/events/{isn}")
        return _webhook_event(res["event"])

    async def get_payload(self, webhook_id: str, *, isn: str) -> dict[str, Any]:
        return await self._http.get(f"/webhooks/payload/{self._app_id}/{webhook_id}/{isn}")

    async def resend_event(self, webhook_id: str, *, isn: str) -> dict[str, Any]:
        res = await self._http.post(
            f"/dash/apps/{self._app_id}/webhooks/{webhook_id}/events/{isn}",
            json={},
        )
        return _webhook_event(res["event"])
