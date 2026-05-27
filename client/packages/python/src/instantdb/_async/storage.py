"""Storage uploads. Direct PUT with raw bytes — no presign step."""

from __future__ import annotations

from typing import Any

from instantdb._async.http import _AsyncHTTP
from instantdb._io import FileSource, _read_bytes_offloaded_async


class AsyncStorage:
    def __init__(self, http: _AsyncHTTP, *, app_id: str) -> None:
        self._http = http
        self._app_id = app_id

    async def upload_file(
        self,
        path: str,
        file: FileSource,
        *,
        content_type: str = "application/octet-stream",
        content_disposition: str | None = None,
    ) -> dict[str, Any]:
        data = await _read_bytes_offloaded_async(file)
        headers = {
            "path": path,
            "content-type": content_type,
            "content-length": str(len(data)),
        }
        if content_disposition is not None:
            headers["content-disposition"] = content_disposition
        return await self._http.put_binary(
            "/admin/storage/upload",
            content=data,
            extra_headers=headers,
            params={"app_id": self._app_id},
        )
