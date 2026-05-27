"""State + dispatch tests for AsyncSubscription."""

from collections.abc import AsyncIterator

import pytest

from instantdb._async.http import _AsyncHTTP
from instantdb._async.subscribe import _BACKLOG_MAX, AsyncSubscription, _format_page_info
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
