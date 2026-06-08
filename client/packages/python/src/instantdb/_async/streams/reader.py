"""Async iterator over a stream's chunks.

Sends `subscribe-stream` over the bidirectional SSE connection, then yields
chunks materialized from `stream-append` events. Server emits chunks as either
inline `content` (in-memory buffer) or S3 `files[]` (flushed); both are
unified into the chunk iterator transparently. Multi-file payloads are
pipelined — file N+1's GET is in flight while file N's body is being read.
"""

from __future__ import annotations

import asyncio
import codecs
import contextlib
from types import TracebackType
from typing import Any

import httpx

from instantdb._async.http import _AsyncHTTP
from instantdb._async.streams._connection import _AsyncStreamConnection
from instantdb._errors import InstantAPIError, InstantError

# Server can ask the reader to retry by sending stream-append with `retry: true`,
# or by responding with a 5xx on an S3 file fetch. Match JS's 10-attempt budget.
_MAX_FETCH_RETRIES = 10


class AsyncStreamReader:
    def __init__(
        self,
        http: _AsyncHTTP,
        *,
        client_id: str | None = None,
        stream_id: str | None = None,
        byte_offset: int = 0,
        rule_params: dict[str, Any] | None = None,
    ) -> None:
        if client_id is None and stream_id is None:
            raise InstantError("Must provide client_id or stream_id")
        self._http = http
        self._client_id = client_id
        self._stream_id = stream_id
        self._byte_offset = byte_offset
        self._rule_params = rule_params
        self._connection: _AsyncStreamConnection | None = None
        self._event_id: str | None = None
        # Outgoing chunks (str), errors, or None sentinel for end-of-stream.
        self._out: asyncio.Queue[str | BaseException | None] = asyncio.Queue()
        # Incoming raw stream-append messages; processed serially by the materializer.
        self._inbox: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        self._materializer_task: asyncio.Task[None] | None = None
        self._seen_offset = byte_offset
        self._closed = False
        self._fetch_failures = 0
        # Bytes returned from the server may split a UTF-8 codepoint across
        # message / file / aiter_bytes boundaries. Holding the decoder at the
        # reader level lets trailing bytes carry over until the rest arrives.
        self._decoder = codecs.getincrementaldecoder("utf-8")()

    async def __aenter__(self) -> AsyncStreamReader:
        self._connection = _AsyncStreamConnection(
            self._http,
            on_message=self._on_message,
            on_reconnect=self._on_reconnect,
        )
        await self._connection.__aenter__()
        self._materializer_task = asyncio.create_task(self._materialize_loop())
        try:
            self._event_id = await self._connection.send(self._subscribe_msg())
        except Exception:
            await self._connection.aclose()
            raise
        return self

    def _subscribe_msg(self) -> dict[str, Any]:
        msg: dict[str, Any] = {"op": "subscribe-stream"}
        if self._stream_id is not None:
            msg["stream-id"] = self._stream_id
        if self._client_id is not None:
            msg["client-id"] = self._client_id
        # Always carry the latest seen offset so reconnects resume from there.
        if self._seen_offset:
            msg["offset"] = self._seen_offset
        if self._rule_params is not None:
            msg["rule-params"] = self._rule_params
        return msg

    async def _on_reconnect(self) -> None:
        if self._closed or self._connection is None:
            return
        try:
            self._event_id = await self._connection._send_internal(self._subscribe_msg())
        except Exception as e:
            self._out.put_nowait(e)
            self._inbox.put_nowait(None)
            raise

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
        if self._connection is not None and self._event_id is not None:
            with contextlib.suppress(Exception):
                await self._connection.send(
                    {
                        "op": "unsubscribe-stream",
                        "subscribe-event-id": self._event_id,
                    }
                )
        if self._materializer_task is not None and not self._materializer_task.done():
            self._materializer_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._materializer_task
        if self._connection is not None:
            await self._connection.aclose()
        self._out.put_nowait(None)

    def __aiter__(self) -> AsyncStreamReader:
        return self

    async def __anext__(self) -> str:
        item = await self._out.get()
        if item is None:
            raise StopAsyncIteration
        if isinstance(item, BaseException):
            raise item
        return item

    def _on_message(self, msg: dict[str, Any]) -> None:
        op = msg.get("op")
        if op == "stream-append":
            if msg.get("client-event-id") != self._event_id:
                return
            # Server may flag a recoverable error: drop the SSE so the retry
            # loop re-handshakes and re-subscribes at the current offset.
            if msg.get("error") and msg.get("retry"):
                if self._connection is not None:
                    self._connection.request_reconnect()
                return
            self._inbox.put_nowait(msg)
        elif op == "error":
            original = msg.get("original-event") or {}
            if original.get("op") == "subscribe-stream":
                err = InstantAPIError(
                    msg.get("message", "subscribe-stream failed"),
                    status=0,
                    body=msg,
                )
                self._out.put_nowait(err)
                self._inbox.put_nowait(None)

    async def _materialize_loop(self) -> None:
        try:
            while True:
                msg = await self._inbox.get()
                if msg is None:
                    return
                error = msg.get("error")
                if error:
                    self._out.put_nowait(InstantAPIError(error, status=0, body=msg))
                    return
                err = await self._process_append(msg)
                if err is not None:
                    self._out.put_nowait(err)
                    return
                if msg.get("done"):
                    return
        finally:
            self._out.put_nowait(None)

    async def _process_append(self, msg: dict[str, Any]) -> BaseException | None:
        offset = msg.get("offset", 0)
        if offset > self._seen_offset:
            return InstantError("Stream is corrupted (offset gap)")
        discard_len = self._seen_offset - offset

        urls = [f["url"] for f in (msg.get("files") or []) if f.get("url")]
        if urls:
            in_flight: asyncio.Task[httpx.Response] | None = asyncio.create_task(
                self._fetch(urls[0])
            )
            try:
                for i in range(len(urls)):
                    assert in_flight is not None
                    current_resp = await in_flight
                    next_url = urls[i + 1] if i + 1 < len(urls) else None
                    in_flight = asyncio.create_task(self._fetch(next_url)) if next_url else None
                    result = await self._stream_response(current_resp, discard_len)
                    if isinstance(result, BaseException):
                        self._fetch_failures += 1
                        if self._fetch_failures > _MAX_FETCH_RETRIES:
                            return InstantError("Unable to process stream after fetch retries")
                        if self._connection is not None:
                            self._connection.request_reconnect()
                        return None
                    discard_len = result
                self._fetch_failures = 0
            finally:
                # Drop any prefetched-but-unused response.
                if in_flight is not None:
                    in_flight.cancel()
                    with contextlib.suppress(asyncio.CancelledError, Exception):
                        resp = await in_flight
                        await resp.aclose()

        content = msg.get("content")
        if content:
            encoded = content.encode("utf-8")
            if discard_len > 0:
                encoded = encoded[discard_len:]
                discard_len = 0
            if encoded:
                self._seen_offset += len(encoded)
                decoded = self._decoder.decode(encoded)
                if decoded:
                    self._out.put_nowait(decoded)
        return None

    async def _fetch(self, url: str) -> httpx.Response:
        """Initiate a streaming GET. Caller is responsible for closing."""
        request = self._http._client.build_request("GET", url)
        return await self._http._client.send(request, stream=True)

    async def _stream_response(
        self, response: httpx.Response, discard_len: int
    ) -> int | BaseException:
        """Consume a streaming response into the output queue. Closes the response."""
        try:
            if not response.is_success:
                await response.aread()
                return InstantError(f"Failed to fetch stream file: HTTP {response.status_code}")
            async for body_chunk in response.aiter_bytes():
                if discard_len >= len(body_chunk):
                    discard_len -= len(body_chunk)
                    continue
                if discard_len > 0:
                    body_chunk = body_chunk[discard_len:]
                    discard_len = 0
                if body_chunk:
                    self._seen_offset += len(body_chunk)
                    decoded = self._decoder.decode(body_chunk)
                    if decoded:
                        self._out.put_nowait(decoded)
        finally:
            await response.aclose()
        return discard_len
