from collections.abc import Callable

import httpx
import pytest


@pytest.fixture(autouse=True)
def _isolate_instant_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Clear INSTANT_* env vars by default so tests don't pick up dev shell state.

    Tests that exercise env-var fallback set values explicitly via monkeypatch.
    """
    monkeypatch.delenv("INSTANT_APP_ID", raising=False)
    monkeypatch.delenv("INSTANT_ADMIN_TOKEN", raising=False)


@pytest.fixture
def mock_transport() -> Callable[
    [Callable[[httpx.Request], httpx.Response]],
    tuple[httpx.MockTransport, list[httpx.Request]],
]:
    """Factory for an httpx MockTransport that captures requests.

    Usage:
        transport, captured = mock_transport(lambda req: httpx.Response(200, json={...}))
        async with AsyncInstant(..., _transport=transport) as db:
            ...
        assert captured[0].url.path == "/admin/..."
    """

    def factory(
        responder: Callable[[httpx.Request], httpx.Response],
    ) -> tuple[httpx.MockTransport, list[httpx.Request]]:
        captured: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return responder(request)

        return httpx.MockTransport(handler), captured

    return factory
