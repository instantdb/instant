"""Crypto helper paths that sandbox can't reach: header parsing edge cases,
timestamp skew, key resolution.

Live-signature verification with a real captured fixture is covered in the
sandbox; here we focus on the validation branches that raise before any key
work happens, plus the stale-timestamp gate.
"""

import pytest

from instantdb import InstantError
from instantdb._webhooks_crypto import verify_signature

_LOCAL_URI = "http://localhost:9888"

_FIXTURE_SIG = (
    "t=1778610366,kid=503090235,"
    "v1=b4385e8285de38d22b6d8a6bdd03cc75287e356f1adf48cea257a8e6c056c04e"
    "f99af7d8e162afcaa07d201e97c7865cc91e552bd5def8f9ed4b52efc5843406"
)
_FIXTURE_BODY = (
    b'{"payloadUrl":"http://localhost:8888/webhooks/payload/f717e056-94af-'
    b"4556-9eec-288fb27847a1/4e119bf6-ef64-4e86-bf26-49a18dec54b8/0/328/"
    b'5307A1A0","token":"eyJraWQiOiI1MDMwOTAyMzUiLCJ0eXAiOiJKV1QiLCJhbGci'
    b"OiJFZERTQSJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0Ojg4ODgiLCJzdWIiOiJmNz"
    b"E3ZTA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJhcHAtaWQiOiJmNzE3Z"
    b"TA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJleHAiOjE3Nzg2MTM5NjYs"
    b"ImlzbiI6IjAvMzI4LzUzMDdBMUEwIiwid2ViaG9vay1pZCI6IjRlMTE5YmY2LWVmNjQ"
    b"tNGU4Ni1iZjI2LTQ5YTE4ZGVjNTRiOCJ9.SsI2iZ4rD_sDjUcgqyJ0agGXMgjTRU5PK"
    b'gcEQsE-txp5jTNoVouQU-GneTrKR2GmleETEzFrpf_v4HAnCDYABw"}'
)
_FIXTURE_RECEIVED_AT = 1778610366


def _verify(**overrides):
    base = {
        "api_uri": _LOCAL_URI,
        "signature_header": _FIXTURE_SIG,
        "body": _FIXTURE_BODY,
        "received_at": _FIXTURE_RECEIVED_AT,
    }
    base.update(overrides)
    verify_signature(**base)


@pytest.mark.parametrize(
    "header",
    [
        "kid=503090235,v1=ab",
        "t=1778610366,v1=ab",
        "t=1778610366,kid=503090235",
        "",
    ],
)
def test_rejects_header_missing_required_part(header):
    with pytest.raises(InstantError, match="Invalid Instant-Signature"):
        _verify(signature_header=header)


def test_rejects_v1_that_isnt_hex():
    with pytest.raises(InstantError, match="not hex"):
        _verify(signature_header="t=1778610366,kid=503090235,v1=not-hex")


def test_rejects_t_that_isnt_an_integer():
    with pytest.raises(InstantError, match="bad t"):
        _verify(signature_header="t=notanint,kid=503090235,v1=ab")


def test_rejects_signature_older_than_max_age():
    # The fixture's t is 1778610366; received_at one second past the tolerance
    # window is the smallest provable stale case.
    with pytest.raises(InstantError, match="too old"):
        _verify(received_at=_FIXTURE_RECEIVED_AT + 301, max_age_seconds=300)


def test_rejects_unknown_kid_for_api_uri():
    # The prod URI doesn't know about the localhost dev kid.
    with pytest.raises(InstantError, match="No trusted signing key"):
        _verify(api_uri="https://api.instantdb.com")


def test_rejects_when_body_tampered():
    tampered = _FIXTURE_BODY.replace(b"5307A1A0", b"5307A1A1")
    with pytest.raises(InstantError, match="did not validate"):
        _verify(body=tampered)
