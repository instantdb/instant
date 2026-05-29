"""State + dispatch tests for stream writer / reader.

Pure-logic and state-machine paths that don't require a live SSE connection:
input validation, the writer's buffer-discard math, start-stream-ok dispatch
branches (corruption detection, event-id correlation, reconnect-resume), and
the reader's resume-offset wiring.
"""

import asyncio

import pytest

from instantdb import InstantError
from instantdb._async.http import _AsyncHTTP
from instantdb._async.streams import AsyncStreams
from instantdb._async.streams._connection import _AsyncStreamConnection
from instantdb._async.streams.reader import AsyncStreamReader
from instantdb._async.streams.writer import AsyncStreamWriter


def _http() -> _AsyncHTTP:
    return _AsyncHTTP(app_id="app", admin_token="abc")


def _writer() -> AsyncStreamWriter:
    return AsyncStreamWriter(_http(), client_id="c")


# ---------- streams.read validation ----------


def test_read_without_client_id_or_stream_id_raises():
    streams = AsyncStreams(_http())
    with pytest.raises(InstantError, match="client_id"):
        streams.read()


# ---------- writer: _discard_flushed buffer math ----------


def test_discard_flushed_drops_segments_fully_below_offset():
    w = _writer()
    w._buffer = [("a", 1), ("bc", 2), ("def", 3)]
    w._buffer_byte_size = 6
    w._discard_flushed(3)
    assert w._buffer == [("def", 3)]
    assert w._buffer_offset == 3
    assert w._buffer_byte_size == 3


def test_discard_flushed_keeps_segments_that_straddle_offset():
    # Partial flush within a segment shouldn't drop that segment — boundary discipline.
    w = _writer()
    w._buffer = [("ab", 2), ("cd", 2)]
    w._buffer_byte_size = 4
    w._discard_flushed(1)
    assert w._buffer == [("ab", 2), ("cd", 2)]
    assert w._buffer_offset == 0
    assert w._buffer_byte_size == 4


def test_discard_flushed_clears_buffer_at_full_flush():
    w = _writer()
    w._buffer = [("ab", 2), ("cd", 2)]
    w._buffer_byte_size = 4
    w._discard_flushed(4)
    assert w._buffer == []
    assert w._buffer_offset == 4
    assert w._buffer_byte_size == 0


# ---------- writer: _handle_start_ok dispatch ----------


async def test_start_ok_with_non_zero_offset_signals_corruption():
    w = _writer()
    w._start_event_id = "evt-1"
    w._stream_id_future = asyncio.get_running_loop().create_future()
    w._handle_start_ok({"client-event-id": "evt-1", "stream-id": "s-1", "offset": 5})
    with pytest.raises(InstantError, match="corrupted"):
        await w._stream_id_future


async def test_start_ok_resolves_future_with_stream_id():
    w = _writer()
    w._start_event_id = "evt-1"
    w._stream_id_future = asyncio.get_running_loop().create_future()
    w._handle_start_ok({"client-event-id": "evt-1", "stream-id": "s-1", "offset": 0})
    assert await w._stream_id_future == "s-1"


async def test_start_ok_ignores_mismatched_event_id():
    # Multiple writers can multiplex on a shared SSE; mismatched event ids
    # must not resolve someone else's future.
    w = _writer()
    w._start_event_id = "evt-1"
    w._stream_id_future = asyncio.get_running_loop().create_future()
    w._handle_start_ok({"client-event-id": "other", "stream-id": "wrong", "offset": 0})
    assert not w._stream_id_future.done()


# ---------- writer: reconnect handshake ----------


async def test_start_ok_during_reconnect_discards_flushed_and_resolves_handshake():
    # On reconnect, server returns a non-zero offset (current byte count).
    # That isn't a corruption signal — the writer should discard buffered
    # chunks already on disk and resolve the handshake so the reconnect
    # hook can resend whatever remains.
    w = _writer()
    w._stream_id_future = asyncio.get_running_loop().create_future()
    w._stream_id_future.set_result("s-1")
    w._start_event_id = "evt-2"
    w._reconnecting = True
    w._reconnect_handshake = asyncio.get_running_loop().create_future()
    w._buffer = [("a", 1), ("bc", 2)]
    w._buffer_byte_size = 3

    w._handle_start_ok({"client-event-id": "evt-2", "stream-id": "s-1", "offset": 1})

    assert not w._reconnecting
    assert w._buffer == [("bc", 2)]
    assert w._buffer_offset == 1
    assert w._buffer_byte_size == 2
    assert w._reconnect_handshake.done()


