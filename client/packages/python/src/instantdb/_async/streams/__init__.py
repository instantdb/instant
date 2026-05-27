"""Durable append-only byte streams over bidirectional SSE.

Async-only — the whole `_async/streams/` subtree is listed in ASYNC_ONLY
in scripts/run_unasync.py. The connection layer runs an SSE receive task
in parallel with user-facing `write()` calls, coordinates via
`asyncio.Queue` / `Event` / `Lock` / `Future`, and reconnects with a
`stream-flushed` ready-gate. unasync's token-rewrite model has no clean
translation for these patterns; a threading-based parallel implementation
would be the v1.1+ option if user signal warrants it.

Usage:
    async with adb.streams.write(client_id="...") as writer:
        await writer.write("chunk one")
        await writer.write("chunk two")

    async with adb.streams.read(client_id="...") as reader:
        async for chunk in reader:
            process(chunk)
"""

from __future__ import annotations

from typing import Any

from instantdb._async.http import _AsyncHTTP
from instantdb._async.streams.reader import AsyncStreamReader
from instantdb._async.streams.writer import AsyncStreamWriter


class AsyncStreams:
    def __init__(self, http: _AsyncHTTP) -> None:
        self._http = http

    def write(
        self,
        *,
        client_id: str,
        rule_params: dict[str, Any] | None = None,
    ) -> AsyncStreamWriter:
        return AsyncStreamWriter(
            self._http,
            client_id=client_id,
            rule_params=rule_params,
        )

    def read(
        self,
        *,
        client_id: str | None = None,
        stream_id: str | None = None,
        byte_offset: int = 0,
        rule_params: dict[str, Any] | None = None,
    ) -> AsyncStreamReader:
        return AsyncStreamReader(
            self._http,
            client_id=client_id,
            stream_id=stream_id,
            byte_offset=byte_offset,
            rule_params=rule_params,
        )


__all__ = ["AsyncStreamReader", "AsyncStreamWriter", "AsyncStreams"]
