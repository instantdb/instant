"""Manual integration tester for the instantdb Python SDK.

Run via:
    uv run --env-file .env python -m src.main

Uncomment a tester call inside main() to exercise that surface against
a real server. Each tester sets up state it controls, asserts on the
outcome, and cleans up — running a tester is binary: prints ✓ or raises.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Any

from instantdb import AsyncInstant, InstantAPIError, InstantError, id

# Assumes the connected app has a schema with `goals` and `todos`
# entities and a `todos` link between them. The starter / examples ship
# with this shape.

# ---------- auth ----------


async def test_send_magic_code(db: AsyncInstant) -> None:
    email = f"sandbox-{id()}@instantdb.test"
    code = await db.auth.send_magic_code(email)
    assert isinstance(code, str) and code, f"empty code: {code!r}"
    print(f"✓ send_magic_code returned a code (len={len(code)})")


async def test_check_magic_code_round_trip(db: AsyncInstant) -> None:
    email = f"sandbox-{id()}@instantdb.test"
    try:
        code = await db.auth.generate_magic_code(email)
        user, created = await db.auth.check_magic_code(email=email, code=code)
        assert user.get("email") == email, f"email mismatch: {user}"
        assert created is True, "fresh user should have created=True"
        print(f"✓ generate + check magic code round-trip ({email})")
    finally:
        await db.auth.delete_user(email=email)


async def test_create_and_verify_token_round_trip(db: AsyncInstant) -> None:
    email = f"sandbox-{id()}@instantdb.test"
    try:
        token = await db.auth.create_token(email=email)
        assert isinstance(token, str) and token, f"bad token: {token!r}"
        user = await db.auth.verify_token(token)
        assert user.get("email") == email, f"email mismatch: {user}"
        print(f"✓ create_token + verify_token round-trip ({email})")
    finally:
        await db.auth.delete_user(email=email)


async def test_get_and_delete_user(db: AsyncInstant) -> None:
    email = f"sandbox-{id()}@instantdb.test"
    await db.auth.create_token(email=email)  # side effect: user exists

    found = await db.auth.get_user(email=email)
    assert found is not None and found.get("email") == email, f"not found: {found}"

    deleted = await db.auth.delete_user(email=email)
    assert deleted is not None, "delete should return the deleted user"

    after = await db.auth.get_user(email=email)
    assert after is None, f"user should be gone: {after}"
    print(f"✓ get_user / delete_user cycle ({email})")


async def test_sign_out_does_not_error(db: AsyncInstant) -> None:
    email = f"sandbox-{id()}@instantdb.test"
    try:
        await db.auth.create_token(email=email)
        await db.auth.sign_out(email=email)
        print(f"✓ sign_out completed ({email})")
    finally:
        await db.auth.delete_user(email=email)


# ---------- query + transact ----------


async def test_transact_query_delete_cycle(db: AsyncInstant) -> None:
    goal_id = id()
    title = f"sandbox-{goal_id[:8]}"
    try:
        tx = await db.transact(db.tx.goals[goal_id].update({"title": title}))
        assert "tx-id" in tx, f"missing tx-id: {tx}"

        found = await db.query({"goals": {"$": {"where": {"id": goal_id}}}})
        assert len(found["goals"]) == 1, f"expected 1, got {len(found['goals'])}"
        assert found["goals"][0]["title"] == title
        print(f"✓ transact → query found goal ({goal_id})")
    finally:
        await db.transact(db.tx.goals[goal_id].delete())
        gone = await db.query({"goals": {"$": {"where": {"id": goal_id}}}})
        assert len(gone["goals"]) == 0, "goal should be deleted"


async def test_link_and_nested_query_via_chained_ops(db: AsyncInstant) -> None:
    goal_id = id()
    todo_id = id()
    try:
        await db.transact(
            [
                db.tx.goals[goal_id].update({"title": "Get fit"}).link({"todos": todo_id}),
                db.tx.todos[todo_id].update({"title": "Run"}),
            ]
        )
        result = await db.query(
            {"goals": {"todos": {}, "$": {"where": {"id": goal_id}}}}
        )
        assert len(result["goals"]) == 1
        linked = result["goals"][0]["todos"]
        assert len(linked) == 1 and linked[0]["id"] == todo_id, f"link missing: {linked}"
        print(f"✓ chained update + link via nested query ({goal_id} → {todo_id})")
    finally:
        await db.transact(
            [
                db.tx.todos[todo_id].delete(),
                db.tx.goals[goal_id].delete(),
            ]
        )


async def test_unlink_removes_the_link(db: AsyncInstant) -> None:
    goal_id = id()
    todo_id = id()
    try:
        await db.transact(
            [
                db.tx.goals[goal_id].update({"title": "Goal"}),
                db.tx.todos[todo_id].update({"title": "Todo"}),
                db.tx.goals[goal_id].link({"todos": todo_id}),
            ]
        )
        before = await db.query(
            {"goals": {"todos": {}, "$": {"where": {"id": goal_id}}}}
        )
        assert len(before["goals"][0]["todos"]) == 1, "setup failed: link not present"

        await db.transact(db.tx.goals[goal_id].unlink({"todos": todo_id}))

        after = await db.query(
            {"goals": {"todos": {}, "$": {"where": {"id": goal_id}}}}
        )
        assert len(after["goals"][0]["todos"]) == 0, (
            f"link still present: {after['goals'][0]['todos']}"
        )
        print(f"✓ unlink removed link ({goal_id} ↛ {todo_id})")
    finally:
        await db.transact(
            [
                db.tx.todos[todo_id].delete(),
                db.tx.goals[goal_id].delete(),
            ]
        )


async def test_create_succeeds_new_eid_fails_existing(db: AsyncInstant) -> None:
    # Distinguishes create from update: update upserts, create throws on conflict.
    goal_id = id()
    try:
        await db.transact(db.tx.goals[goal_id].create({"title": "first"}))
        found = await db.query({"goals": {"$": {"where": {"id": goal_id}}}})
        assert len(found["goals"]) == 1, "create did not persist"

        try:
            await db.transact(db.tx.goals[goal_id].create({"title": "second"}))
        except InstantAPIError as e:
            print(f"✓ create on existing eid raised InstantAPIError(status={e.status})")
        else:
            raise AssertionError("expected create on existing eid to raise")
    finally:
        await db.transact(db.tx.goals[goal_id].delete())


async def test_tx_rule_params_op_accepted_by_server(db: AsyncInstant) -> None:
    # Python method `rule_params` → wire action `ruleParams`. Server would
    # 400 on an unknown action if the translation broke.
    async with db.as_user(guest=True) as scoped:
        result = await scoped.debug_transact(
            scoped.tx.goals[id()].rule_params({"region": "us"}).update({"title": "x"})
        )
        assert "check-results" in result, f"unexpected response: {result}"
    print("✓ tx.rule_params op accepted by server (camelCase translation works)")


async def test_merge_preserves_other_keys(db: AsyncInstant) -> None:
    goal_id = id()
    try:
        await db.transact(
            db.tx.goals[goal_id].update(
                {"title": "Original", "metrics": {"progress": 0.3}}
            )
        )
        await db.transact(db.tx.goals[goal_id].merge({"metrics": {"progress": 0.7}}))

        result = await db.query({"goals": {"$": {"where": {"id": goal_id}}}})
        goal = result["goals"][0]
        assert goal["title"] == "Original", f"title clobbered: {goal}"
        assert goal["metrics"]["progress"] == 0.7
        print(f"✓ merge updated progress without clobbering title ({goal_id})")
    finally:
        await db.transact(db.tx.goals[goal_id].delete())


# ---------- as_user + debug helpers ----------


async def test_as_guest_query_doesnt_crash(db: AsyncInstant) -> None:
    async with db.as_user(guest=True) as scoped:
        result = await scoped.query({"goals": {}})
        assert "goals" in result, f"missing goals key: {result}"
    print("✓ as_user(guest=True).query returned a result")


async def test_debug_query_returns_check_results(db: AsyncInstant) -> None:
    async with db.as_user(guest=True) as scoped:
        result = await scoped.debug_query({"goals": {}})
        assert "result" in result, f"missing result: {result}"
        assert "check-results" in result, f"missing check-results: {result}"
    print("✓ debug_query returned result + check-results")


async def test_debug_transact_returns_check_results(db: AsyncInstant) -> None:
    async with db.as_user(guest=True) as scoped:
        result = await scoped.debug_transact(
            scoped.tx.goals[id()].update({"title": "Will it pass?"})
        )
        assert "check-results" in result, f"missing check-results: {result}"
    print("✓ debug_transact returned check-results")


# ---------- storage ----------


async def test_storage_upload_bytes(db: AsyncInstant) -> None:
    storage_path = f"sandbox/{id()}.txt"
    content = b"sandbox bytes content"
    result = await db.storage.upload_file(
        storage_path, content, content_type="text/plain"
    )
    file_id = result["data"]["id"]
    assert file_id, f"upload didn't return id: {result}"
    try:
        files = await db.query({"$files": {"$": {"where": {"id": file_id}}}})
        assert len(files["$files"]) == 1, f"file missing from query: {files}"
        assert files["$files"][0]["path"] == storage_path
        print(f"✓ upload bytes + queryable in $files ({file_id})")
    finally:
        await db.transact(db.tx["$files"][file_id].delete())


async def test_storage_upload_path(db: AsyncInstant) -> None:
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
        tmp.write(b"path-based sandbox content")
        tmp_path = Path(tmp.name)
    try:
        storage_path = f"sandbox/{id()}.txt"
        result = await db.storage.upload_file(
            storage_path, tmp_path, content_type="text/plain"
        )
        file_id = result["data"]["id"]
        try:
            files = await db.query({"$files": {"$": {"where": {"id": file_id}}}})
            assert len(files["$files"]) == 1, f"file missing from query: {files}"
            print(f"✓ upload from pathlib.Path ({file_id})")
        finally:
            await db.transact(db.tx["$files"][file_id].delete())
    finally:
        tmp_path.unlink()


async def test_storage_upload_open_file_object(db: AsyncInstant) -> None:
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp:
        tmp.write(b"open-file-object sandbox content")
        tmp_path = Path(tmp.name)
    try:
        storage_path = f"sandbox/{id()}.txt"
        with tmp_path.open("rb") as fp:
            result = await db.storage.upload_file(
                storage_path, fp, content_type="text/plain"
            )
            assert not fp.closed, "SDK should not close user-provided file handles"
        file_id = result["data"]["id"]
        try:
            files = await db.query({"$files": {"$": {"where": {"id": file_id}}}})
            assert len(files["$files"]) == 1, f"file missing from query: {files}"
            print(f"✓ upload from open binary file object ({file_id})")
        finally:
            await db.transact(db.tx["$files"][file_id].delete())
    finally:
        tmp_path.unlink()


# ---------- rooms ----------


async def test_rooms_get_presence_returns_dict(db: AsyncInstant) -> None:
    result = await db.rooms.get_presence("sandbox-room-type", id())
    assert isinstance(result, dict), f"expected dict, got {type(result).__name__}"
    print(f"✓ get_presence returned dict (peers: {len(result)})")


# ---------- error path ----------


async def test_invalid_app_id_raises_parsed_error(db: AsyncInstant) -> None:
    api_uri = os.environ.get("INSTANT_API_URI", "http://localhost:8888")
    async with AsyncInstant(
        app_id="00000000-0000-0000-0000-000000000000",
        admin_token="bogus",
        api_uri=api_uri,
    ) as bogus:
        try:
            await bogus.query({"goals": {}})
        except InstantAPIError as e:
            assert e.status >= 400, f"expected 4xx/5xx, got {e.status}"
            assert isinstance(e.body, dict), f"body not parsed: {e.body!r}"
            print(f"✓ bogus app_id raised InstantAPIError(status={e.status}): {e}")
        else:
            raise AssertionError("expected InstantAPIError for bogus app_id")


# ---------- subscriptions ----------


async def test_subscribe_query_emits_initial_data(db: AsyncInstant) -> None:
    goal_id = id()
    title = f"sandbox-{goal_id[:8]}"
    try:
        await db.transact(db.tx.goals[goal_id].update({"title": title}))
        async with db.subscribe_query({"goals": {"$": {"where": {"id": goal_id}}}}) as sub:
            payload = await asyncio.wait_for(anext(sub), timeout=5.0)
            assert payload["type"] == "ok", f"expected ok, got {payload}"
            goals = payload["data"]["goals"]
            assert len(goals) == 1, f"expected 1 goal, got {len(goals)}"
            assert goals[0]["id"] == goal_id, f"wrong goal: {goals[0]}"
            assert payload["session_info"] is not None, "session_info missing"
            assert payload["session_info"]["machine_id"], "machine_id empty"
            assert payload["session_info"]["session_id"], "session_id empty"
        print(f"✓ subscribe_query emitted initial data ({goal_id})")
    finally:
        await db.transact(db.tx.goals[goal_id].delete())


async def test_subscribe_query_emits_live_update(db: AsyncInstant) -> None:
    goal_id = id()
    try:
        async with db.subscribe_query({"goals": {"$": {"where": {"id": goal_id}}}}) as sub:
            initial = await asyncio.wait_for(anext(sub), timeout=5.0)
            assert initial["type"] == "ok"
            assert len(initial["data"]["goals"]) == 0, "expected empty initial result"

            await db.transact(db.tx.goals[goal_id].update({"title": "Live update"}))

            update = await asyncio.wait_for(anext(sub), timeout=5.0)
            assert update["type"] == "ok"
            goals = update["data"]["goals"]
            assert len(goals) == 1, f"expected 1 goal after update, got {len(goals)}"
            assert goals[0]["title"] == "Live update"
        print(f"✓ subscribe_query emitted live update ({goal_id})")
    finally:
        await db.transact(db.tx.goals[goal_id].delete())


async def test_subscribe_query_emits_error_on_bad_creds(db: AsyncInstant) -> None:
    api_uri = os.environ.get("INSTANT_API_URI", "http://localhost:8888")
    async with AsyncInstant(
        app_id="00000000-0000-0000-0000-000000000000",
        admin_token="bogus",
        api_uri=api_uri,
    ) as bogus:
        async with bogus.subscribe_query({"goals": {}}) as sub:
            payload = await asyncio.wait_for(anext(sub), timeout=5.0)
            assert payload["type"] == "error", f"expected error, got {payload}"
            assert isinstance(payload["error"], InstantAPIError), (
                f"error not InstantAPIError: {type(payload['error']).__name__}"
            )
        print(f"✓ subscribe_query emitted error for bad creds: {payload['error']}")


async def test_subscribe_query_cleanup_on_context_exit(db: AsyncInstant) -> None:
    # The async-with must terminate the background SSE task even when the
    # user breaks out of the loop early. is_closed flips to True on exit.
    async with db.subscribe_query({"goals": {}}) as sub:
        await asyncio.wait_for(anext(sub), timeout=5.0)
        assert not sub.is_closed, "should be open while iterating"
    assert sub.is_closed, "should be closed after context exit"
    print("✓ subscribe_query closes connection on context exit")


async def test_subscribe_query_reconnects_after_sse_dropped(db: AsyncInstant) -> None:
    # Verify transparent reconnect: after the first sse-init lands, force-close
    # the underlying SSE response. The retry loop should re-open the stream;
    # a transact after the drop should still surface on the same iterator.
    goal_id = id()
    try:
        async with db.subscribe_query({"goals": {"$": {"where": {"id": goal_id}}}}) as sub:
            initial = await asyncio.wait_for(anext(sub), timeout=5.0)
            assert initial["type"] == "ok"

            event_source = sub._event_source
            assert event_source is not None, "expected SSE to be open"
            await event_source.response.aclose()
            await asyncio.sleep(0.5)  # let reconnect complete

            await db.transact(db.tx.goals[goal_id].update({"title": "after-reconnect"}))

            # After reconnect we may see an empty post-reconnect snapshot before
            # the refresh-ok carrying our transact lands. Drain until the title
            # arrives — the cap protects against a stuck iterator.
            for _ in range(10):
                payload = await asyncio.wait_for(anext(sub), timeout=10.0)
                assert payload["type"] == "ok", f"expected ok, got {payload}"
                goals = payload["data"]["goals"]
                if goals and goals[0]["title"] == "after-reconnect":
                    print(f"✓ subscribe_query reconnected after SSE drop ({goal_id})")
                    return
            raise AssertionError("did not see post-reconnect refresh within 10 payloads")
    finally:
        await db.transact(db.tx.goals[goal_id].delete())


# ---------- streams ----------


async def test_stream_write_then_read_by_client_id(db: AsyncInstant) -> None:
    client_id = f"sandbox-{id()}"
    chunks_in = ["hello ", "from python ", "streams\n"]
    try:
        async with db.streams.write(client_id=client_id) as writer:
            stream_id = await writer.stream_id
            assert stream_id, f"empty stream_id: {stream_id!r}"
            for c in chunks_in:
                await writer.write(c)

        chunks_out: list[str] = []
        async with db.streams.read(client_id=client_id) as reader:
            async for chunk in reader:
                chunks_out.append(chunk)

        assert "".join(chunks_out) == "".join(chunks_in), (
            f"mismatch: {''.join(chunks_out)!r} != {''.join(chunks_in)!r}"
        )
        print(f"✓ stream round-trip via client_id ({client_id} → {stream_id})")
    finally:
        await _delete_stream_by_client_id(db, client_id)


async def test_stream_read_by_stream_id(db: AsyncInstant) -> None:
    client_id = f"sandbox-{id()}"
    chunks_in = ["A", "B", "C", "D"]
    stream_id = ""
    try:
        async with db.streams.write(client_id=client_id) as writer:
            stream_id = await writer.stream_id
            for c in chunks_in:
                await writer.write(c)

        chunks_out: list[str] = []
        async with db.streams.read(stream_id=stream_id) as reader:
            async for chunk in reader:
                chunks_out.append(chunk)

        assert "".join(chunks_out) == "".join(chunks_in)
        print(f"✓ stream read by stream_id ({stream_id})")
    finally:
        await _delete_stream_by_client_id(db, client_id)


async def test_stream_read_with_byte_offset_resumes_mid_stream(db: AsyncInstant) -> None:
    client_id = f"sandbox-{id()}"
    chunks_in = ["abc", "def", "ghi", "jkl"]  # full = "abcdefghijkl" (12 bytes)
    try:
        async with db.streams.write(client_id=client_id) as writer:
            await writer.stream_id
            for c in chunks_in:
                await writer.write(c)

        chunks_out: list[str] = []
        async with db.streams.read(client_id=client_id, byte_offset=6) as reader:
            async for chunk in reader:
                chunks_out.append(chunk)

        assert "".join(chunks_out) == "ghijkl", f"unexpected: {''.join(chunks_out)!r}"
        print(f"✓ byte_offset=6 resumed mid-stream ({client_id})")
    finally:
        await _delete_stream_by_client_id(db, client_id)


async def test_streams_queryable_via_query_api(db: AsyncInstant) -> None:
    # $streams falls out of regular InstaQL — no new metadata API needed.
    client_id = f"sandbox-{id()}"
    try:
        async with db.streams.write(client_id=client_id) as writer:
            await writer.stream_id
            await writer.write("metadata only")

        result = await db.query({"$streams": {"$": {"where": {"clientId": client_id}}}})
        streams = result.get("$streams", [])
        assert len(streams) == 1, f"expected 1, got {len(streams)}: {streams}"
        assert streams[0]["clientId"] == client_id
        print(f"✓ $streams queryable after write ({client_id})")
    finally:
        await _delete_stream_by_client_id(db, client_id)


async def test_writer_reconnects_after_sse_dropped(db: AsyncInstant) -> None:
    client_id = f"sandbox-{id()}"
    try:
        async with db.streams.write(client_id=client_id) as writer:
            await writer.stream_id
            await writer.write("first ")
            await asyncio.sleep(0.3)  # let stream-flushed arrive

            # Simulate a transient SSE drop. A reconnect-capable connection
            # detects the closed response, backs off, re-opens, and re-runs
            # the start handshake with the same reconnect-token.
            assert writer._connection is not None
            event_source = writer._connection._event_source
            assert event_source is not None, "expected SSE to be open"
            await event_source.response.aclose()
            await asyncio.sleep(0.8)  # let reconnect complete

            await writer.write("second")

        async with db.streams.read(client_id=client_id) as reader:
            data = "".join([chunk async for chunk in reader])
        assert "first " in data, f"missing 'first ': {data!r}"
        assert "second" in data, f"missing 'second': {data!r}"
        print(f"✓ writer reconnected mid-stream after SSE drop ({client_id})")
    finally:
        await _delete_stream_by_client_id(db, client_id)


async def _delete_stream_by_client_id(db: AsyncInstant, client_id: str) -> None:
    result = await db.query({"$streams": {"$": {"where": {"clientId": client_id}}}})
    for s in result.get("$streams", []):
        await db.transact(db.tx["$streams"][s["id"]].delete())


# ---------- webhooks ----------

# A signature + body captured from a real webhook delivery from a localhost
# Instant server, signed by the kid=503090235 dev key the local Docker image
# always serves. Reused here for validate; matches the JS test fixture.
_FIXTURE_SIG_HEADER = (
    "t=1778610366,kid=503090235,"
    "v1=b4385e8285de38d22b6d8a6bdd03cc75287e356f1adf48cea257a8e6c056c04e"
    "f99af7d8e162afcaa07d201e97c7865cc91e552bd5def8f9ed4b52efc5843406"
)
_FIXTURE_BODY = (
    b'{"payloadUrl":"http://localhost:8888/webhooks/payload/f717e056-94af-'
    b'4556-9eec-288fb27847a1/4e119bf6-ef64-4e86-bf26-49a18dec54b8/0/328/'
    b'5307A1A0","token":"eyJraWQiOiI1MDMwOTAyMzUiLCJ0eXAiOiJKV1QiLCJhbGci'
    b"OiJFZERTQSJ9.eyJpc3MiOiJodHRwOi8vbG9jYWxob3N0Ojg4ODgiLCJzdWIiOiJmNz"
    b"E3ZTA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJhcHAtaWQiOiJmNzE3Z"
    b"TA1Ni05NGFmLTQ1NTYtOWVlYy0yODhmYjI3ODQ3YTEiLCJleHAiOjE3Nzg2MTM5NjYs"
    b"ImlzbiI6IjAvMzI4LzUzMDdBMUEwIiwid2ViaG9vay1pZCI6IjRlMTE5YmY2LWVmNjQ"
    b"tNGU4Ni1iZjI2LTQ5YTE4ZGVjNTRiOCJ9.SsI2iZ4rD_sDjUcgqyJ0agGXMgjTRU5PK"
    b'gcEQsE-txp5jTNoVouQU-GneTrKR2GmleETEzFrpf_v4HAnCDYABw"}'
)
_FIXTURE_RECEIVED_AT = 1778610366


async def test_webhooks_create_list_delete(db: AsyncInstant) -> None:
    created = await db.webhooks.manager.create(
        url="https://example.com/instant",
        namespaces=["goals"],
        actions=["create"],
    )
    webhook_id = created["id"]
    try:
        listed = await db.webhooks.manager.list()
        assert any(w["id"] == webhook_id for w in listed), f"created not in list: {listed}"
    finally:
        deleted = await db.webhooks.manager.delete(webhook_id)
        assert deleted["id"] == webhook_id, f"delete returned wrong: {deleted}"

    after = await db.webhooks.manager.list()
    assert not any(w["id"] == webhook_id for w in after), "still present after delete"
    print(f"✓ webhooks create/list/delete ({webhook_id})")


async def test_webhooks_update_changes_fields(db: AsyncInstant) -> None:
    created = await db.webhooks.manager.create(
        url="https://example.com/v1",
        namespaces=["goals"],
        actions=["create"],
    )
    webhook_id = created["id"]
    try:
        updated = await db.webhooks.manager.update(
            webhook_id,
            url="https://example.com/v2",
            actions=["create", "update", "delete"],
        )
        assert updated["sink"]["url"] == "https://example.com/v2", f"url not updated: {updated}"
        assert set(updated["actions"]) == {"create", "update", "delete"}, (
            f"actions not updated: {updated['actions']}"
        )
        print(f"✓ webhooks update ({webhook_id})")
    finally:
        await db.webhooks.manager.delete(webhook_id)


async def test_webhooks_enable_disable_round_trip(db: AsyncInstant) -> None:
    created = await db.webhooks.manager.create(
        url="https://example.com/instant",
        namespaces=["goals"],
        actions=["create"],
    )
    webhook_id = created["id"]
    try:
        assert created["status"] == "active", f"new webhook not active: {created}"

        disabled = await db.webhooks.manager.disable(webhook_id, reason="paused for migration")
        assert disabled["status"] == "disabled", f"not disabled: {disabled}"
        assert disabled["disabledReason"] == "paused for migration", (
            f"disabledReason missing: {disabled}"
        )

        enabled = await db.webhooks.manager.enable(webhook_id)
        assert enabled["status"] == "active", f"not re-enabled: {enabled}"
        print(f"✓ webhooks disable→enable round-trip ({webhook_id})")
    finally:
        await db.webhooks.manager.delete(webhook_id)


async def test_webhooks_get_event_and_payload(db: AsyncInstant) -> None:
    created = await db.webhooks.manager.create(
        url="https://example.com/instant",
        namespaces=["goals"],
        actions=["create", "update", "delete"],
    )
    webhook_id = created["id"]
    goal_id = id()
    try:
        await db.transact(db.tx.goals[goal_id].create({"title": "trigger-webhook"}))
        events: list[dict] = []
        for _ in range(40):
            page = await db.webhooks.manager.list_events(webhook_id)
            events = page["events"]
            if events:
                break
            await asyncio.sleep(0.25)
        assert events, "no events queued for the webhook"
        isn = events[0]["isn"]
        event = await db.webhooks.manager.get_event(webhook_id, isn=isn)
        assert event["isn"] == isn, f"isn mismatch: {event}"
        assert event["status"] in {"pending", "processing", "success", "error", "failed"}, (
            f"unexpected status: {event}"
        )

        payload = await db.webhooks.manager.get_payload(webhook_id, isn=isn)
        assert isinstance(payload.get("data"), list), f"data not a list: {payload}"
        assert isinstance(payload.get("idempotencyKey"), str), f"idempotencyKey missing: {payload}"
        print(f"✓ webhooks get_event + get_payload ({webhook_id} / {isn})")
    finally:
        await db.transact(db.tx.goals[goal_id].delete())
        await db.webhooks.manager.delete(webhook_id)


async def test_webhooks_resend_event(db: AsyncInstant) -> None:
    created = await db.webhooks.manager.create(
        url="https://example.com/instant",
        namespaces=["goals"],
        actions=["create", "update", "delete"],
    )
    webhook_id = created["id"]
    goal_id = id()
    try:
        await db.transact(db.tx.goals[goal_id].create({"title": "trigger"}))
        page: dict[str, Any] = {"events": []}
        for _ in range(40):
            page = await db.webhooks.manager.list_events(webhook_id)
            if page["events"]:
                break
            await asyncio.sleep(0.25)
        assert page["events"], "no event to resend"
        isn = page["events"][0]["isn"]

        resent = await db.webhooks.manager.resend_event(webhook_id, isn=isn)
        assert resent["isn"] == isn, f"resent isn mismatch: {resent}"
        print(f"✓ webhooks resend_event ({webhook_id} / {isn})")
    finally:
        await db.transact(db.tx.goals[goal_id].delete())
        await db.webhooks.manager.delete(webhook_id)


async def test_webhooks_validate_with_fixture(db: AsyncInstant) -> None:
    # Captured fixture is signed by the localhost dev key; the local server
    # we're talking to serves that same key, so validate should pass.
    webhook_body = await db.webhooks.validate(
        signature_header=_FIXTURE_SIG_HEADER,
        body=_FIXTURE_BODY,
        received_at=_FIXTURE_RECEIVED_AT,
    )
    assert webhook_body["payloadUrl"].startswith("http://localhost:8888/webhooks/payload/")
    assert webhook_body["token"].startswith("eyJraWQiOiI1MDMwOTAyMzUi")
    print("✓ webhooks validate accepted the fixture")


async def test_webhooks_validate_rejects_tampered(db: AsyncInstant) -> None:
    tampered = _FIXTURE_BODY.replace(b"5307A1A0", b"5307A1A1")
    try:
        await db.webhooks.validate(
            signature_header=_FIXTURE_SIG_HEADER,
            body=tampered,
            received_at=_FIXTURE_RECEIVED_AT,
        )
    except InstantError as e:
        print(f"✓ webhooks validate rejected tampered body: {e}")
    else:
        raise AssertionError("expected InstantError on tampered body")


# ---------- entry ----------


async def main() -> None:
    # app_id and admin_token fall back to INSTANT_APP_ID / INSTANT_ADMIN_TOKEN.
    # Default to a local Instant server; set INSTANT_API_URI in .env to point
    # elsewhere (e.g. https://api.instantdb.com).
    api_uri = os.environ.get("INSTANT_API_URI", "http://localhost:8888")

    async with AsyncInstant(api_uri=api_uri) as db:
        # Uncomment a call to run it.
        #
        # # auth:
        # await test_send_magic_code(db)
        # await test_check_magic_code_round_trip(db)
        # await test_create_and_verify_token_round_trip(db)
        # await test_get_and_delete_user(db)
        # await test_sign_out_does_not_error(db)
        #
        # # query + transact:
        # await test_transact_query_delete_cycle(db)
        # await test_link_and_nested_query_via_chained_ops(db)
        # await test_unlink_removes_the_link(db)
        # await test_create_succeeds_new_eid_fails_existing(db)
        # await test_tx_rule_params_op_accepted_by_server(db)
        # await test_merge_preserves_other_keys(db)
        #
        # # impersonation + debug:
        # await test_as_guest_query_doesnt_crash(db)
        # await test_debug_query_returns_check_results(db)
        # await test_debug_transact_returns_check_results(db)
        #
        # # storage:
        # await test_storage_upload_bytes(db)
        # await test_storage_upload_path(db)
        # await test_storage_upload_open_file_object(db)
        #
        # # rooms:
        # await test_rooms_get_presence_returns_dict(db)
        #
        # # error path:
        # await test_invalid_app_id_raises_parsed_error(db)
        #
        # # subscriptions:
        # await test_subscribe_query_emits_initial_data(db)
        # await test_subscribe_query_emits_live_update(db)
        # await test_subscribe_query_emits_error_on_bad_creds(db)
        # await test_subscribe_query_cleanup_on_context_exit(db)
        # await test_subscribe_query_reconnects_after_sse_dropped(db)
        #
        # # streams:
        # await test_stream_write_then_read_by_client_id(db)
        # await test_stream_read_by_stream_id(db)
        # await test_stream_read_with_byte_offset_resumes_mid_stream(db)
        # await test_streams_queryable_via_query_api(db)
        # await test_writer_reconnects_after_sse_dropped(db)
        #
        # # webhooks:
        # await test_webhooks_create_list_delete(db)
        # await test_webhooks_update_changes_fields(db)
        # await test_webhooks_enable_disable_round_trip(db)
        # await test_webhooks_get_event_and_payload(db)
        # await test_webhooks_resend_event(db)
        # await test_webhooks_validate_with_fixture(db)
        # await test_webhooks_validate_rejects_tampered(db)
        pass


if __name__ == "__main__":
    asyncio.run(main())
