"""Hello world InstantDB script.

Reads INSTANT_APP_ID and INSTANT_ADMIN_TOKEN from the environment. Run:

    uv run --env-file .env python main.py
"""

import time

from instant_types import Instant, id

db = Instant()


def main() -> None:
    todo_id = id()
    db.transact(
        db.tx.todos[todo_id].update(
            {
                "text": "Hello from Python!",
                "done": False,
                "createdAt": int(time.time() * 1000),
            }
        )
    )

    result = db.query({"todos": {}})
    print(f"Found {len(result['todos'])} todo(s):")
    for todo in result["todos"]:
        row = todo.model_dump() if hasattr(todo, "model_dump") else todo
        status = "x" if row["done"] else " "
        print(f"  [{status}] {row['text']}")


if __name__ == "__main__":
    main()
