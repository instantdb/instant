"""Optional logging for the realtime client, mirroring the JS SDK.

The realtime surfaces trace their connection lifecycle through a small
`Logger`: anything exposing `debug`, `info`, and `error`. A stdlib
`logging.Logger` satisfies this directly, so a custom logger drops in without
an adapter. The default sink is the `"instantdb"` logger, configured the usual
way (e.g. `logging.basicConfig(level=logging.DEBUG)`).

When disabled (the default) every method is a no-op, so there is no output and
no cost off the debugging path.
"""

from __future__ import annotations

import logging
from typing import Protocol


class Logger(Protocol):
    """A log sink. A stdlib `logging.Logger` satisfies this as-is."""

    def debug(self, message: str) -> None: ...
    def info(self, message: str) -> None: ...
    def error(self, message: str) -> None: ...


_DEFAULT_LOGGER = logging.getLogger("instantdb")


def _noop(message: str) -> None:
    pass


class _Log:
    """Log sink that no-ops every method when disabled.

    `enabled` lets a caller skip building an expensive log string (e.g.
    serializing a full message payload) before reaching the no-op.
    """

    def __init__(self, enabled: bool, base: Logger) -> None:
        self.enabled = enabled
        self.debug = base.debug if enabled else _noop
        self.info = base.info if enabled else _noop
        self.error = base.error if enabled else _noop


def make_logger(enabled: bool, base: Logger | None = None) -> _Log:
    return _Log(enabled, base if base is not None else _DEFAULT_LOGGER)


# Shared no-op sink. The realtime classes default to this, so they stay silent
# unless the client wires in a real logger via `make_logger`.
_NO_LOG = _Log(False, _DEFAULT_LOGGER)
