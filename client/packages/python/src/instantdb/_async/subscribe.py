"""SSE-based live query subscriptions on AsyncInstant.

Async-only — listed in ASYNC_ONLY in scripts/run_unasync.py. The retry
loop runs in a background `asyncio.create_task`, feeds an `asyncio.Queue`
that the async iterator drains, and cancels on `aclose()`. unasync's
token-rewrite model has no clean translation for the task / queue /
cancellation primitives; a threading-based parallel implementation would
be the v1.1+ option if user signal warrants it.

Usage:

    async with adb.subscribe_query({"goals": {}}) as sub:
        async for payload in sub:
            if payload["type"] == "error":
                break
            process(payload["data"])

Payload shape mirrors the JS SDK, with snake_case keys for SDK-shaped fields:
    ok:    {"type": "ok", "data": ..., "page_info": ..., "session_info": ...}
    error: {"type": "error", "error": InstantAPIError,
            "ready_state": ..., "is_closed": ..., "session_info": ...}

Reconnect: HTTP errors on the initial connect surface as an error payload and
end iteration. Transient SSE drops after the first `sse-init` reconnect
silently with linear backoff (matches JS Reactor's `+1s per attempt, capped`
shape). The same POST body re-establishes the subscription server-side, so
no client-side handshake replay is needed beyond re-opening the SSE.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from types import TracebackType
from typing import Any, Literal

import httpx_sse

from instantdb._async.http import _AsyncHTTP
from instantdb._errors import InstantAPIError
from instantdb._http_errors import api_error_from_response
from instantdb._logger import _NO_LOG, _Log
from instantdb._transact import id
from instantdb._version import __version__

ReadyState = Literal["connecting", "open", "closed"]

# Backlog cap matches JS subscribe.ts — live queries deliver full snapshots, so
# dropping the oldest pending payload is a safe way to bound memory.
_BACKLOG_MAX = 100

# Reconnect tuning matches streams/_connection.py: +0.5s per attempt, capped
# at 15s, reset after 5 min of uninterrupted connectivity.
_BACKOFF_MAX_SECONDS = 15.0
_BACKOFF_RESET_AFTER_SECONDS = 300.0


def _backoff_delay(attempts: int) -> float:
    return min(_BACKOFF_MAX_SECONDS, 0.5 * (attempts - 1))


class AsyncSubscription:
    """Async iterator over live query results. Returned by `AsyncInstant.subscribe_query`."""

    def __init__(
        self,
        http: _AsyncHTTP,
        *,
        query: dict[str, Any],
        log: _Log = _NO_LOG,
    ) -> None:
        self._http = http
        self._query = query
        self._log = log
        self._queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._task: asyncio.Task[None] | None = None
        self._session_info: dict[str, str] | None = None
        self._ready_state: ReadyState = "connecting"
        self._closed = False
        # Flips True on the first sse-init. Distinguishes "couldn't connect at
        # all" (terminal — surface error) from "lost a working connection"
        # (transient — silent retry).
        self._has_connected = False
        # Exposed for the sandbox reconnect tester, which force-closes the
        # response to simulate a drop. None between reconnect attempts.
        self._event_source: httpx_sse.EventSource | None = None

    @property
    def session_info(self) -> dict[str, str] | None:
        return self._session_info

    @property
    def ready_state(self) -> ReadyState:
        return self._ready_state

    @property
    def is_closed(self) -> bool:
        return self._closed

    async def __aenter__(self) -> AsyncSubscription:
        self._task = asyncio.create_task(self._run())
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._ready_state = "closed"
        self._log.info("[sse][close]")
        if self._task is not None and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        self._queue.put_nowait(None)

    def __aiter__(self) -> AsyncSubscription:
        return self

    async def __anext__(self) -> dict[str, Any]:
        item = await self._queue.get()
        if item is None:
            raise StopAsyncIteration
        return item

    def _enqueue(self, payload: dict[str, Any]) -> None:
        # Bounded backlog. Drop oldest first; live-query semantics mean a
        # newer snapshot subsumes anything older.
        while self._queue.qsize() >= _BACKLOG_MAX:
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        self._queue.put_nowait(payload)

    def _handle_message(self, msg: dict[str, Any]) -> None:
        if self._log.enabled:
            self._log.debug(f"[receive] {msg}")
        op = msg.get("op")
        if op == "sse-init":
            self._has_connected = True
            self._session_info = {
                "machine_id": msg["machine-id"],
                "session_id": msg["session-id"],
            }
        elif op == "add-query-ok":
            self._enqueue(
                {
                    "type": "ok",
                    "data": msg.get("result"),
                    "page_info": _format_page_info((msg.get("result-meta") or {}).get("page-info")),
                    "session_info": self._session_info,
                }
            )
        elif op == "refresh-ok":
            computations = msg.get("computations") or []
            if not computations:
                return
            comp = computations[0]
            self._enqueue(
                {
                    "type": "ok",
                    "data": comp.get("instaql-result"),
                    "page_info": _format_page_info(
                        (comp.get("result-meta") or {}).get("page-info")
                    ),
                    "session_info": self._session_info,
                }
            )
        elif op == "error":
            self._emit_error(
                InstantAPIError(
                    msg.get("message", "subscribe-query error"),
                    status=msg.get("status", 500),
                    body=msg,
                )
            )

    def _emit_error(self, error: InstantAPIError) -> None:
        self._log.error(f"[error] {error}")
        self._enqueue(
            {
                "type": "error",
                "error": error,
                "ready_state": self._ready_state,
                "is_closed": self.is_closed,
                "session_info": self._session_info,
            }
        )

    async def _run(self) -> None:
        attempts = 0
        last_attempt_at = 0.0
        try:
            while not self._closed:
                try:
                    await self._connect_and_consume()
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    if not self._has_connected:
                        self._emit_error(
                            InstantAPIError(
                                str(e), status=0, body={"type": None, "message": str(e)}
                            )
                        )
                        return
                    # Post-init failure: silent retry. Each new POST replays
                    # the query body, so the server re-establishes state.
                if self._closed:
                    break

                now = asyncio.get_running_loop().time()
                if last_attempt_at and now - last_attempt_at > _BACKOFF_RESET_AFTER_SECONDS:
                    attempts = 0
                attempts += 1
                last_attempt_at = now
                delay = _backoff_delay(attempts)
                self._log.info(f"[sse][reconnect] attempt={attempts} delay={delay}")
                if delay > 0:
                    await asyncio.sleep(delay)
        finally:
            self._ready_state = "closed"
            self._queue.put_nowait(None)

    async def _connect_and_consume(self) -> None:
        """One SSE attempt. Returns on normal completion; raises on errors.

        First-connect HTTP failures are signalled by emitting an error payload
        and setting `_closed = True` so the outer loop bails without retry.
        Post-init failures and network exceptions propagate up to the retry
        loop, which decides whether to backoff or end.
        """
        url = f"{self._http._api_uri}/admin/subscribe-query"
        body = {
            "query": self._query,
            "inference?": False,
            "versions": {
                "@instantdb/admin": __version__,
                "@instantdb/core": __version__,
            },
        }
        params = {"local_connection_id": id()}
        headers = self._http._headers()
        self._ready_state = "connecting"
        async with httpx_sse.aconnect_sse(
            self._http._client,
            "POST",
            url,
            json=body,
            params=params,
            headers=headers,
        ) as event_source:
            self._event_source = event_source
            try:
                response = event_source.response
                if not response.is_success:
                    await response.aread()
                    if not self._has_connected:
                        self._emit_error(api_error_from_response(response))
                        self._closed = True
                        return
                    raise api_error_from_response(response)
                self._ready_state = "open"
                self._log.info("[sse][open]")
                async for sse_event in event_source.aiter_sse():
                    if not sse_event.data:
                        continue
                    self._handle_message(json.loads(sse_event.data))
            finally:
                self._event_source = None


def _format_page_info(page_info: Any) -> dict[str, Any] | None:
    """Translate server kebab-with-question-mark keys to snake_case Python."""
    if not page_info:
        return None
    return {
        etype: {
            "start_cursor": v.get("start-cursor"),
            "end_cursor": v.get("end-cursor"),
            "has_next_page": v.get("has-next-page?"),
            "has_previous_page": v.get("has-previous-page?"),
        }
        for etype, v in page_info.items()
    }
