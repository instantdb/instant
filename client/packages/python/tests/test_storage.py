import io
from pathlib import Path

import httpx
import pytest

from instantdb import AsyncInstant, InstantError
from instantdb._async._upload_io import _CHUNK_SIZE, _prepare_upload

# ---------- _prepare_upload: in-memory inputs ----------


async def test_bytes_input_sends_direct_body():
    prepared = await _prepare_upload(b"hello", None)
    assert prepared.body == b"hello"
    assert prepared.content_length == 5
    assert prepared.cleanup is None


async def test_bytearray_input_sends_direct_body():
    prepared = await _prepare_upload(bytearray(b"hello"), None)
    assert prepared.body == b"hello"
    assert prepared.content_length == 5


async def test_bytes_with_mismatched_file_size_raises():
    with pytest.raises(InstantError, match="doesn't match"):
        await _prepare_upload(b"hello", 10)


# ---------- _prepare_upload: Path ----------


async def test_path_input_streams_from_disk(tmp_path: Path):
    p = tmp_path / "data.bin"
    p.write_bytes(b"abc" * 100)
    prepared = await _prepare_upload(p, None)
    assert prepared.content_length == 300
    assert prepared.cleanup is not None
    chunks = [chunk async for chunk in prepared.body]
    assert b"".join(chunks) == b"abc" * 100
    prepared.cleanup()


async def test_path_with_mismatched_file_size_raises(tmp_path: Path):
    p = tmp_path / "data.bin"
    p.write_bytes(b"hello")
    with pytest.raises(InstantError, match="doesn't match"):
        await _prepare_upload(p, 999)


async def test_path_closes_handle_when_size_check_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    p = tmp_path / "data.bin"
    p.write_bytes(b"hello")

    opened: list = []
    real_open = Path.open

    def tracking_open(self, *args, **kwargs):
        fp = real_open(self, *args, **kwargs)
        opened.append(fp)
        return fp

    monkeypatch.setattr(Path, "open", tracking_open)

    with pytest.raises(InstantError, match="doesn't match"):
        await _prepare_upload(p, 999)

    assert len(opened) == 1
    assert opened[0].closed, "handle leaked when size check failed"


# ---------- _prepare_upload: seekable file-likes ----------


async def test_seekable_streams_from_current_position():
    f = io.BytesIO(b"abcdefghij")
    f.seek(3)
    prepared = await _prepare_upload(f, None)
    assert prepared.content_length == 7
    # Position must be restored before streaming (back to 3, not 10).
    assert f.tell() == 3
    chunks = [chunk async for chunk in prepared.body]
    assert b"".join(chunks) == b"defghij"
    # User-provided file objects aren't closed by the SDK.
    assert prepared.cleanup is None
    assert not f.closed


async def test_seekable_with_mismatched_file_size_raises():
    f = io.BytesIO(b"abcdefghij")
    with pytest.raises(InstantError, match="doesn't match"):
        await _prepare_upload(f, 999)


# ---------- _prepare_upload: non-seekable file-likes ----------


class _NonSeekable:
    """Binary stream stand-in that reports seekable() == False."""

    def __init__(self, data: bytes) -> None:
        self._buf = io.BytesIO(data)

    def seekable(self) -> bool:
        return False

    def read(self, n: int = -1) -> bytes:
        return self._buf.read(n)


async def test_non_seekable_without_file_size_raises():
    with pytest.raises(InstantError, match="file_size"):
        await _prepare_upload(_NonSeekable(b"hello"), None)


async def test_non_seekable_with_file_size_streams():
    src = _NonSeekable(b"hello world")
    prepared = await _prepare_upload(src, 11)
    assert prepared.content_length == 11
    chunks = [chunk async for chunk in prepared.body]
    assert b"".join(chunks) == b"hello world"


@pytest.mark.parametrize("bad", [-1, -100, 1.5, "10", True])
async def test_invalid_file_size_raises_before_http(bad):
    with pytest.raises(InstantError, match="non-negative int"):
        await _prepare_upload(_NonSeekable(b"hi"), bad)


# ---------- _prepare_upload: error paths ----------


async def test_text_mode_file_raises_on_first_chunk():
    f = io.StringIO("hello")
    prepared = await _prepare_upload(f, None)
    with pytest.raises(InstantError, match="bytes"):
        async for _ in prepared.body:
            pass


async def test_unknown_type_raises():
    with pytest.raises(InstantError, match="accepts"):
        await _prepare_upload(42, None)  # type: ignore[arg-type]


# ---------- chunk size ----------


async def test_chunks_are_bounded_by_chunk_size():
    big = b"x" * (_CHUNK_SIZE * 3 + 17)
    prepared = await _prepare_upload(io.BytesIO(big), None)
    sizes = [len(chunk) async for chunk in prepared.body]
    assert all(s == _CHUNK_SIZE for s in sizes[:-1])
    assert sizes[-1] == 17


# ---------- transport-level: streaming body reaches httpx ----------


async def test_upload_file_sends_streamed_body_with_correct_content_length(
    tmp_path: Path, mock_transport
):
    captured: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"data": {"path": "x"}})

    transport, _ = mock_transport(respond)
    payload = b"y" * (_CHUNK_SIZE + 100)
    src = tmp_path / "big.bin"
    src.write_bytes(payload)

    async with AsyncInstant(app_id="app", admin_token="abc", _transport=transport) as db:
        await db.storage.upload_file("dest.bin", src, content_type="application/octet-stream")

    req = captured[0]
    assert req.method == "PUT"
    assert req.headers["content-length"] == str(len(payload))
    assert req.headers["path"] == "dest.bin"
    assert req.content == payload
