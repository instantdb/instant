from typing import Any


class InstantError(Exception):
    """Base class for all Instant SDK errors."""


class InstantAPIError(InstantError):
    """Raised when the Instant API returns a non-2xx response."""

    status: int
    body: Any
    hint: Any
    trace_id: str | None

    def __init__(self, message: str, *, status: int, body: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body
        # Surface hint/trace_id as attributes (like JS), not just inside body.
        self.hint = body.get("hint") if isinstance(body, dict) else None
        self.trace_id = (
            body.get("traceId") or body.get("trace-id") if isinstance(body, dict) else None
        )
