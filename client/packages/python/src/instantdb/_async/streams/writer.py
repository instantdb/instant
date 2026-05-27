"""Append-only stream writer.

Sends `start-stream`, then one `append-stream` per `write()`, then a final
`append-stream {done: true}` on context exit. Waits for `stream-flushed {done}`
before returning from `__aexit__` so the data is durable when the user code
resumes.
"""

from __future__ import annotations

import asyncio
from types import TracebackType
from typing import Any

from instantdb._async.http import _AsyncHTTP
from instantdb._async.streams._connection import _AsyncStreamConnection
from instantdb._errors import InstantAPIError, InstantError
from instantdb._transact import id

_FLUSH_TIMEOUT_SECONDS = 30.0


class AsyncStreamWriter:
    def __init__(
        self,
        http: _AsyncHTTP,
        *,
        client_id: str,
        rule_params: dict[str, Any] | None = None,
    ) -> None:
        self._http = http
        self._client_id = client_id
        self._rule_params = rule_params
        self._reconnect_token = id()
        self._connection: _AsyncStreamConnection | None = None
        self._start_event_id: str | None = None
        self._stream_id_future: asyncio.Future[str] | None = None
        # Unflushed buffer: chunks not yet acknowledged as on disk.
        self._buffer: list[tuple[str, int]] = []
        self._buffer_offset = 0  # bytes the server has confirmed flushed
        self._buffer_byte_size = 0  # bytes currently in `self._buffer`
        self._flushed_done = asyncio.Event()
        self._error: BaseException | None = None
        self._closed = False
        # Reconnect bookkeeping
        self._reconnecting = False
        self._reconnect_handshake: asyncio.Future[None] | None = None

    @property
    def stream_id(self) -> asyncio.Future[str]:
        """Awaitable that resolves to the server-assigned stream id."""
        if self._stream_id_future is None:
            raise InstantError(
                "Writer not opened; use 'async with adb.streams.write(...) as writer:'"
            )
        return self._stream_id_future

    @property
    def error(self) -> BaseException | None:
        """The last error seen by the writer, if any.

        `__aexit__` swallows failures from the final close-send and the
        durability flush wait so they don't mask an inner user exception.
        Callers who need to confirm a clean shutdown can check this after
        the context exits — `None` means everything flushed cleanly.
        """
        return self._error

    async def __aenter__(self) -> AsyncStreamWriter:
        self._stream_id_future = asyncio.get_running_loop().create_future()
        self._connection = _AsyncStreamConnection(
            self._http,
            on_message=self._on_message,
            on_reconnect=self._on_reconnect,
        )
        await self._connection.__aenter__()
        try:
            self._start_event_id = await self._connection.send(self._start_stream_msg())
        except Exception:
            await self._connection.aclose()
            raise
        return self

    def _start_stream_msg(self) -> dict[str, Any]:
        msg: dict[str, Any] = {
            "op": "start-stream",
            "client-id": self._client_id,
            "reconnect-token": self._reconnect_token,
        }
        if self._rule_params is not None:
            msg["rule-params"] = self._rule_params
        return msg

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        try:
            await self._finalize(abort_reason=str(exc) if exc else None)
        finally:
            if self._connection is not None:
                await self._connection.aclose()

    async def write(self, chunk: str) -> None:
        if self._closed:
            raise InstantError("Stream is closed")
        if self._error is not None:
            raise self._error
        assert self._connection is not None and self._stream_id_future is not None
        stream_id = await self._stream_id_future
        byte_len = len(chunk.encode("utf-8"))
        offset = self._buffer_offset + self._buffer_byte_size
        self._buffer.append((chunk, byte_len))
        self._buffer_byte_size += byte_len
        await self._connection.send(
            {
                "op": "append-stream",
                "stream-id": stream_id,
                "chunks": [chunk],
                "offset": offset,
                "done": False,
            }
        )

    async def _finalize(self, *, abort_reason: str | None = None) -> None:
        if self._closed:
            return
        self._closed = True
        if (
            self._stream_id_future is None
            or not self._stream_id_future.done()
            or self._stream_id_future.exception()
            or self._connection is None
        ):
            return
        stream_id = self._stream_id_future.result()
        close_msg: dict[str, Any] = {
            "op": "append-stream",
            "stream-id": stream_id,
            "chunks": [],
            "offset": self._buffer_offset + self._buffer_byte_size,
            "done": True,
        }
        if abort_reason:
            close_msg["abort-reason"] = abort_reason
        # Each leg is best-effort: a failed close send shouldn't skip the
        # flush wait, and a flush timeout shouldn't propagate out of
        # __aexit__ (it would mask any inner user exception). Errors are
        # stashed onto `self.error` so a caller who cares about durability
        # can check after the context exits.
        try:
            await self._connection.send(close_msg)
        except Exception as e:
            if self._error is None:
                self._error = e
        try:
            await asyncio.wait_for(self._flushed_done.wait(), timeout=_FLUSH_TIMEOUT_SECONDS)
        except Exception as e:
            if self._error is None:
                self._error = e

    def _on_message(self, msg: dict[str, Any]) -> None:
        op = msg.get("op")
        if op == "start-stream-ok":
            self._handle_start_ok(msg)
        elif op == "stream-flushed":
            self._handle_flushed(msg)
        elif op == "append-failed":
            # Server-side append failed (stream-state mismatch). Drop the SSE
            # so the retry loop re-handshakes via _on_reconnect.
            if self._connection is not None:
                asyncio.create_task(self._connection.force_reconnect())
        elif op == "error":
            self._handle_error_msg(msg)

    def _handle_start_ok(self, msg: dict[str, Any]) -> None:
        if msg.get("client-event-id") != self._start_event_id:
            return
        assert self._stream_id_future is not None
        offset = msg.get("offset", 0)
        if self._reconnecting:
            # Reconnect: server returns current byte offset. Discard locally-
            # buffered chunks that are now confirmed flushed; the resend of
            # remaining pending chunks happens in _on_reconnect after this
            # handler resolves the handshake future.
            self._reconnecting = False
            self._discard_flushed(offset)
            if self._reconnect_handshake is not None and not self._reconnect_handshake.done():
                self._reconnect_handshake.set_result(None)
            return
        if offset != 0:
            self._stream_id_future.set_exception(
                InstantError("Write stream is corrupted (initial offset != 0)")
            )
            return
        stream_id = msg.get("stream-id", "")
        if not self._stream_id_future.done():
            self._stream_id_future.set_result(stream_id)

    def _handle_flushed(self, msg: dict[str, Any]) -> None:
        offset = msg.get("offset", 0)
        self._discard_flushed(offset)
        if msg.get("done"):
            self._flushed_done.set()

    def _handle_error_msg(self, msg: dict[str, Any]) -> None:
        original = msg.get("original-event") or {}
        op = original.get("op")
        err = InstantAPIError(
            msg.get("message", "stream error"),
            status=0,
            body=msg,
        )
        if op == "start-stream":
            assert self._stream_id_future is not None
            if not self._stream_id_future.done():
                self._stream_id_future.set_exception(err)
            self._error = err
        elif op == "append-stream":
            self._error = err

    async def _on_reconnect(self) -> None:
        """Re-run the start handshake and resend any buffered chunks.

        Called by `_AsyncStreamConnection` after the SSE has re-opened and
        delivered a fresh `sse-init`. Must complete before user `send()`
        calls are unblocked, so the server-side stream state matches the
        client's view before any further appends.
        """
        if (
            self._closed
            or self._stream_id_future is None
            or not self._stream_id_future.done()
            or self._stream_id_future.exception() is not None
            or self._connection is None
        ):
            return
        self._reconnecting = True
        self._reconnect_handshake = asyncio.get_running_loop().create_future()
        try:
            self._start_event_id = await self._connection._send_internal(self._start_stream_msg())
            await asyncio.wait_for(self._reconnect_handshake, timeout=_FLUSH_TIMEOUT_SECONDS)
        except Exception as e:
            self._error = e
            self._reconnecting = False
            return
        if self._buffer:
            stream_id = self._stream_id_future.result()
            chunks = [chunk for chunk, _ in self._buffer]
            try:
                await self._connection._send_internal(
                    {
                        "op": "append-stream",
                        "stream-id": stream_id,
                        "chunks": chunks,
                        "offset": self._buffer_offset,
                        "done": False,
                    }
                )
            except Exception as e:
                self._error = e

    def _discard_flushed(self, flushed_offset: int) -> None:
        chunk_offset = self._buffer_offset
        segments_to_drop = 0
        dropped_byte_len = 0
        for _chunk, byte_len in self._buffer:
            next_chunk_offset = chunk_offset + byte_len
            if next_chunk_offset > flushed_offset:
                break
            chunk_offset = next_chunk_offset
            segments_to_drop += 1
            dropped_byte_len += byte_len
        if segments_to_drop > 0:
            self._buffer_offset += dropped_byte_len
            self._buffer_byte_size -= dropped_byte_len
            self._buffer = self._buffer[segments_to_drop:]