# ---------- reader: resume offset ----------


def test_subscribe_msg_uses_current_seen_offset_not_initial_byte_offset():
    # Reconnect must resume from wherever the reader had progressed, not
    # the byte_offset the user originally passed in.
    r = AsyncStreamReader(_http(), client_id="c", byte_offset=5)
    r._seen_offset = 12
    msg = r._subscribe_msg()
    assert msg["offset"] == 12


def test_subscribe_msg_omits_offset_when_zero():
    r = AsyncStreamReader(_http(), client_id="c")
    msg = r._subscribe_msg()
    assert "offset" not in msg


async def test_reader_on_reconnect_resubscribes_with_current_offset():
    # Mock the connection: capture what _send_internal receives, return a
    # new event id like the real path would.
    sent: list[dict] = []

    class _MockConn:
        async def _send_internal(self, msg, *, client_event_id=None):
            sent.append(msg)
            return "evt-after-reconnect"

    r = AsyncStreamReader(_http(), client_id="c")
    r._seen_offset = 12  # simulate progress before the drop
    r._connection = _MockConn()  # type: ignore[assignment]
    r._event_id = "evt-original"

    await r._on_reconnect()

    assert len(sent) == 1
    assert sent[0] == {"op": "subscribe-stream", "client-id": "c", "offset": 12}
    assert r._event_id == "evt-after-reconnect"


async def test_reader_on_reconnect_surfaces_resubscribe_error():
    class _FailingConn:
        async def _send_internal(self, msg, *, client_event_id=None):
            raise RuntimeError("push failed")

    r = AsyncStreamReader(_http(), client_id="c")
    r._connection = _FailingConn()  # type: ignore[assignment]
    r._event_id = "evt-original"

    with pytest.raises(RuntimeError, match="push failed"):
        await r._on_reconnect()

    with pytest.raises(RuntimeError, match="push failed"):
        await r.__anext__()
    assert r._inbox.get_nowait() is None


# ---------- message-level reconnect triggers ----------


class _ReconnectTrackingConn:
    """Minimal connection stand-in that records reconnect requests."""

    def __init__(self) -> None:
        self.reconnects = 0

    def request_reconnect(self) -> None:
        self.reconnects += 1


async def test_writer_append_failed_triggers_force_reconnect():
    # Server signals stream-state mismatch via append-failed; we drop the
    # SSE so the retry loop re-handshakes via _on_reconnect.
    conn = _ReconnectTrackingConn()
    w = _writer()
    w._connection = conn  # type: ignore[assignment]
    w._on_message({"op": "append-failed", "stream-id": "s-1"})
    assert conn.reconnects == 1


async def test_reader_stream_append_with_retry_triggers_force_reconnect():
    # Recoverable error in stream-append (retry=True) → reconnect, not surface.
    conn = _ReconnectTrackingConn()
    r = AsyncStreamReader(_http(), client_id="c")
    r._connection = conn  # type: ignore[assignment]
    r._event_id = "evt-1"
    r._on_message(
        {
            "op": "stream-append",
            "client-event-id": "evt-1",
            "error": "transient",
            "retry": True,
        }
    )
    assert conn.reconnects == 1
    # The message must NOT also have been pushed onto the materializer inbox.
    assert r._inbox.qsize() == 0


class _MockResponse:
    """Minimal httpx.Response-like stand-in for fetch tests."""

    def __init__(
        self,
        *,
        status_code: int = 200,
        body_chunks: list[bytes] | None = None,
        gate: asyncio.Event | None = None,
    ) -> None:
        self.status_code = status_code
        self.is_success = 200 <= status_code < 300
        self._body_chunks = body_chunks or []
        self._gate = gate

    async def aread(self) -> bytes:
        return b"".join(self._body_chunks)

    async def aiter_bytes(self):  # type: ignore[no-untyped-def]
        if self._gate is not None:
            await self._gate.wait()
        for chunk in self._body_chunks:
            yield chunk

    async def aclose(self) -> None:
        pass


