"""Hello world InstantDB script.

Reads INSTANT_APP_ID and INSTANT_APP_ADMIN_TOKEN from the environment. Run:

    uv run python main.py
"""

import time

from dotenv import load_dotenv
from instantdb import Instant, id

load_dotenv()

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
        status = "x" if todo["done"] else " "
        print(f"  [{status}] {todo['text']}")


if __name__ == "__main__":
    main()
