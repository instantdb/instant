"""Chunk-read helpers used by `_async/_upload_io.py`.

The async helper offloads via `asyncio.to_thread` so large uploads don't
stall the event loop. The unasync rewrite swaps it for the sync helper
in the generated `_sync/` tree.
"""

from __future__ import annotations

import asyncio
from typing import IO


async def _read_chunk_offloaded_async(fp: IO[bytes], size: int) -> bytes:
    return await asyncio.to_thread(fp.read, size)


def _read_chunk_offloaded_sync(fp: IO[bytes], size: int) -> bytes:
    return fp.read(size)