class _BlockingResponse:
    """Response stand-in that blocks forever while streaming the body."""

    status_code = 200
    is_success = True

    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.closed = asyncio.Event()
        self.release = asyncio.Event()

    async def aread(self) -> bytes:
        return b""

    async def aiter_bytes(self):  # type: ignore[no-untyped-def]
        self.started.set()
        await self.release.wait()
        yield b"unreachable"

    async def aclose(self) -> None:
        self.closed.set()


async def test_reader_aclose_cancels_active_file_fetch():
    response = _BlockingResponse()

    async def blocking_fetch(url: str) -> _BlockingResponse:
        return response

    r = AsyncStreamReader(_http(), client_id="c")
    r._fetch = blocking_fetch  # type: ignore[assignment]
    r._materializer_task = asyncio.create_task(r._materialize_loop())
    r._inbox.put_nowait({"offset": 0, "files": [{"url": "A"}]})

    await asyncio.wait_for(response.started.wait(), timeout=1)
    await asyncio.wait_for(r.aclose(), timeout=1)

    assert response.closed.is_set()
    assert r._materializer_task.done()


async def test_reader_fetch_failure_triggers_reconnect_within_budget():
    conn = _ReconnectTrackingConn()
    r = AsyncStreamReader(_http(), client_id="c")
    r._connection = conn  # type: ignore[assignment]

    async def failing_fetch(url: str) -> _MockResponse:
        return _MockResponse(status_code=503)

    r._fetch = failing_fetch  # type: ignore[assignment]
    err = await r._process_append({"offset": 0, "files": [{"url": "https://x/y", "size": 10}]})
    assert err is None  # error suppressed; reconnect will retry
    assert conn.reconnects == 1
    assert r._fetch_failures == 1


async def test_reader_fetch_failure_surfaces_after_budget_exhausted():
    conn = _ReconnectTrackingConn()
    r = AsyncStreamReader(_http(), client_id="c")
    r._connection = conn  # type: ignore[assignment]
    r._fetch_failures = 10  # one short of the cap

    async def failing_fetch(url: str) -> _MockResponse:
        return _MockResponse(status_code=503)

    r._fetch = failing_fetch  # type: ignore[assignment]
    err = await r._process_append({"offset": 0, "files": [{"url": "https://x/y", "size": 10}]})
    assert isinstance(err, InstantError)
    assert "retries" in str(err)


async def test_reader_holds_partial_utf8_across_chunk_boundary():
    # A 4-byte emoji split across aiter_bytes chunks must not raise; the
    # decoder holds the trailing bytes until the rest arrives.
    emoji = "🚀"  # b"\xf0\x9f\x9a\x80"
    encoded = emoji.encode("utf-8")

    async def split_fetch(url: str) -> _MockResponse:
        return _MockResponse(body_chunks=[encoded[:2], encoded[2:]])

    r = AsyncStreamReader(_http(), client_id="c")
    r._fetch = split_fetch  # type: ignore[assignment]

    err = await r._process_append({"offset": 0, "files": [{"url": "A"}]})
    assert err is None

    yielded: list[str | BaseException | None] = []
    while not r._out.empty():
        yielded.append(r._out.get_nowait())
    # First chunk yields nothing (trailing UTF-8 bytes held), second completes.
    assert "".join(s for s in yielded if isinstance(s, str)) == emoji


async def test_reader_pipelines_next_fetch_before_current_body_consumed():
    # File N+1's GET must be initiated while file N's body is still being
    # streamed. Gating each body on an event makes this observable: B's
    # fetch has to register before we release A's gate.
    fetches_started: list[str] = []
    body_gates: dict[str, asyncio.Event] = {}

    async def gated_fetch(url: str) -> _MockResponse:
        fetches_started.append(url)
        gate = asyncio.Event()
        body_gates[url] = gate
        return _MockResponse(body_chunks=[f"chunk-{url}".encode()], gate=gate)

    r = AsyncStreamReader(_http(), client_id="c")
    r._fetch = gated_fetch  # type: ignore[assignment]

    proc = asyncio.create_task(
        r._process_append({"offset": 0, "files": [{"url": "A"}, {"url": "B"}]})
    )

    for _ in range(500):
        await asyncio.sleep(0.001)
        if "B" in fetches_started:
            break
    assert "B" in fetches_started, f"B was not prefetched; started: {fetches_started}"

    body_gates["A"].set()
    body_gates["B"].set()
    await proc

    yielded: list[str | BaseException | None] = []
    while not r._out.empty():
        yielded.append(r._out.get_nowait())
    assert yielded == ["chunk-A", "chunk-B"]


