# Upgrading a self-hosted InstantDB

You can ignore this guide if you are creating a new self-hosted Instant deployment.
This doc is only for deployments that were using postgres 16 and want to update.

## PostgreSQL 16 → 17 (one-time migration)

The compose files ship PostgreSQL 17, but reuse the same `backend-db` volume that
older deployments populated with PostgreSQL 16.

A PostgreSQL major version cannot read an older major version's data directory,
so if you pull these images on top of an existing PostgreSQL 16 volume the
container will refuse to start with:

```
FATAL: database files are incompatible with server
DETAIL: The data directory was initialized by PostgreSQL version 16, which is not compatible with this version 17.x.
```

Run this migration **once**, using dump/restore. Substitute your compose file
with `-f` if you are not using the default `docker-compose.yml`, and set the
`instant`/`instant`/`pass` names to whatever you configured via
`POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD`.

### 1. Dump the database while still on PostgreSQL 16

Do this **before** pulling the PostgreSQL 17 image. Check out the previous
revision if you have already pulled it, so the `postgres` service is still
`postgresql-16-...`, then:

```bash
docker compose up -d postgres
# wait until it reports healthy
docker compose exec -T postgres pg_dump -U instant -Fc instant > instant-pg16.dump
```

Keep `instant-pg16.dump` somewhere safe.

### 2. Start PostgreSQL 17 on a fresh data directory

```bash
docker compose down
# remove ONLY the postgres volume; the leading name is your compose project
# (usually the directory name). `docker volume ls` shows the exact name.
docker volume rm "$(basename "$PWD")_backend-db"
# now pull / check out the PostgreSQL 17 compose files
docker compose up -d postgres
# wait until it reports healthy — this creates a fresh, empty `instant` database
```

### 3. Restore the dump

```bash
docker compose exec -T postgres pg_restore -U instant -d instant --clean --if-exists < instant-pg16.dump
docker compose up -d
```

Verify the app comes up and your data is present, then you can delete
`instant-pg16.dump`.

> If you would rather not migrate in place, point the `postgres` service at a
> brand-new volume (e.g. `backend-db-17`) instead of `backend-db` and restore
> the dump into it. That keeps the untouched PostgreSQL 16 volume around as a
> rollback.
