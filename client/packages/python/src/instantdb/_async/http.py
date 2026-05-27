"""Async HTTP layer. Owns the httpx.AsyncClient and computes headers per-request.

Default headers (`app-id`, `authorization`, version stamps) are NOT baked into
the AsyncClient's `headers=` arg — instead they're computed per-request so we
can opt out of admin auth for endpoints like `/runtime/auth/verify_refresh_token`
that authenticate via the body.
"""

from __future__ import annotations

from typing import Any

import httpx

from instantdb._http_errors import api_error_from_response
from instantdb._version import __version__

DEFAULT_API_URI = "https://api.instantdb.com"
DEFAULT_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


class _AsyncHTTP:
    def __init__(
        self,
        *,
        app_id: str,
        admin_token: str,
        api_uri: str = DEFAULT_API_URI,
        impersonation: dict[str, str] | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        shared_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._app_id = app_id
        self._admin_token = admin_token
        self._api_uri = api_uri.rstrip("/")
        self._impersonation = impersonation or {}
        if shared_client is not None:
            self._client = shared_client
            self._owns_client = False
        else:
            self._client = httpx.AsyncClient(
                base_url=self._api_uri,
                timeout=DEFAULT_TIMEOUT,
                transport=transport,
            )
            self._owns_client = True

    def _headers(self, *, unauthenticated: bool = False) -> dict[str, str]:
        if unauthenticated:
            return {"content-type": "application/json"}
        h: dict[str, str] = {
            "content-type": "application/json",
            "app-id": self._app_id,
            "authorization": f"Bearer {self._admin_token}",
            "Instant-Admin-Version": __version__,
            "Instant-Core-Version": __version__,
        }
        h.update(self._impersonation)
        return h

    async def post(
        self,
        path: str,
        *,
        json: Any = None,
        params: dict[str, Any] | None = None,
        unauthenticated: bool = False,
    ) -> Any:
        return await self._request(
            "POST", path, json=json, params=params, unauthenticated=unauthenticated
        )

    async def get(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return await self._request("GET", path, params=params)

    async def delete(self, path: str, *, params: dict[str, Any] | None = None) -> Any:
        return await self._request("DELETE", path, params=params)

    async def put_binary(
        self,
        path: str,
        *,
        content: bytes,
        extra_headers: dict[str, str],
        params: dict[str, Any] | None = None,
    ) -> Any:
        headers = self._headers()
        headers.update(extra_headers)
        response = await self._client.request(
            "PUT", path, params=params, content=content, headers=headers
        )
        return self._handle_response(response)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        unauthenticated: bool = False,
    ) -> Any:
        response = await self._client.request(
            method,
            path,
            params=params,
            json=json,
            headers=self._headers(unauthenticated=unauthenticated),
        )
        return self._handle_response(response)

    @staticmethod
    def _handle_response(response: httpx.Response) -> Any:
        if response.is_success:
            return response.json() if response.content else None
        raise api_error_from_response(response)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()
