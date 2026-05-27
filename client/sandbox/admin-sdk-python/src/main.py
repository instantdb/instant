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

from instantdb import AsyncInstant, InstantAPIError, id

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


# ---------- entry ----------


async def main() -> None:
    # app_id and admin_token fall back to INSTANT_APP_ID / INSTANT_ADMIN_TOKEN.
    # Default to a local Instant server; set INSTANT_API_URI in .env to point
    # elsewhere (e.g. https://api.instantdb.com).
    api_uri = os.environ.get("INSTANT_API_URI", "http://localhost:8888")

    async with AsyncInstant(api_uri=api_uri) as db:
        # Uncomment a call to run it.
        #
        # auth:
        # await test_send_magic_code(db)
        # await test_check_magic_code_round_trip(db)
        # await test_create_and_verify_token_round_trip(db)
        # await test_get_and_delete_user(db)
        # await test_sign_out_does_not_error(db)
        #
        # query + transact:
        # await test_transact_query_delete_cycle(db)
        # await test_link_and_nested_query_via_chained_ops(db)
        # await test_unlink_removes_the_link(db)
        # await test_create_succeeds_new_eid_fails_existing(db)
        # await test_tx_rule_params_op_accepted_by_server(db)
        # await test_merge_preserves_other_keys(db)
        #
        # impersonation + debug:
        # await test_as_guest_query_doesnt_crash(db)
        # await test_debug_query_returns_check_results(db)
        # await test_debug_transact_returns_check_results(db)
        #
        # storage:
        # await test_storage_upload_bytes(db)
        # await test_storage_upload_path(db)
        #
        # rooms:
        # await test_rooms_get_presence_returns_dict(db)
        #
        # error path:
        # await test_invalid_app_id_raises_parsed_error(db)
        pass


if __name__ == "__main__":
    asyncio.run(main())
