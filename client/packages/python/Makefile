.PHONY: install fmt lint typecheck test check build clean unasync

install:
	uv sync

fmt:
	uv run ruff format src tests

lint:
	uv run ruff format --check src tests
	uv run ruff check src tests

typecheck:
	uv run mypy src

test:
	uv run pytest

check: lint typecheck test

build:
	uv build

unasync:
	uv run python scripts/run_unasync.py
	uv run ruff check --fix --select I src/instantdb/_sync
	uv run ruff format src/instantdb/_sync

clean:
	rm -rf dist build *.egg-info .pytest_cache .mypy_cache .ruff_cache
