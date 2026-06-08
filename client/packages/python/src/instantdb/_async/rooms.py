"""Rooms presence read."""

from __future__ import annotations

from typing import Any

from instantdb._async.http import _AsyncHTTP


class AsyncRooms:
    def __init__(self, http: _AsyncHTTP, *, app_id: str) -> None:
        self._http = http
        self._app_id = app_id

    async def get_presence(self, room_type: str, room_id: str) -> dict[str, Any]:
        # Presence reads always use admin auth, even on an as_user() client,
        # matching the JS SDK (its Rooms never receives impersonation opts).
        result = await self._http.get(
            "/admin/rooms/presence",
            params={
                "app_id": self._app_id,
                "room-type": room_type,
                "room-id": room_id,
            },
            admin_only=True,
        )
        # Server returns {"sessions": null} for empty rooms; normalize to {}.
        return result.get("sessions") or {}
