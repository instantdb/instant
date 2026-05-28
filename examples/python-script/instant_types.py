"""Fallback so `from instant_types import ...` works before codegen runs.

Run `npx instant-cli genpy` to replace this with a schema-bound module
that gives you typed `db.tx.<entity>` and validated query results.
"""

from instantdb import (
    AsyncInstant,
    Instant,
    InstantAPIError,
    InstantError,
    id,
    lookup,
)
