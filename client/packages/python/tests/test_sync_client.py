"""Smoke tests for the generated sync `Instant` client.

The async client is the source of truth; these tests verify the unasync
rewrite produces a working sync surface. They mirror the most load-bearing
async tests in test_client.py + test_validation.py + test_webhooks_dispatch.py.

Subscribe and streams are async-only and not generated into _sync/ —
absence is asserted explicitly so the unasync exclusion stays honest.
"""

import json

import httpx
import pytest

from instantdb import Instant, InstantAPIError, InstantError
from instantdb._sync.http import _HTTP
from instantdb._version import __version__

_CUSTOM_URI = "https://custom-api.example.test"

# ---------- sync-only surface ----------


def test_instant_does_not_expose_subscribe_query_or_streams():
    # Subscribe + streams are async-only; spec § Sync surface area. If the
    # unasync rewrite ever stops stripping these, this test catches it.
    db = Instant(app_id="app", admin_token="abc")
    try:
        assert not hasattr(db, "subscribe_query")
        assert not hasattr(db, "streams")
    finally:
        db.close()


# ---------- constructor ----------


def test_env_var_fallback_populates_app_id_and_admin_token(monkeypatch):
    # Verifies the constructor body survives unasync (the if-None / env-get
    # / raise chain). Other env-var permutations are pure-logic mirrors of
    # the async tests — not re-tested here.
    monkeypatch.setenv("INSTANT_APP_ID", "env-app")
    monkeypatch.setenv("INSTANT_APP_ADMIN_TOKEN", "env-token")
    with Instant() as db:
        assert db._app_id == "env-app"
        assert db._admin_token == "env-token"


# ---------- as_user ----------


def test_as_user_shares_underlying_httpx_client():
    # Same invariant as the async client: scoped __exit__ must not close
    # the parent's connection pool.
    with Instant(app_id="app", admin_token="abc") as db:
        with db.as_user(email="a@b.com") as scoped:
            assert scoped._http._client is db._http._client
            assert not scoped._http._owns_client
        assert not db._http._client.is_closed
    assert db._http._client.is_closed


def test_as_user_token_works_without_admin_token(mock_transport):
    transport, captured = mock_transport(lambda r: httpx.Response(200, json={"goals": []}))
    with Instant(app_id="app", _transport=transport) as db:
        db.as_user(token="rt-abc").query({"goals": {}})

    req = captured[0]
    assert req.headers["as-token"] == "rt-abc"
    assert "authorization" not in req.headers


# ---------- headers ----------


def test_default_headers_include_app_id_and_versions():
    http = _HTTP(app_id="app-1", admin_token="abc")
    h = http._headers()
    assert h["app-id"] == "app-1"
    assert h["authorization"] == "Bearer abc"
    assert h["Instant-Admin-Version"] == __version__


# ---------- query: rule_params injection ----------


def test_query_injects_rule_params_inside_query_not_at_body_level(mock_transport):
    # Same property as the async test: $$ruleParams nests under "query", not
    # at the body root. Sync mirror via unasync should hold the same shape.
    transport, captured = mock_transport(lambda r: httpx.Response(200, json={"goals": []}))
    with Instant(app_id="app", admin_token="abc", _transport=transport) as db:
        db.query({"goals": {}}, rule_params={"region": "us"})

    body = json.loads(captured[0].content)
    assert body["query"]["$$ruleParams"] == {"region": "us"}
    assert "$$ruleParams" not in body


# ---------- webhooks ----------


def test_webhooks_process_payload_dispatches_to_sync_handler():
    seen = []

    def on_create(record):
        seen.append(record["id"])

    payload = {
        "data": [
            {
                "namespace": "goals",
                "id": "g1",
                "action": "create",
                "before": None,
                "after": {"id": "g1", "title": "x"},
                "idempotencyKey": "k",
            }
        ],
        "idempotencyKey": "p",
    }
    with Instant(app_id="app", admin_token="abc") as db:
        db.webhooks.process_payload({"goals": {"create": on_create}}, payload)
    assert seen == ["g1"]


def test_webhooks_fetch_payloads_raises_on_non_2xx(mock_transport):
    transport, _ = mock_transport(lambda r: httpx.Response(404, json={"message": "nope"}))
    with Instant(app_id="app", admin_token="abc", _transport=transport) as db:
        body = {"payloadUrl": "https://x/p", "token": "t"}
        with pytest.raises(InstantAPIError) as exc:
            db.webhooks.fetch_payloads(body)
    assert exc.value.status == 404


def test_webhooks_validate_uses_sync_jwks_fetch(mock_transport):
    transport, captured = mock_transport(lambda r: httpx.Response(200, json={"keys": []}))
    with (
        Instant(app_id="app", admin_token="abc", api_uri=_CUSTOM_URI, _transport=transport) as db,
        pytest.raises(InstantError, match="Could not find matching signing key"),
    ):
        db.webhooks.validate(
            signature_header="t=1778610366,kid=503090235,v1=ab",
            body=b"{}",
            received_at=1778610366,
        )
    assert str(captured[0].url) == f"{_CUSTOM_URI}/.well-known/webhooks/jwks.json"
