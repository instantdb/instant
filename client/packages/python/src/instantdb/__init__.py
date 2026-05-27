"""InstantDB Python SDK.

Public API:
    - `AsyncInstant`: async admin client (sync `Instant` lands via unasync later)
    - `InstantError`, `InstantAPIError`: exception classes
    - `id()`: generate a new entity id
    - `lookup(attribute, value)`: create a lookup sentinel usable as an eid
"""

from instantdb._async.client import AsyncInstant
from instantdb._errors import InstantAPIError, InstantError
from instantdb._transact import id, lookup
from instantdb._version import __version__

__all__ = [
    "AsyncInstant",
    "InstantAPIError",
    "InstantError",
    "__version__",
    "id",
    "lookup",
]
