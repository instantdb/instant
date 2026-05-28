"""process_payload dispatch resolution + validate/fetch_payloads behavior.

Dispatch is pure logic, so it stays as a unit test. validate/fetch_payloads are
wired against the shared httpx client; covered via a mock transport so we can
assert JWKS fallback, URL, Bearer header, and error-path translation without
touching a real server.
"""

import httpx
import pytest

from instantdb import AsyncInstant, InstantAPIError, InstantError
from instantdb._async.webhooks.receiver import _resolve_handler

_LOCAL_URI = "http://localhost:9888"
_CUSTOM_URI = "https://custom-api.example.test"
_LOCAL_JWK = {
    "kty": "OKP",
    "crv": "Ed25519",
    "alg": "EdDSA",
    "use": "sig",
    "kid": "503090235",
    "x": "qrSkwDaMITRMF9nOgpueqxgaAiuFmJperYE3mkyl8Ow",
}
_FIXTURE_SIG = (
    "t=1778610366,kid=503090235,"
    "v1=b4385e8285de38d22b6d8a6bdd03cc75287e356f1adf48cea257a8e6c056c04e"
    "f99af7d8e162afcaa07d201e97c7865cc91e552bd5def8f9ed4b52efc5843406"
)
_FIXTURE_BODY = (
    b'{"payloadUrl":"http://localhost:8888/webhooks/payload/f717e056-94af-'
    b"4556-9eec-288fb27847a1/4e119bf6-ef64-4e86-bf26-49a18dec54b8/0/328/"
    b'5307A1A0","token":"eyJraWQiOiI1MDMwOTAyMzUiLCJ0eXAiOiJKV1QiLCJhbGci'
    b"OiJFZERTQSJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0Ojg4ODgiLCJzdWIiOiJmNz"
    b"E3ZTA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJhcHAtaWQiOiJmNzE3Z"
    b"TA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJleHAiOjE3Nzg2MTM5NjYs"
    b"ImlzbiI6IjAvMzI4LzUzMDdBMUEwIiwid2ViaG9vay1pZCI6IjRlMTE5YmY2LWVmNjQ"
    b"tNGU4Ni1iZjI2LTQ5YTE4ZGVjNTRiOCJ9.SsI2iZ4rD_sDjUcgqyJ0agGXMgjTRU5PK"
    b'gcEQsE-txp5jTNoVouQU-GneTrKR2GmleETEzFrpf_v4HAnCDYABw"}'
)
_FIXTURE_RECEIVED_AT = 1778610366


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
        webhook_body = {"payloadUrl": "https://api.example.com/p/1", "token": "jwt-abc"}
        payload = await db.webhooks.fetch_payloads(webhook_body)

    assert payload == {"data": [], "idempotencyKey": "k-1"}
    req = captured[0]
    assert str(req.url) == "https://api.example.com/p/1"
    assert req.headers["authorization"] == "Bearer jwt-abc"


@pytest.mark.parametrize(
    "webhook_body",
    [
        {},
        {"payloadUrl": "x"},
        {"token": "x"},
        "a string, not an object",
        # Falsy-but-present values should fail the str check, not slip through.
        {"payloadUrl": None, "token": "t"},
        {"payloadUrl": "", "token": "t"},
        {"payloadUrl": "x", "token": None},
        {"payloadUrl": "x", "token": ""},
    ],
)
async def test_fetch_payloads_rejects_malformed_body(webhook_body):
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        with pytest.raises(InstantError):
            await db.webhooks.fetch_payloads(webhook_body)


async def test_fetch_payloads_raises_instantapi_error_on_non_2xx(mock_transport):
    transport, _ = mock_transport(lambda r: httpx.Response(404, json={"message": "not found"}))
    async with AsyncInstant(app_id="app", admin_token="abc", _transport=transport) as db:
        body = {"payloadUrl": "https://x/p", "token": "t"}
        with pytest.raises(InstantAPIError) as exc:
            await db.webhooks.fetch_payloads(body)

    assert exc.value.status == 404


# ---------- validate ----------


async def test_validate_returns_webhook_body_with_known_key():
    async with AsyncInstant(app_id="app", admin_token="abc", api_uri=_LOCAL_URI) as db:
        body = await db.webhooks.validate(
            signature_header=_FIXTURE_SIG,
            body=_FIXTURE_BODY,
            received_at=_FIXTURE_RECEIVED_AT,
        )

    assert body["payloadUrl"].startswith("http://localhost:8888/webhooks/payload/")
    assert body["token"].startswith("eyJraWQiOiI1MDMwOTAyMzUi")


async def test_validate_fetches_jwks_when_key_is_not_known(mock_transport):
    def respond(request):
        assert request.url.path == "/.well-known/webhooks/jwks.json"
        return httpx.Response(200, json={"keys": [_LOCAL_JWK]})

    transport, captured = mock_transport(respond)
    async with AsyncInstant(
        app_id="app",
        admin_token="abc",
        api_uri=_CUSTOM_URI,
        _transport=transport,
    ) as db:
        body = await db.webhooks.validate(
            signature_header=_FIXTURE_SIG,
            body=_FIXTURE_BODY,
            received_at=_FIXTURE_RECEIVED_AT,
        )

    assert body["payloadUrl"].startswith("http://localhost:8888/webhooks/payload/")
    assert len(captured) == 1
    assert str(captured[0].url) == f"{_CUSTOM_URI}/.well-known/webhooks/jwks.json"


async def test_validate_raises_when_jwks_has_no_matching_key(mock_transport):
    transport, _ = mock_transport(lambda r: httpx.Response(200, json={"keys": []}))
    async with AsyncInstant(
        app_id="app",
        admin_token="abc",
        api_uri=_CUSTOM_URI,
        _transport=transport,
    ) as db:
        with pytest.raises(InstantError, match="Could not find matching signing key"):
            await db.webhooks.validate(
                signature_header="t=1778610366,kid=503090235,v1=ab",
                body=b"{}",
                received_at=1778610366,
            )
