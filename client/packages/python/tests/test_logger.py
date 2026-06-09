"""Tests for the optional realtime logger (verbose + custom logger)."""

from __future__ import annotations

import logging

from instantdb import AsyncInstant, Logger
from instantdb._async.http import _AsyncHTTP
from instantdb._async.streams._connection import _AsyncStreamConnection
from instantdb._async.subscribe import AsyncSubscription
from instantdb._logger import make_logger


class _SpyLogger:
    """Duck-typed Logger that records every call."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def debug(self, message: str) -> None:
        self.calls.append(("debug", message))

    def info(self, message: str) -> None:
        self.calls.append(("info", message))

    def error(self, message: str) -> None:
        self.calls.append(("error", message))


# ---------- make_logger gating ----------


def test_disabled_logger_is_a_noop():
    spy = _SpyLogger()
    log = make_logger(False, spy)
    log.debug("x")
    log.info("y")
    log.error("z")
    assert spy.calls == []


def test_enabled_logger_forwards_to_base():
    spy = _SpyLogger()
    log = make_logger(True, spy)
    log.debug("hello")
    log.error("boom")
    assert spy.calls == [("debug", "hello"), ("error", "boom")]


def test_default_sink_is_the_instantdb_stdlib_logger(caplog):
    log = make_logger(True)
    with caplog.at_level(logging.DEBUG, logger="instantdb"):
        log.debug("via stdlib")
    assert "via stdlib" in caplog.text


def test_stdlib_logger_satisfies_the_logger_protocol():
    # A plain logging.Logger has debug/info/error, so it drops in with no
    # adapter. The single pre-formatted arg avoids %-formatting surprises.
    base: Logger = logging.getLogger("test.instant")
    log = make_logger(True, base)
    log.debug("single arg, no percent formatting")  # must not raise


# ---------- subscription wires the logger in ----------


async def test_subscription_logs_received_messages():
    spy = _SpyLogger()
    http = _AsyncHTTP(app_id="app", admin_token="abc")
    try:
        sub = AsyncSubscription(http, query={"goals": {}}, log=make_logger(True, spy))
        sub._handle_message({"op": "sse-init", "machine-id": "m", "session-id": "s"})
    finally:
        await http.aclose()
    assert any(level == "debug" and "[receive]" in msg for level, msg in spy.calls)


async def test_disabled_subscription_skips_payload_formatting():
    # The hot-path guard must skip building the log string when disabled, so a
    # silent connection never serializes the payload on every message.
    class _Tripwire(dict):
        formatted = False

        def __repr__(self) -> str:
            type(self).formatted = True
            return "<msg>"

    http = _AsyncHTTP(app_id="app", admin_token="abc")
    try:
        sub = AsyncSubscription(http, query={"goals": {}})  # no logger -> disabled
        sub._handle_message(_Tripwire({"op": "refresh-ok", "computations": []}))
    finally:
        await http.aclose()
    assert _Tripwire.formatted is False


# ---------- stream connection wires the logger in ----------


async def test_stream_connection_logs_received_messages():
    spy = _SpyLogger()
    http = _AsyncHTTP(app_id="app", admin_token="abc")
    try:
        conn = _AsyncStreamConnection(
            http,
            on_message=lambda _: None,
            log=make_logger(True, spy),
        )
        conn._dispatch({"op": "stream-append", "content": "hi"})
        assert any("[receive]" in msg for _, msg in spy.calls)
    finally:
        await http.aclose()


# ---------- client threads verbose/logger through ----------


async def test_client_passes_logger_to_subscriptions():
    spy = _SpyLogger()
    db = AsyncInstant(app_id="app", admin_token="abc", verbose=True, logger=spy)
    try:
        sub = db.subscribe_query({"goals": {}})
        sub._handle_message({"op": "sse-init", "machine-id": "m", "session-id": "s"})
    finally:
        await db.aclose()
    assert any("[receive]" in msg for _, msg in spy.calls)


async def test_client_is_silent_when_verbose_false():
    # A logger is supplied but verbose is off, so the log methods are no-ops.
    spy = _SpyLogger()
    db = AsyncInstant(app_id="app", admin_token="abc", verbose=False, logger=spy)
    try:
        sub = db.subscribe_query({"goals": {}})
        sub._handle_message({"op": "sse-init", "machine-id": "m", "session-id": "s"})
    finally:
        await db.aclose()
    assert spy.calls == []


async def test_as_user_clone_preserves_logger():
    spy = _SpyLogger()
    db = AsyncInstant(app_id="app", admin_token="abc", verbose=True, logger=spy)
    try:
        impersonated = db.as_user(guest=True)
        sub = impersonated.subscribe_query({"goals": {}})
        sub._handle_message({"op": "refresh-ok", "computations": []})
        # Logging through the clone proves both verbose and logger carried over:
        # a dropped verbose would silence it; a dropped logger would miss the spy.
        assert any("[receive]" in msg for _, msg in spy.calls)
    finally:
        await db.aclose()
