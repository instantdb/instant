"""Storage uploads. Direct PUT with raw bytes — no presign step."""

from __future__ import annotations

from pathlib import Path
from typing import IO, Any

from instantdb._async.http import _AsyncHTTP
from instantdb._errors import InstantError

FileSource = bytes | bytearray | Path | IO[bytes]


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
        data = _read_bytes(file)
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


def _read_bytes(file: FileSource) -> bytes:
    if isinstance(file, (bytes, bytearray)):
        return bytes(file)
    if isinstance(file, Path):
        return file.read_bytes()
    if hasattr(file, "read"):
        data = file.read()
        if not isinstance(data, bytes):
            raise InstantError(f"file-like read() must return bytes, got {type(data).__name__}")
        return data
    raise InstantError(
        f"upload_file accepts bytes, pathlib.Path, or a binary file-like; got {type(file).__name__}"
    )
