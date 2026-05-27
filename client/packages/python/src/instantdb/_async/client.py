"""Async client. Query, transact, impersonation, debug helpers."""

from __future__ import annotations

import os
from types import TracebackType
from typing import Any

import httpx

from instantdb._async.auth import AsyncAuth
from instantdb._async.http import DEFAULT_API_URI, _AsyncHTTP
from instantdb._async.rooms import AsyncRooms
from instantdb._async.storage import AsyncStorage
from instantdb._async.streams import AsyncStreams
from instantdb._async.subscribe import AsyncSubscription
from instantdb._async.webhooks import AsyncWebhooks
from instantdb._errors import InstantError
from instantdb._transact import _flatten_chunks, _TxBuilder, _TxChunk


class AsyncInstant:
    def __init__(
        self,
        *,
        app_id: str | None = None,
        admin_token: str | None = None,
        api_uri: str = DEFAULT_API_URI,
        _impersonation: dict[str, str] | None = None,
        _transport: httpx.AsyncBaseTransport | None = None,
        _shared_client: httpx.AsyncClient | None = None,
    ) -> None:
        if app_id is None:
            app_id = os.environ.get("INSTANT_APP_ID")
        if not app_id:
            raise InstantError("app_id is required: pass app_id=... or set INSTANT_APP_ID env var")
        if admin_token is None:
            admin_token = os.environ.get("INSTANT_ADMIN_TOKEN")
        if not admin_token:
            raise InstantError(
                "admin_token is required: pass admin_token=... or set INSTANT_ADMIN_TOKEN env var"
            )
        self._app_id = app_id
        self._admin_token = admin_token
        self._api_uri = api_uri
        self._impersonation = _impersonation
        self._http = _AsyncHTTP(
            app_id=app_id,
            admin_token=admin_token,
            api_uri=api_uri,
            impersonation=_impersonation,
            transport=_transport,
            shared_client=_shared_client,
        )
        self.tx = _TxBuilder()
        self.auth = AsyncAuth(self._http, app_id=app_id)
        self.storage = AsyncStorage(self._http, app_id=app_id)
        self.rooms = AsyncRooms(self._http, app_id=app_id)
        self.streams = AsyncStreams(self._http)
        self.webhooks = AsyncWebhooks(self._http, app_id=app_id)

    def as_user(
        self,
        *,
        email: str | None = None,
        token: str | None = None,
        guest: bool = False,
    ) -> AsyncInstant:
        if sum([email is not None, token is not None, guest]) != 1:
            raise InstantError("as_user requires exactly one of: email, token, or guest=True")
        if email is not None:
            headers = {"as-email": email}
        elif token is not None:
            headers = {"as-token": token}
        else:
            headers = {"as-guest": "true"}
        return AsyncInstant(
            app_id=self._app_id,
            admin_token=self._admin_token,
            api_uri=self._api_uri,
            _impersonation=headers,
            _shared_client=self._http._client,
        )

    async def query(
        self,
        q: dict[str, Any],
        *,
        rule_params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if rule_params is not None:
            q = {"$$ruleParams": rule_params, **q}
        return await self._http.post(
            "/admin/query",
            params={"app_id": self._app_id},
            json={"query": q, "inference?": False},
        )

    def subscribe_query(
        self,
        q: dict[str, Any],
        *,
        rule_params: dict[str, Any] | None = None,
    ) -> AsyncSubscription:
        if rule_params is not None:
            q = {"$$ruleParams": rule_params, **q}
        return AsyncSubscription(self._http, query=q)

    async def transact(self, chunks: _TxChunk | list[_TxChunk]) -> dict[str, Any]:
        return await self._http.post(
            "/admin/transact",
            params={"app_id": self._app_id},
            json={
                "steps": _flatten_chunks(chunks),
                "throw-on-missing-attrs?": False,
            },
        )

    async def debug_query(
        self,
        q: dict[str, Any],
        *,
        rules: dict[str, Any] | None = None,
        rule_params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._require_impersonation("debug_query")
        if rule_params is not None:
            q = {"$$ruleParams": rule_params, **q}
        body: dict[str, Any] = {"query": q, "inference?": False}
        if rules is not None:
            body["rules-override"] = rules
        return await self._http.post(
            "/admin/query_perms_check",
            params={"app_id": self._app_id},
            json=body,
        )

    async def debug_transact(
        self,
        chunks: _TxChunk | list[_TxChunk],
        *,
        rules: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._require_impersonation("debug_transact")
        body: dict[str, Any] = {"steps": _flatten_chunks(chunks)}
        if rules is not None:
            body["rules-override"] = rules
        return await self._http.post(
            "/admin/transact_perms_check",
            params={"app_id": self._app_id},
            json=body,
        )

    def _require_impersonation(self, method_name: str) -> None:
        if not self._impersonation:
            raise InstantError(
                f"{method_name} requires an as_user(...) context "
                "since permission checks are user-scoped"
            )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> AsyncInstant:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()
