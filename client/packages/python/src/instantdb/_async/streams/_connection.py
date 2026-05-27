"""Bidirectional SSE connection for streams.

Opens `POST /admin/sse` for the receive side, posts outgoing messages to
`POST /admin/sse/push`. Outgoing messages carry a `client-event-id` so server
responses can be correlated.

This is intentionally separate from `_async/subscribe.py`, which only needs the
read-only path. Streams need bidirectional flow + the session token (`sse_token`)
that ties pushes back to the open SSE connection, and a retry loop that
re-opens the SSE and re-runs each stream's handshake on transient disconnect.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import Awaitable, Callable
from types import TracebackType
from typing import Any

import httpx
import httpx_sse

from instantdb._async.http import _AsyncHTTP
from instantdb._errors import InstantAPIError, InstantError
from instantdb._transact import id
from instantdb._version import __version__

# Linear backoff matching JS Reactor's shape (+per-attempt step, capped):
# +0.5s per attempt, capped at 15s, reset after 5 min of uninterrupted SSE.
_BACKOFF_MAX_SECONDS = 15.0
_BACKOFF_RESET_AFTER_SECONDS = 300.0


class _AsyncStreamConnection:
    """One bidirectional SSE connection with reconnect.

    Lifecycle:
        async with _AsyncStreamConnection(http, on_message=cb) as conn:
            event_id = await conn.send({"op": "start-stream", ...})

    The background task keeps the SSE open and retries on transient drops.
    On successful reconnect, `on_reconnect` (if provided) runs before
    user-facing sends are unblocked — the writer / reader uses this hook
    to re-handshake.
    """

    def __init__(
        self,
        http: _AsyncHTTP,
        *,
        on_message: Callable[[dict[str, Any]], None],
        on_reconnect: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._http = http
        self._on_message = on_message
        self._on_reconnect = on_reconnect
        self._init_params: dict[str, str] | None = None
        # Set when the connection is ready for user sends. Cleared on each
        # reconnect attempt; re-set once any reconnect hook completes.
        self._ready_event = asyncio.Event()
        self._is_first_connect = True
        self._task: asyncio.Task[None] | None = None
        self._send_lock = asyncio.Lock()
        self._event_source: httpx_sse.EventSource | None = None
        self._closed = False
        self._error: BaseException | None = None

    async def __aenter__(self) -> _AsyncStreamConnection:
        self._task = asyncio.create_task(self._run())
        await self._wait_for_ready()
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
        self._ready_event.set()
        if self._task is not None and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def send(self, msg: dict[str, Any], *, client_event_id: str | None = None) -> str:
        """Post one user-facing message; blocks during reconnect handshakes."""
        if self._closed:
            raise InstantError("Connection is closed")
        await self._ready_event.wait()
        if self._closed:
            raise InstantError("Connection is closed")
        return await self._send_internal(msg, client_event_id=client_event_id)

    async def force_reconnect(self) -> None:
        """Drop the current SSE so the retry loop re-opens it.

        Triggered by writer/reader when the server signals a message-level
        reconnect (e.g. `append-failed`, `stream-append.retry`). Closing the
        response causes the `aiter_sse` loop to exit; the retry layer in
        `_run` opens a fresh SSE and fires `on_reconnect`.
        """
        if self._closed:
            return
        event_source = self._event_source
        if event_source is None:
            return
        with contextlib.suppress(Exception):
            await event_source.response.aclose()

    async def _send_internal(
        self, msg: dict[str, Any], *, client_event_id: str | None = None
    ) -> str:
        """Post bypassing the ready-event gate. Used by reconnect hooks."""
        if self._init_params is None:
            raise InstantError("Connection not initialized")
        event_id = client_event_id or id()
        full_msg = {"client-event-id": event_id, **msg}
        body = {**self._init_params, "messages": [full_msg]}
        async with self._send_lock:
            response = await self._http._client.post(
                "/admin/sse/push",
                params={"app_id": self._http._app_id},
                json=body,
                headers=self._http._headers(),
            )
            if not response.is_success:
                raise _http_error_from_response(response)
        return event_id

    async def _wait_for_ready(self) -> None:
        """Block until the connection is ready or the background task fails."""
        assert self._task is not None
        ready_wait = asyncio.create_task(self._ready_event.wait())
        try:
            await asyncio.wait(
                {ready_wait, self._task},
                return_when=asyncio.FIRST_COMPLETED,
            )
        finally:
            if not ready_wait.done():
                ready_wait.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await ready_wait
        if self._init_params is not None and self._ready_event.is_set():
            return
        if self._error is not None:
            raise self._error
        raise InstantError("SSE connection closed before init")

    async def _run(self) -> None:
        url = f"{self._http._api_uri}/admin/sse"
        body = {
            "inference?": False,
            "versions": {
                "@instantdb/admin": __version__,
                "@instantdb/core": __version__,
            },
        }
        attempts = 0
        last_attempt_at = 0.0
        while not self._closed:
            self._init_params = None
            self._ready_event.clear()
            self._event_source = None
            try:
                async with httpx_sse.aconnect_sse(
                    self._http._client,
                    "POST",
                    url,
                    params={"app_id": self._http._app_id},
                    json=body,
                    headers=self._http._headers(),
                ) as event_source:
                    self._event_source = event_source
                    response = event_source.response
                    if not response.is_success:
                        await response.aread()
                        self._error = _http_error_from_response(response)
                        self._closed = True
                        self._ready_event.set()
                        return
                    async for sse_event in event_source.aiter_sse():
                        if not sse_event.data:
                            continue
                        payload = json.loads(sse_event.data)
                        messages = payload if isinstance(payload, list) else [payload]
                        for msg in messages:
                            self._dispatch(msg)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                if self._is_first_connect:
                    if self._error is None:
                        self._error = e
                    self._closed = True
                    self._ready_event.set()
                    return
                # Transient drop — fall through to backoff + retry.
            finally:
                self._event_source = None

            if self._closed:
                break

            now = asyncio.get_running_loop().time()
            if last_attempt_at and now - last_attempt_at > _BACKOFF_RESET_AFTER_SECONDS:
                attempts = 0
            attempts += 1
            last_attempt_at = now
            delay = min(_BACKOFF_MAX_SECONDS, 0.5 * (attempts - 1))
            if delay > 0:
                await asyncio.sleep(delay)

        self._ready_event.set()

    def _dispatch(self, msg: dict[str, Any]) -> None:
        if msg.get("op") == "sse-init":
            self._init_params = {
                "machine_id": msg["machine-id"],
                "session_id": msg["session-id"],
                "sse_token": msg["sse-token"],
            }
            if self._is_first_connect:
                self._is_first_connect = False
                self._ready_event.set()
            else:
                asyncio.create_task(self._do_reconnect())
            return
        self._on_message(msg)

    async def _do_reconnect(self) -> None:
        try:
            if self._on_reconnect is not None:
                await self._on_reconnect()
        except Exception as e:
            if self._error is None:
                self._error = e
        finally:
            self._ready_event.set()


def _http_error_from_response(response: httpx.Response) -> InstantAPIError:
    try:
        body: Any = response.json()
    except ValueError:
        body = {"type": None, "message": response.text}
    message = body.get("message", response.text) if isinstance(body, dict) else response.text
    return InstantAPIError(message, status=response.status_code, body=body)
