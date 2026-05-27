from typing import Any


class InstantError(Exception):
    """Base class for all Instant SDK errors."""


class InstantAPIError(InstantError):
    """Raised when the Instant API returns a non-2xx response."""

    status: int
    body: Any

    def __init__(self, message: str, *, status: int, body: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body
