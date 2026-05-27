import io

import pytest

from instantdb import InstantError
from instantdb._io import _read_bytes


def test_read_bytes_accepts_bytearray():
    assert _read_bytes(bytearray(b"hello")) == b"hello"


def test_read_bytes_accepts_sync_file_like():
    assert _read_bytes(io.BytesIO(b"hello")) == b"hello"


def test_read_bytes_rejects_text_mode_file():
    # text-mode .read() returns str — fail loudly rather than silently encoding.
    with pytest.raises(InstantError, match="bytes"):
        _read_bytes(io.StringIO("hello"))


def test_read_bytes_rejects_unknown_type():
    with pytest.raises(InstantError, match="accepts"):
        _read_bytes(42)
