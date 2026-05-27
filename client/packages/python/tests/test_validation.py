import json

import httpx
import pytest

from instantdb import AsyncInstant, InstantError
from instantdb._async.http import _AsyncHTTP
from instantdb._version import __version__

# ---------- header construction ----------


def test_default_headers_include_app_id_and_versions():
    http = _AsyncHTTP(app_id="app-1", admin_token="abc")
    h = http._headers()
    assert h["content-type"] == "application/json"
    assert h["app-id"] == "app-1"
    assert h["authorization"] == "Bearer abc"
    assert h["Instant-Admin-Version"] == __version__
    assert h["Instant-Core-Version"] == __version__


def test_unauthenticated_strips_everything_but_content_type():
    # verify_token-style endpoints authenticate via the body.
    http = _AsyncHTTP(app_id="app-1", admin_token="abc")
    assert http._headers(unauthenticated=True) == {"content-type": "application/json"}


def test_impersonation_headers_layer_on_top_of_auth():
    http = _AsyncHTTP(
        app_id="app-1",
        admin_token="abc",
        impersonation={"as-email": "alyssa@example.com"},
    )
    h = http._headers()
    assert h["as-email"] == "alyssa@example.com"
    assert h["authorization"] == "Bearer abc"  # admin token still present


# ---------- AsyncInstant constructor ----------


async def test_async_context_manager_closes_underlying_client():
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        assert not db._http._client.is_closed
    assert db._http._client.is_closed


# ---------- auth: lookup-param validation ----------


@pytest.mark.parametrize("method_name", ["get_user", "delete_user", "sign_out"])
async def test_user_lookup_methods_require_exactly_one_param(method_name):
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        method = getattr(db.auth, method_name)
        with pytest.raises(InstantError):
            await method()
        with pytest.raises(InstantError):
            await method(email="a@b.com", id="123")


async def test_create_token_requires_exactly_one_of_email_or_id():
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        with pytest.raises(InstantError):
            await db.auth.create_token()
        with pytest.raises(InstantError):
            await db.auth.create_token(email="a@b.com", id="123")


# ---------- auth: behavior tests via mock_transport fixture ----------


async def test_verify_token_uses_unauthenticated_headers_and_app_id_in_body(mock_transport):
    # The server tolerates admin headers here, so an accidental addition
    # would diverge silently from JS — this test catches that.
    transport, captured = mock_transport(
        lambda r: httpx.Response(200, json={"user": {"id": "u-1"}})
    )
    async with AsyncInstant(app_id="app", admin_token="abc", _transport=transport) as db:
        user = await db.auth.verify_token("rt-xyz")

    assert user == {"id": "u-1"}
    req = captured[0]
    assert "authorization" not in req.headers
    assert "app-id" not in req.headers
    assert json.loads(req.content) == {"app-id": "app", "refresh-token": "rt-xyz"}
