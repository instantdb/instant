import json
from datetime import datetime, timezone

import httpx
import pytest

from instantdb import AsyncInstant, InstantError, id

# ---------- as_user ----------


async def test_as_user_validates_exactly_one_kind():
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        with pytest.raises(InstantError):
            db.as_user()
        with pytest.raises(InstantError):
            db.as_user(email="a@b.com", guest=True)


@pytest.mark.parametrize(
    "kwargs, expected",
    [
        ({"email": "alyssa@example.com"}, {"as-email": "alyssa@example.com"}),
        ({"token": "rt-xyz"}, {"as-token": "rt-xyz"}),
        ({"guest": True}, {"as-guest": "true"}),
    ],
)
async def test_as_user_dispatches_to_correct_impersonation_header(kwargs, expected):
    async with (
        AsyncInstant(app_id="app", admin_token="abc") as db,
        db.as_user(**kwargs) as scoped,
    ):
        assert scoped._impersonation == expected


async def test_as_user_returns_a_new_instance():
    async with (
        AsyncInstant(app_id="app", admin_token="abc") as db,
        db.as_user(email="a@b.com") as scoped,
    ):
        assert scoped is not db
        assert db._impersonation is None


async def test_as_user_shares_underlying_httpx_client():
    # Connection pool / TLS handshakes are reused across scoped clients.
    # Scoped __aexit__ must NOT close the parent's client.
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        async with db.as_user(email="a@b.com") as scoped:
            assert scoped._http._client is db._http._client
            assert not scoped._http._owns_client
        assert not db._http._client.is_closed
    assert db._http._client.is_closed


# ---------- env-var fallback ----------


async def test_env_var_fallback_populates_app_id_and_admin_token(monkeypatch):
    monkeypatch.setenv("INSTANT_APP_ID", "env-app")
    monkeypatch.setenv("INSTANT_ADMIN_TOKEN", "env-token")
    async with AsyncInstant() as db:
        assert db._app_id == "env-app"
        assert db._admin_token == "env-token"


async def test_explicit_kwargs_win_over_env_vars(monkeypatch):
    monkeypatch.setenv("INSTANT_APP_ID", "env-app")
    monkeypatch.setenv("INSTANT_ADMIN_TOKEN", "env-token")
    async with AsyncInstant(app_id="kwarg-app", admin_token="kwarg-token") as db:
        assert db._app_id == "kwarg-app"
        assert db._admin_token == "kwarg-token"


async def test_raises_when_app_id_missing_from_both_kwarg_and_env():
    with pytest.raises(InstantError, match="INSTANT_APP_ID"):
        AsyncInstant()


async def test_allows_missing_admin_token_until_admin_operation():
    async with AsyncInstant(app_id="app") as db:
        assert db._admin_token is None
        with pytest.raises(InstantError, match="admin_token"):
            await db.query({"goals": {}})


async def test_as_user_token_works_without_admin_token(mock_transport):
    transport, captured = mock_transport(lambda r: httpx.Response(200, json={"goals": []}))
    async with AsyncInstant(app_id="app", _transport=transport) as db:
        await db.as_user(token="rt-abc").query({"goals": {}})

    req = captured[0]
    assert req.headers["as-token"] == "rt-abc"
    assert "authorization" not in req.headers


async def test_as_user_guest_works_without_admin_token(mock_transport):
    transport, captured = mock_transport(lambda r: httpx.Response(200, json={"goals": []}))
    async with AsyncInstant(app_id="app", _transport=transport) as db:
        await db.as_user(guest=True).query({"goals": {}})

    req = captured[0]
    assert req.headers["as-guest"] == "true"
    assert "authorization" not in req.headers


async def test_as_user_preserves_missing_admin_token_when_env_changes(monkeypatch):
    async with AsyncInstant(app_id="app") as db:
        monkeypatch.setenv("INSTANT_ADMIN_TOKEN", "later-env-token")
        async with db.as_user(token="rt-abc") as scoped:
            assert scoped._admin_token is None


async def test_as_user_email_requires_admin_token():
    async with AsyncInstant(app_id="app") as db:
        with pytest.raises(InstantError, match="admin_token"):
            await db.as_user(email="alyssa@example.com").query({"goals": {}})


# ---------- debug methods require an as_user context ----------


@pytest.mark.parametrize("method", ["debug_query", "debug_transact"])
async def test_debug_methods_require_as_user_context(method):
    async with AsyncInstant(app_id="app", admin_token="abc") as db:
        with pytest.raises(InstantError, match="as_user"):
            if method == "debug_query":
                await db.debug_query({"goals": {}})
            else:
                await db.debug_transact(db.tx.goals[id()].update({"title": "x"}))


# ---------- query: rule_params injection ----------


async def test_query_injects_rule_params_inside_query_not_at_body_level(mock_transport):
    """The non-obvious bit: `$$ruleParams` nests INSIDE the query object."""
    transport, captured = mock_transport(lambda r: httpx.Response(200, json={"goals": []}))
    async with AsyncInstant(app_id="app", admin_token="abc", _transport=transport) as db:
        await db.query({"goals": {}}, rule_params={"region": "us"})

    body = json.loads(captured[0].content)
    assert body["query"]["$$ruleParams"] == {"region": "us"}
    assert "$$ruleParams" not in body  # not at body top level
    assert body["inference?"] is False


async def test_transact_serializes_datetime_values(mock_transport):
    transport, captured = mock_transport(lambda r: httpx.Response(200, json={"tx-id": "tx-1"}))
    due_at = datetime(2026, 5, 28, 12, 30, tzinfo=timezone.utc)
    async with AsyncInstant(app_id="app", admin_token="abc", _transport=transport) as db:
        await db.transact(db.tx.goals[id()].update({"dueAt": due_at}))

    body = json.loads(captured[0].content)
    assert body["steps"][0][3]["dueAt"] == due_at.isoformat()
    assert body["throw-on-missing-attrs?"] is False
