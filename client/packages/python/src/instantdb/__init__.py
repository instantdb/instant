"""InstantDB Python SDK.

Public API:
    - `Instant`: sync admin client (HTTP request/response surface)
    - `AsyncInstant`: async admin client (adds `subscribe_query` + `streams`)
    - `InstantError`, `InstantAPIError`: exception classes
    - `id()`: generate a new entity id
    - `lookup(attribute, value)`: create a lookup sentinel usable as an eid
"""

from instantdb._async.client import AsyncInstant
from instantdb._errors import InstantAPIError, InstantError
from instantdb._sync.client import Instant
from instantdb._transact import id, lookup
from instantdb._version import __version__

__all__ = [
    "AsyncInstant",
    "Instant",
    "InstantAPIError",
    "InstantError",
    "__version__",
    "id",
    "lookup",
]
