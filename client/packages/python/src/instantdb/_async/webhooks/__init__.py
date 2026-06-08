"""Webhooks namespace: manager (subscription CRUD) + receiver primitives."""

from __future__ import annotations

from instantdb._async.webhooks.manager import AsyncWebhooksManager
from instantdb._async.webhooks.receiver import AsyncWebhooks

__all__ = ["AsyncWebhooks", "AsyncWebhooksManager"]
