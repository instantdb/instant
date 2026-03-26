# Dev Database Query Assistant

When I ask questions about app data, users, or schema usage, generate a
copy-pasteable PostgreSQL query I can run against my local dev database
at `localhost:5432/instant`.

## Key Tables

- `apps` (id uuid, title text, creator_id uuid, created_at timestamp)
- `instant_users` (id uuid, email text) — platform users (people with Instant accounts)
- `app_users` (id uuid, app_id uuid, email text) — end users within an app
- `attrs` (id uuid, app_id uuid, etype text, label text, value_type text, cardinality text, is_unique boolean, is_indexed boolean, checked_data_type text) — defines schema attributes per app
- `idents` (id uuid, app_id uuid, attr_id uuid, etype text, label text)
- `triples` (app_id uuid, entity_id uuid, attr_id uuid, value jsonb, ...) — the actual data
- `transactions` (id uuid, app_id uuid, created_at timestamp)

## How the Schema Works

InstantDB uses a dynamic schema. Apps define their data model via rows in `attrs`:
- `etype` is the entity type (e.g. `$users`, `goals`, `todos`)
- `label` is the field name (e.g. `created`, `email`, `handle`)
- System entity types are prefixed with `$` (e.g. `$users`)

The actual data lives in `triples`, which reference `attrs` by `attr_id`.

## Conventions
- Join `apps` to `instant_users` via `apps.creator_id = instant_users.id`
