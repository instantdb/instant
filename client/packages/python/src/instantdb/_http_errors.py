"""Shared httpx.Response → InstantAPIError translation.

Both `_async/` and `_sync/` flavors use this. Pure sync — no async dependency.
"""

from __future__ import annotations

from typing import Any

import httpx

from instantdb._errors import InstantAPIError


def api_error_from_response(response: httpx.Response) -> InstantAPIError:
    try:
        body: Any = response.json()
    except ValueError:
        body = {"type": None, "message": response.text}
    message = body.get("message", response.text) if isinstance(body, dict) else response.text
    return InstantAPIError(message, status=response.status_code, body=body)
