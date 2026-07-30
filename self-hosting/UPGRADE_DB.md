# Upgrading a self-hosted InstantDB

You can ignore this guide if you are creating a new self-hosted Instant deployment.
This doc is only for deployments that were using postgres 16 and want to update.

## PostgreSQL 16 → 17 (one-time migration)

The compose files ship PostgreSQL 17, but reuse the same `backend-db` volume that
older deployments populated with PostgreSQL 16.

A PostgreSQL major version cannot read an older major version's data directory,
so if you pull these images on top of an existing PostgreSQL 16 volume the
container will refuse to start with:

```text
FATAL: database files are incompatible with server
DETAIL: The data directory was initialized by PostgreSQL version 16, which is not compatible with this version 17.x.
```

Run this migration **once**, using dump/restore. The commands below assume the
default `docker-compose.yml`, the user `instant`, and the database `instant`.
If your deployment uses a different compose file or project name, add the same
`-f`/`-p` options to **every** `docker compose` command below, including the one
nested inside the volume-lookup in step 2 and the ones in the rollback notes.
Wherever you see `instant`, substitute the `POSTGRES_USER` / `POSTGRES_DB`
values you configured.

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

Postgres stores its data in a Docker volume. Get that volume's exact name
straight from the running container, so you delete the right one. Run this
before `docker compose down`, while the container still exists:

```bash
# Read the volume backing /var/lib/postgresql/data straight from the container
PG_VOLUME=$(docker inspect "$(docker compose ps -aq postgres)" \
  --format '{{ range .Mounts }}{{ if eq .Destination "/var/lib/postgresql/data" }}{{ .Name }}{{ end }}{{ end }}')
echo "Resolved PostgreSQL data volume: $PG_VOLUME"
```

Confirm the printed name is the PostgreSQL data volume you intend to delete
before continuing. If that line printed a blank name, stop and re-run the
resolve step while the container is still up, rather than deleting anything.
This step is destructive and irreversible. If you would rather leave your
PostgreSQL 16 volume untouched, use the alternative at the end of this guide
instead of deleting anything.

```bash
docker compose down

# Check out the PostgreSQL 17 revision, then validate its compose config and
# print the resolved postgres image, all before deleting the old volume so a bad
# checkout can't leave you with no database (you may have checked out PG16 for
# the dump above). Stop here if either command fails:
git checkout <pg17-revision>              # e.g. main
docker compose config >/dev/null          # validates the compose file; errors are fatal
docker compose config --images postgres   # prints the resolved postgres image
```

Confirm that image tag denotes PostgreSQL 17 (e.g. `postgres:17`). If it still
shows 16, your checkout didn't switch revisions, so fix that before deleting the
volume.

```bash
# Only now that the PG17 config and image are confirmed, and $PG_VOLUME is
# verified above:
docker volume rm "$PG_VOLUME"
docker compose up -d --wait postgres
# --wait blocks until the fresh, empty `instant` database is healthy
```

### 3. Restore the dump

```bash
docker compose exec -T postgres pg_restore -U instant -d instant --clean --if-exists --single-transaction < instant-pg16.dump
docker compose up -d
```

Verify the app comes up and your data is present, then you can delete
`instant-pg16.dump`.

> If you would rather not migrate in place, point the `postgres` service at a
> brand-new volume (e.g. `backend-db-17`) instead of `backend-db` and restore
> the dump into it. That keeps the untouched PostgreSQL 16 volume around as a
> rollback.
>
> To roll back to PostgreSQL 16 after using the alternative volume, stop the
> stack, restore the previous compose/image configuration, and start it again
> against the original `backend-db` volume. **Never delete `backend-db`**. It
> still holds your PostgreSQL 16 data:
>
> ```bash
> docker compose down
> # restore the PostgreSQL 16 compose file and image tag, e.g. by checking out
> # the previous revision (use your own compose file if it isn't the default):
> git checkout <previous-revision> -- docker-compose.yml
> # the untouched backend-db volume is still attached by that compose file,
> # so do NOT run `docker volume rm` against it
> docker compose up -d
> ```