# ---------- connection lifecycle ----------


async def test_connection_aclose_cancels_inflight_reconnect_task():
    # _do_reconnect is spawned by _dispatch on each post-init sse-init.
    # If the user aclose()s mid-handshake, the task must be cancelled
    # rather than left dangling to post against a half-closed httpx client.
    on_reconnect_started = asyncio.Event()
    release_on_reconnect = asyncio.Event()

    async def slow_on_reconnect() -> None:
        on_reconnect_started.set()
        await release_on_reconnect.wait()

    conn = _AsyncStreamConnection(
        _http(), on_message=lambda _: None, on_reconnect=slow_on_reconnect
    )
    # Simulate the post-init reconnect path: connection already ran once
    # (_is_first_connect flipped), now a fresh sse-init arrives.
    conn._is_first_connect = False
    conn._dispatch(
        {
            "op": "sse-init",
            "machine-id": "m",
            "session-id": "s",
            "sse-token": "t",
        }
    )
    assert conn._reconnect_task is not None
    await on_reconnect_started.wait()

    # User-side cleanup before the reconnect hook finishes — the task
    # should not be left pending.
    await conn.aclose()
    assert conn._reconnect_task.done()


class _SlowForceReconnectConnection(_AsyncStreamConnection):
    def __init__(self) -> None:
        super().__init__(_http(), on_message=lambda _: None)
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def force_reconnect(self) -> None:
        self.started.set()
        await self.release.wait()


async def test_connection_request_reconnect_retains_task_until_done():
    conn = _SlowForceReconnectConnection()

    conn.request_reconnect()
    await conn.started.wait()

    assert len(conn._force_reconnect_tasks) == 1
    task = next(iter(conn._force_reconnect_tasks))

    conn.release.set()
    await task
    await asyncio.sleep(0)

    assert conn._force_reconnect_tasks == set()


async def test_connection_aclose_cancels_scheduled_force_reconnect():
    conn = _SlowForceReconnectConnection()

    conn.request_reconnect()
    await conn.started.wait()
    task = next(iter(conn._force_reconnect_tasks))

    await conn.aclose()

    assert conn._force_reconnect_tasks == set()
    assert task.cancelled()


async def test_connection_reconnect_hook_error_is_recorded_and_releases_ready():
    err = RuntimeError("hook failed")

    async def failing_on_reconnect() -> None:
        raise err

    conn = _AsyncStreamConnection(
        _http(), on_message=lambda _: None, on_reconnect=failing_on_reconnect
    )
    conn._ready_event.clear()

    await conn._do_reconnect()

    assert conn._error is err
    assert conn._ready_event.is_set()


async def test_writer_finalize_stashes_close_send_error():
    # If the durability flush send fails on context exit, the writer must
    # surface that via .error so the caller can tell their data may not
    # have been flushed.
    w = _writer()
    w._stream_id_future = asyncio.get_running_loop().create_future()
    w._stream_id_future.set_result("s-1")

    class _FailingConn:
        async def send(self, msg, *, client_event_id=None):
            raise RuntimeError("network down")

        async def aclose(self) -> None:
            pass

    w._connection = _FailingConn()  # type: ignore[assignment]
    await w._finalize()
    assert isinstance(w.error, RuntimeError)
    assert "network down" in str(w.error)


async def test_writer_finalize_stashes_flush_timeout(monkeypatch):
    # If the server never sends stream-flushed {done: true}, _finalize times
    # out and the timeout surfaces via .error.
    monkeypatch.setattr("instantdb._async.streams.writer._FLUSH_TIMEOUT_SECONDS", 0.01)
    w = _writer()
    w._stream_id_future = asyncio.get_running_loop().create_future()
    w._stream_id_future.set_result("s-1")

    class _SilentConn:
        async def send(self, msg, *, client_event_id=None):
            return "ok"  # close-msg accepted, but no stream-flushed ever arrives

        async def aclose(self) -> None:
            pass

    w._connection = _SilentConn()  # type: ignore[assignment]
    await w._finalize()
    assert isinstance(w.error, asyncio.TimeoutError)
