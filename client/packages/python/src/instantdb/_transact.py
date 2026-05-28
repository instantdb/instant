"""Transaction builder. Pure logic: no I/O, no async.

Mirrors the JS `instatx.ts` builder. Produces wire-format op tuples
of the form `[action, etype, eid | [attr, value], args, opts?]`.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from typing import Any

LookupRef = list[Any]  # [attribute, value]
Eid = str | LookupRef
Op = list[Any]  # [action, etype, eid, args] or [action, etype, eid, args, opts]


def id() -> str:
    """Generate a new entity id (UUID v4 as string)."""
    return str(uuid.uuid4())


def lookup(attribute: str, value: Any) -> str:
    """Create an opaque sentinel usable in place of an eid in a transaction.

    Example:
        db.tx.users[lookup("email", "alyssa@example.com")].update({"name": "Alyssa"})
    """
    return f"lookup__{attribute}__{json.dumps(value, default=_json_default)}"


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _is_lookup(k: Any) -> bool:
    return isinstance(k, str) and k.startswith("lookup__")


def _parse_lookup(k: str) -> LookupRef:
    parts = k.split("__")
    attribute = parts[1]
    value_json = "__".join(parts[2:])
    return [attribute, json.loads(value_json)]


class _TxChunk:
    """A chain of operations against a single (etype, eid).

    Chunks are immutable; each method returns a new chunk with the op appended.
    """

    __slots__ = ("_etype", "_eid", "_ops")

    def __init__(self, etype: str, eid: Eid, ops: list[Op]) -> None:
        self._etype = etype
        self._eid = eid
        self._ops = ops

    def update(self, args: dict[str, Any], opts: dict[str, Any] | None = None) -> _TxChunk:
        return self._append("update", args, opts)

    def create(self, args: dict[str, Any], opts: dict[str, Any] | None = None) -> _TxChunk:
        return self._append("create", args, opts)

    def link(self, args: dict[str, Any]) -> _TxChunk:
        return self._append("link", args)

    def unlink(self, args: dict[str, Any]) -> _TxChunk:
        return self._append("unlink", args)

    def delete(self) -> _TxChunk:
        return self._append("delete", None)

    def merge(self, args: dict[str, Any], opts: dict[str, Any] | None = None) -> _TxChunk:
        return self._append("merge", args, opts)

    def rule_params(self, args: dict[str, Any]) -> _TxChunk:
        return self._append("ruleParams", args)

    def _append(self, action: str, args: Any, opts: Any | None = None) -> _TxChunk:
        op: Op = [action, self._etype, self._eid, args]
        if opts is not None:
            op.append(opts)
        return _TxChunk(self._etype, self._eid, [*self._ops, op])


class _NamespaceBuilder:
    """Returned by `db.tx.<namespace>`. Item access yields a chunk."""

    __slots__ = ("_etype",)

    def __init__(self, etype: str) -> None:
        self._etype = etype

    def __getitem__(self, eid: Any) -> _TxChunk:
        if _is_lookup(eid):
            return _TxChunk(self._etype, _parse_lookup(eid), [])
        return _TxChunk(self._etype, eid, [])

    def lookup(self, attribute: str, value: Any) -> _TxChunk:
        return _TxChunk(self._etype, [attribute, value], [])


class _TxBuilder:
    """Root tx builder. `db.tx.<ns>` and `db.tx["<ns>"]` both yield a namespace —
    subscript is necessary for entities whose names aren't valid Python identifiers
    (e.g. `$files`, `$users`)."""

    def __getattr__(self, etype: str) -> _NamespaceBuilder:
        # copy/pickle/Jupyter rich-repr probe for dunder attrs; without this
        # guard they'd get a phantom _NamespaceBuilder back.
        if etype.startswith("_"):
            raise AttributeError(etype)
        return _NamespaceBuilder(etype)

    def __getitem__(self, etype: str) -> _NamespaceBuilder:
        return _NamespaceBuilder(etype)


def _get_ops(chunk: _TxChunk) -> list[Op]:
    """Extract the ops list from a chunk. Internal use by transact()."""
    return chunk._ops


def _flatten_chunks(chunks: _TxChunk | list[_TxChunk]) -> list[Op]:
    """Flatten one or more chunks into a single ops list for the wire."""
    if isinstance(chunks, _TxChunk):
        chunks = [chunks]
    ops: list[Op] = []
    for chunk in chunks:
        ops.extend(chunk._ops)
    return ops
