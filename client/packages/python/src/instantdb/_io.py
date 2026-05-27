"""File-read helpers shared by both sync and async flavors.

`_read_bytes` is the actual reader (sync). The two thin wrappers
(`_read_bytes_offloaded_async` / `_read_bytes_offloaded_sync`) exist so
the async storage code can offload the read to a thread (avoiding event
loop stalls on large files), while the sync flavor just calls through.

The unasync codegen swaps `_read_bytes_offloaded_async` →
`_read_bytes_offloaded_sync` at translation time (see
`scripts/run_unasync.py:REPLACEMENTS`), so callers in `_async/storage.py`
get the offloaded version and the generated `_sync/storage.py` gets the
direct one.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import IO

from instantdb._errors import InstantError

FileSource = bytes | bytearray | Path | IO[bytes]


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


async def _read_bytes_offloaded_async(file: FileSource) -> bytes:
    """Async: read via `asyncio.to_thread` so a large file doesn't block
    the event loop."""
    return await asyncio.to_thread(_read_bytes, file)


def _read_bytes_offloaded_sync(file: FileSource) -> bytes:
    """Sync: no event loop to worry about, call directly."""
    return _read_bytes(file)
