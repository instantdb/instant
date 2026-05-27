"""Admin auth surface — magic codes, tokens, user management."""

from __future__ import annotations

from typing import Any

from instantdb._async.http import _AsyncHTTP
from instantdb._errors import InstantError


class AsyncAuth:
    def __init__(self, http: _AsyncHTTP, *, app_id: str) -> None:
        self._http = http
        self._app_id = app_id

    async def send_magic_code(self, email: str) -> str:
        result = await self._http.post(
            "/admin/send_magic_code",
            params={"app_id": self._app_id},
            json={"email": email},
        )
        return result["code"]

    async def generate_magic_code(self, email: str) -> str:
        result = await self._http.post(
            "/admin/magic_code",
            params={"app_id": self._app_id},
            json={"email": email},
        )
        return result["code"]

    async def check_magic_code(
        self,
        *,
        email: str,
        code: str,
        extra_fields: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], bool]:
        body: dict[str, Any] = {"email": email, "code": code}
        if extra_fields is not None:
            body["extra-fields"] = extra_fields
        result = await self._http.post(
            "/admin/verify_magic_code",
            params={"app_id": self._app_id},
            json=body,
        )
        return result["user"], result["created"]

    async def create_token(self, *, email: str | None = None, id: str | None = None) -> str:
        body = _exactly_one({"email": email, "id": id})
        result = await self._http.post(
            "/admin/refresh_tokens",
            params={"app_id": self._app_id},
            json=body,
        )
        return result["user"]["refresh_token"]

    async def verify_token(self, token: str) -> dict[str, Any]:
        # This endpoint authenticates via the body, not the admin headers.
        result = await self._http.post(
            "/runtime/auth/verify_refresh_token",
            params={"app_id": self._app_id},
            json={"app-id": self._app_id, "refresh-token": token},
            unauthenticated=True,
        )
        return result["user"]

    async def get_user(
        self,
        *,
        email: str | None = None,
        id: str | None = None,
        refresh_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = _exactly_one({"email": email, "id": id, "refresh_token": refresh_token})
        params["app_id"] = self._app_id
        result = await self._http.get("/admin/users", params=params)
        return result["user"]

    async def delete_user(
        self,
        *,
        email: str | None = None,
        id: str | None = None,
        refresh_token: str | None = None,
    ) -> dict[str, Any] | None:
        params = _exactly_one({"email": email, "id": id, "refresh_token": refresh_token})
        params["app_id"] = self._app_id
        result = await self._http.delete("/admin/users", params=params)
        return result["deleted"]

    async def sign_out(
        self,
        *,
        email: str | None = None,
        id: str | None = None,
        refresh_token: str | None = None,
    ) -> None:
        body = _exactly_one({"email": email, "id": id, "refresh_token": refresh_token})
        await self._http.post(
            "/admin/sign_out",
            params={"app_id": self._app_id},
            json=body,
        )


def _exactly_one(kwargs: dict[str, Any]) -> dict[str, Any]:
    provided = {k: v for k, v in kwargs.items() if v is not None}
    if len(provided) != 1:
        names = ", ".join(kwargs.keys())
        raise InstantError(f"Expected exactly one of: {names}")
    return provided
