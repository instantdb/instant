"""State + dispatch tests for AsyncSubscription."""

from collections.abc import AsyncIterator

import pytest

from instantdb._async.http import _AsyncHTTP
from instantdb._async.subscribe import (
    _BACKLOG_MAX,
    AsyncSubscription,
    _backoff_delay,
    _format_page_info,
)
from instantdb._errors import InstantAPIError


@pytest.fixture
async def sub() -> AsyncIterator[AsyncSubscription]:
    http = _AsyncHTTP(app_id="app", admin_token="abc")
    try:
        yield AsyncSubscription(http, query={"goals": {}})
    finally:
        await http.aclose()


# ---------- _format_page_info ----------


def test_format_page_info_none_returns_none():
    assert _format_page_info(None) is None


def test_format_page_info_translates_server_keys_to_snake_case():
    src = {
        "goals": {
            "start-cursor": ["goals", "id", "g1", 0],
            "end-cursor": ["goals", "id", "g5", 0],
            "has-next-page?": True,
            "has-previous-page?": False,
        }
    }
    assert _format_page_info(src) == {
        "goals": {
            "start_cursor": ["goals", "id", "g1", 0],
            "end_cursor": ["goals", "id", "g5", 0],
            "has_next_page": True,
            "has_previous_page": False,
        }
    }


# ---------- _handle_message dispatch ----------


async def test_sse_init_sets_session_info_without_enqueueing(sub):
    sub._handle_message({"op": "sse-init", "machine-id": "m1", "session-id": "s1"})
    assert sub.session_info == {"machine_id": "m1", "session_id": "s1"}
    assert sub._queue.qsize() == 0


async def test_sse_init_flips_has_connected_for_reconnect_gating(sub):
    # _has_connected is the signal the retry loop uses to distinguish
    # "couldn't connect at all" (terminal) from "lost a working connection"
    # (transient — silent retry). Setting it on the first sse-init is
    # what makes post-init drops reconnect instead of bail.
    assert sub._has_connected is False
    sub._handle_message({"op": "sse-init", "machine-id": "m", "session-id": "s"})
    assert sub._has_connected is True


async def test_add_query_ok_enqueues_ok_payload_with_session(sub):
    sub._handle_message({"op": "sse-init", "machine-id": "m", "session-id": "s"})
    sub._handle_message({"op": "add-query-ok", "result": {"goals": [{"id": "g1"}]}})
    payload = sub._queue.get_nowait()
    assert payload["type"] == "ok"
    assert payload["data"] == {"goals": [{"id": "g1"}]}
    assert payload["session_info"] == {"machine_id": "m", "session_id": "s"}


async def test_refresh_ok_extracts_first_computation(sub):
    sub._handle_message(
        {
            "op": "refresh-ok",
            "computations": [
                {"instaql-result": {"goals": [{"id": "g1"}]}},
                {"instaql-result": {"goals": [{"id": "ignored"}]}},
            ],
        }
    )
    payload = sub._queue.get_nowait()
    assert payload["data"] == {"goals": [{"id": "g1"}]}


async def test_refresh_ok_with_empty_computations_is_noop(sub):
    sub._handle_message({"op": "refresh-ok", "computations": []})
    assert sub._queue.qsize() == 0


async def test_error_op_enqueues_error_payload(sub):
    sub._handle_message(
        {"op": "error", "status": 401, "message": "Unauthorized", "type": "auth-error"}
    )
    payload = sub._queue.get_nowait()
    assert payload["type"] == "error"
    assert isinstance(payload["error"], InstantAPIError)
    assert payload["error"].status == 401


# ---------- backlog bounding ----------


async def test_enqueue_drops_oldest_when_backlog_exceeds_cap(sub):
    # Live queries deliver full snapshots, so the oldest pending payload is
    # safe to drop. Bounds memory under fast producers / slow consumers.
    for i in range(_BACKLOG_MAX + 5):
        sub._enqueue({"i": i})
    assert sub._queue.qsize() == _BACKLOG_MAX
    first = sub._queue.get_nowait()
    assert first["i"] == 5  # items 0..4 were dropped


# ---------- backoff math ----------


def test_backoff_delay_first_retry_is_immediate():
    # First failure: no sleep. Pattern matches streams/_connection.py — most
    # transient drops resolve on the next attempt.
    assert _backoff_delay(1) == 0


def test_backoff_delay_grows_linearly_per_attempt():
    assert _backoff_delay(2) == 0.5
    assert _backoff_delay(3) == 1.0
    assert _backoff_delay(4) == 1.5


def test_backoff_delay_caps_at_max():
    # After enough attempts, hold at the ceiling rather than growing forever.
    assert _backoff_delay(100) == 15.0


# ---------- retry vs bail dispatch ----------


def _drain_queue(sub: AsyncSubscription) -> list:
    items = []
    while not sub._queue.empty():
        items.append(sub._queue.get_nowait())
    return items


async def test_first_connect_failure_emits_error_and_ends(monkeypatch):
    # If we never got an sse-init, treat the failure as terminal (auth /
    # 404 / DNS — retrying won't help). Surface as an error payload, then
    # end the iterator via the None sentinel.
    monkeypatch.setattr("instantdb._async.subscribe._backoff_delay", lambda _: 0)
    http = _AsyncHTTP(app_id="app", admin_token="abc")
    try:
        sub = AsyncSubscription(http, query={"goals": {}})

        attempts = 0

        async def fake_consume() -> None:
            nonlocal attempts
            attempts += 1
            raise RuntimeError("never got sse-init")

        sub._connect_and_consume = fake_consume  # type: ignore[method-assign]
        await sub._run()

        assert attempts == 1, "must not retry without ever having connected"
        items = _drain_queue(sub)
        assert items[0]["type"] == "error"
        assert items[-1] is None  # iterator-ending sentinel
    finally:
        await http.aclose()


async def test_post_init_failure_silently_retries(monkeypatch):
    # Once we've seen an sse-init, drops are transient — silent reconnect with
    # backoff. Closing the subscription from inside the second attempt stops
    # the loop so the test terminates.
    monkeypatch.setattr("instantdb._async.subscribe._backoff_delay", lambda _: 0)
    http = _AsyncHTTP(app_id="app", admin_token="abc")
    try:
        sub = AsyncSubscription(http, query={"goals": {}})
        attempts = 0

        async def fake_consume() -> None:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                sub._has_connected = True  # simulates first sse-init
                raise RuntimeError("transient drop")
            sub._enqueue({"type": "ok", "data": "post-reconnect"})
            sub._closed = True  # stop the retry loop

        sub._connect_and_consume = fake_consume  # type: ignore[method-assign]
        await sub._run()

        assert attempts == 2, "expected one failure + one successful retry"
        items = _drain_queue(sub)
        # No error payload — the transient drop was silent. Only the post-
        # reconnect payload and the end-of-iteration sentinel.
        assert items[0] == {"type": "ok", "data": "post-reconnect"}
        assert items[-1] is None
        assert not any(p and p.get("type") == "error" for p in items)
    finally:
        await http.aclose()
