"""process_payload dispatch resolution + fetch_payloads behavior.

Dispatch is pure logic, so it stays as a unit test. fetch_payloads is wired
against the shared httpx client; covered via a mock transport so we can
assert the URL, Bearer header, and error-path translation without touching
a real server.
"""

import json

import httpx
import pytest

from instantdb import AsyncInstant, InstantAPIError, InstantError
from instantdb._async.webhooks.receiver import _resolve_handler


def _record(namespace, action, record_id="r1"):
    return {
        "namespace": namespace,
        "id": record_id,
        "action": action,
        "before": None if action == "create" else {"id": record_id, "title": "b"},
        "after": None if action == "delete" else {"id": record_id, "title": "a"},
        "idempotencyKey": f"{namespace}-{action}-{record_id}",
    }


# ---------- _resolve_handler precedence ----------


def test_exact_namespace_action_wins_over_namespace_default():
    exact = object()
    ns_default = object()
    handlers = {"goals": {"create": exact, "$default": ns_default}}
    assert _resolve_handler(handlers, "goals", "create") is exact


def test_namespace_default_used_when_no_exact_match():
    ns_default = object()
    handlers = {"goals": {"$default": ns_default}}
    assert _resolve_handler(handlers, "goals", "update") is ns_default


def test_top_level_default_catches_unmatched_namespace():
    top = object()
    handlers = {"goals": {"create": object()}, "$default": top}
    assert _resolve_handler(handlers, "todos", "delete") is top


def test_top_level_default_does_not_shadow_namespace_match():
    exact = object()
    top = object()
    handlers = {"goals": {"create": exact}, "$default": top}
    assert _resolve_handler(handlers, "goals", "create") is exact


def test_resolve_returns_none_when_nothing_matches():
    handlers = {"goals": {"create": object()}}
    assert _resolve_handler(handlers, "todos", "delete") is None


# ---------- process_payload ----------


async def test_process_payload_dispatches_in_record_order():
    seen = []

    async def on_create(record):
        seen.append(("create", record["id"]))

    async def on_other(record):
        seen.append(("default", record["id"]))

    handlers = {"goals": {"create": on_create, "$default": on_other}}
    payload = {
        "data": [
            _record("goals", "create", "a"),
            _record("goals", "update", "b"),
        ],
        "idempotencyKey": "k",
    }

    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        await db.webhooks.process_payload(handlers, payload)

    # Sequential dispatch preserves payload order. (Switched from
    # asyncio.gather to await-in-loop so the unasynced sync flavor doesn't
    # silently swallow a stray async handler — see spec § Receiver.)
    assert seen == [("create", "a"), ("default", "b")]


async def test_process_payload_propagates_handler_exception_and_stops_remaining():
    # If the first record's handler raises, subsequent records must not run.
    # Catches a regression to asyncio.gather, which would have called every
    # handler concurrently before propagating the exception.
    seen = []

    async def bad(record):
        seen.append(("bad", record["id"]))
        raise RuntimeError("boom")

    async def after(record):
        seen.append(("after", record["id"]))

    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        with pytest.raises(RuntimeError, match="boom"):
            await db.webhooks.process_payload(
                {"goals": {"create": bad, "update": after}},
                {
                    "data": [
                        _record("goals", "create", "a"),
                        _record("goals", "update", "b"),
                    ],
                    "idempotencyKey": "k",
                },
            )

    assert seen == [("bad", "a")]


async def test_process_payload_skips_records_with_no_handler():
    seen = []

    async def on_create(record):
        seen.append(record["id"])

    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        await db.webhooks.process_payload(
            {"goals": {"create": on_create}},
            {
                "data": [
                    _record("goals", "create", "a"),
                    _record("goals", "update", "b"),
                    _record("todos", "delete", "c"),
                ],
                "idempotencyKey": "k",
            },
        )

    assert seen == ["a"]


async def test_process_payload_treats_null_data_as_no_records():
    """Server contract is `data: []`, but `{"data": null}` shouldn't crash."""
    called = False

    async def on_create(record):
        nonlocal called
        called = True

    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        await db.webhooks.process_payload(
            {"goals": {"create": on_create}},
            {"data": None, "idempotencyKey": "k"},
        )

    assert called is False


async def test_process_payload_validates_records_when_schema_passed():
    """With a schema configured, each record is validated into its
    Pydantic model before dispatch; handlers see typed instances, not dicts.
    """
    from typing import Literal

    from pydantic import BaseModel, ConfigDict

    class Profile(BaseModel):
        model_config = ConfigDict(extra="ignore")
        id: str
        handle: str

    class ProfileCreateRecord(BaseModel):
        model_config = ConfigDict(extra="ignore")
        namespace: Literal["profiles"]
        id: str
        action: Literal["create"]
        before: None
        after: Profile
        idempotencyKey: str

    schema: dict = {
        "entities": {"profiles": Profile},
        "records": {("profiles", "create"): ProfileCreateRecord},
    }
    seen: list = []

    async def on_create(record):
        seen.append(record)

    async with AsyncInstant(app_id="app", admin_token="abc", _schema=schema) as db:
        await db.webhooks.process_payload(
            {"profiles": {"create": on_create}},
            {
                "data": [
                    {
                        "namespace": "profiles",
                        "id": "rec-1",
                        "action": "create",
                        "before": None,
                        "after": {"id": "p-1", "handle": "alyssa"},
                        "idempotencyKey": "key-1",
                    },
                ],
                "idempotencyKey": "p",
            },
        )

    assert len(seen) == 1
    assert isinstance(seen[0], ProfileCreateRecord)
    assert seen[0].after.handle == "alyssa"


# ---------- fetch_payloads (mock transport) ----------


async def test_fetch_payloads_uses_payload_url_and_jwt_bearer(mock_transport):
    captured = []

    def respond(request):
        captured.append(request)
        return httpx.Response(200, json={"data": [], "idempotencyKey": "k-1"})

    transport, _ = mock_transport(respond)
    async with AsyncInstant(app_id="app", admin_token="abc", _transport=transport) as db:
        body = json.dumps(
            {"payloadUrl": "https://api.example.com/p/1", "token": "jwt-abc"}
        ).encode()
        payload = await db.webhooks.fetch_payloads(body)

    assert payload == {"data": [], "idempotencyKey": "k-1"}
    req = captured[0]
    assert str(req.url) == "https://api.example.com/p/1"
    assert req.headers["authorization"] == "Bearer jwt-abc"


@pytest.mark.parametrize(
    "body",
    [
        b"not json",
        b'{"payloadUrl": "x"}',
        b'{"token": "x"}',
        b'"a string, not an object"',
        # Falsy-but-present values should fail the str check, not slip through.
        b'{"payloadUrl": null, "token": "t"}',
        b'{"payloadUrl": "", "token": "t"}',
        b'{"payloadUrl": "x", "token": null}',
        b'{"payloadUrl": "x", "token": ""}',
    ],
)
async def test_fetch_payloads_rejects_malformed_body(body):
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        with pytest.raises(InstantError):
            await db.webhooks.fetch_payloads(body)


async def test_fetch_payloads_raises_instantapi_error_on_non_2xx(mock_transport):
    transport, _ = mock_transport(lambda r: httpx.Response(404, json={"message": "not found"}))
    async with AsyncInstant(app_id="app", admin_token="abc", _transport=transport) as db:
        body = json.dumps({"payloadUrl": "https://x/p", "token": "t"}).encode()
        with pytest.raises(InstantAPIError) as exc:
            await db.webhooks.fetch_payloads(body)

    assert exc.value.status == 404


# ---------- validate_signature attaches to the instance api_uri ----------


async def test_validate_signature_uses_client_api_uri():
    # Default api_uri is the prod URL; the localhost fixture's kid doesn't
    # match any prod key, so this should raise without doing any crypto work.
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        with pytest.raises(InstantError, match="No trusted signing key"):
            db.webhooks.validate_signature(
                signature_header="t=1778610366,kid=503090235,v1=ab",
                body=b"{}",
                received_at=1778610366,
            )
