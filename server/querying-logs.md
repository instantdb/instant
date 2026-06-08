# Querying production logs

Server stdout (every `log/*` call and every OpenTelemetry span) ships as logfmt
through Vector to S3 as snappy-compressed Parquet, partitioned by env / year /
month / day / hour / minute. Two ways to query: Athena (catalogued tables) and
DuckDB directly against S3 (ad-hoc, no catalog). Prefer DuckDB because it is cheaper and faster.

## Where the data lives

|                  |                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Bucket**       | `s3://eb-logs-597134865416-us-east-1-an/`                                                                                                |
| **Region**       | `us-east-1`                                                                                                                              |
| **Prefix**       | `logs/env=<env-name>/year=YYYY/month=MM/day=DD/hour=HH/minute=MM/`                                                                       |
| **Format**       | One snappy Parquet file per Vector batch (10 MB cap or 60 s; prod cuts ~3 files/min)                                                     |
| **Field schema** | [`log-fields.md`](./log-fields.md)                                                                                                       |
| **Athena DDL**   | [`athena/instant_logs_prod.sql`](./athena/instant_logs_prod.sql), [`athena/instant_logs_staging.sql`](./athena/instant_logs_staging.sql) |

Environment names (used both in the S3 path and Athena partition values):

- **prod**: `Instant-docker-prod-env-2`
- **staging**: `Instant-experimental-docker-env`

## Trace ID → partition

Trace IDs encode their start time as the **last 8 hex characters** (big-endian
epoch seconds; see `instant.util.id-generator`). Decode before you query so
you don't scan partitions you don't need.

```
trace_id = "abc...def01234"
                    ^^^^^^^^ epoch seconds (hex)
```

```
python -c "import datetime; print(datetime.datetime.utcfromtimestamp(int('def01234', 16)))"
```

Use the decoded UTC timestamp to pick `year/month/day/hour/minute`. The
partition is keyed off Vector's ingestion time: when Vector read the line
from docker, which is roughly when the JVM emitted it. For log lines, that
matches the trace start within a second. For long spans the partition
lands at span-end (when the exporter flushed), which can be a minute or
two after the trace started, so if a `trace_id`'s decoded minute has no
match, look at the next one or two. The app's emitted timestamp is
preserved as `event_time`.

Athena charges $5/TB scanned on snappy-compressed parquet (~33 MB/minute),
so a one-minute partition scan is ~$0.0002 and a one-hour scan is ~$0.01.
A whole-day scan without partition filters is ~$0.25.

## Path 1: Athena via aws.dp-mcp MCP

Same MCP server used for the CloudFront / ALB log tables. Tables already exist:

- `instant_logs` (prod)
- `instant_logs_staging`

Standard call shape (mirrors the CloudFront pattern in `CLAUDE.md`):

```
start-query-execution
  query_string="
    SELECT timestamp, level, message, exception_type, exception_message
    FROM instant_logs
    WHERE year = 2026 AND month = 6 AND day = 6 AND hour = 23
      AND minute BETWEEN 15 AND 30
      AND app_id = '<app-id>'
      AND level = 'ERROR'
    LIMIT 100"
  query_execution_context={"Database": "default", "Catalog": "AwsDataCatalog"}
  work_group="primary"
  result_configuration={"OutputLocation": "s3://aws-athena-query-results-us-east-1-597134865416/"}
```

Then poll `get-query-execution` until `Status.State == "SUCCEEDED"` and call
`get-query-results`.

Filter on the partition columns first (`year`, `month`, `day`, `hour`,
optionally `minute`); without them you scan everything. Backtick reserved
words: `` `timestamp` ``, `` `limit` ``, `` `offset` ``, `` `timeout` ``,
`` `year` ``/`` `month` ``/`` `day` ``/`` `hour` ``/`` `minute` ``.

## Path 2: DuckDB directly

Faster than Athena for one-hour ad-hoc scans (no catalog round-trip, no
schema-drift dance). Needs AWS credentials for account `597134865416` with
S3 read access to the bucket, plus `duckdb` installed locally
(`brew install duckdb`).

Credentials: whatever your normal AWS workflow uses. Export `AWS_PROFILE`
to whichever named profile in `~/.aws/credentials` has access (or set
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`
directly). The `credential_chain` provider below picks up either form
plus the EC2 instance role and SSO sessions.

One-time setup at the top of each session:

```sql
INSTALL httpfs;
LOAD httpfs;
SET s3_region = 'us-east-1';
CREATE SECRET (TYPE S3, PROVIDER credential_chain);
```

(If `credential_chain` doesn't pick up the right credentials, you can pin
to a profile explicitly with `..., PROFILE '<your-profile>'`.)

Then query directly against S3 glob patterns:

```sql
SELECT *
FROM read_parquet(
  's3://eb-logs-597134865416-us-east-1-an/logs/env=Instant-docker-prod-env-2/year=2026/month=06/day=06/hour=23/minute=*/*.parquet',
  union_by_name = true
)
WHERE app_id = '<app-id>'
LIMIT 100;
```

Or as a bash one-liner, handy for piping into other tools:

```
duckdb -markdown -c "
INSTALL httpfs; LOAD httpfs; SET s3_region = 'us-east-1';
CREATE SECRET (TYPE S3, PROVIDER credential_chain);
SELECT *
FROM read_parquet('s3://eb-logs-597134865416-us-east-1-an/logs/env=Instant-docker-prod-env-2/year=2026/month=06/day=06/hour=23/minute=*/*.parquet', union_by_name=true)
WHERE trace_id = '<the-trace-id>'
ORDER BY timestamp;
"
```

Glob narrower than an hour: `hour=23/minute={15..30}/*.parquet`. Whole hour:
`hour=23/minute=*/*.parquet`. Multiple hours: `hour={22,23}/minute=*/*.parquet`.
Whole day: `hour=*/minute=*/*.parquet`. DuckDB expands these and reads files
in parallel.

`union_by_name = true` is required. Different parquet files (especially
from before/after a vector.yaml change) have different column sets and
sometimes different column types; `union_by_name` merges them. Without it
DuckDB errors on the first column mismatch.

## Common queries

### Find every event for a trace

```sql
SELECT timestamp, name, level, message, duration_ms, exception_message
FROM read_parquet('s3://eb-logs-.../env=Instant-docker-prod-env-2/year=2026/month=06/day=06/hour=23/minute=*/*.parquet', union_by_name=true)
WHERE trace_id = '<id>'
ORDER BY timestamp;
```

### Slow spans

```sql
SELECT name, duration_ms, app_id, op
FROM read_parquet('s3://.../hour=23/minute=*/*.parquet', union_by_name=true)
WHERE duration_ms > 1000
ORDER BY duration_ms DESC
LIMIT 50;
```

### Lines that didn't parse as logfmt (raw println etc.)

```sql
SELECT timestamp, message
FROM read_parquet('s3://.../hour=23/minute=*/*.parquet', union_by_name=true)
WHERE raw = true
ORDER BY timestamp;
```

### Exclude a noisy column from a wide SELECT

```sql
-- DuckDB
SELECT * EXCLUDE (exception_stacktrace, label)
FROM read_parquet('s3://.../hour=23/minute=*/*.parquet', union_by_name=true)
WHERE trace_id = '<id>';
```

Athena uses Trino but doesn't enable `SELECT * EXCEPT`. Use DuckDB if you
need to drop columns from a `SELECT *`.

## Schema drift caveats

Some fields acquired a `to_int` coercion in vector.yaml after data had
already been written without it. In old parquet files they're string-typed;
in new ones they're int-typed. The known ones:

- `port`
- `tx_bytes`
- `active_connections`, `idle_connections`, `pending_threads`
- `clojure_error_line`
- `run_time_ms`, `total_delay_ms`, `attempt`, `loops`, `message_count`, `skipped_size`

In DuckDB with `union_by_name = true`, these read fine (typed as the
broader type, with mixed values).

In Athena, the DDL declares these columns as `string` to dodge
`Field X's type BINARY is incompatible with bigint`. Cast at the call site
when you need them as numbers: `CAST("port" AS BIGINT)`.

## Cost & efficiency

Athena charges $5/TB scanned on snappy-compressed parquet (~33 MB/min,
~2 GB/hour). With minute pruning, a minute-scope query is ~$0.0002 and an
hour-scope one is ~$0.01. Without partition filters, a day is ~$0.25 and a
week is ~$1.75.

DuckDB pays only for S3 GETs (negligible) plus local CPU/RAM. It's the
right tool for hour or day scope; for weeks of data, try to use Honeycomb.

Either way, filter on `year`/`month`/`day`/`hour` first and narrow to
`minute` when you have a trace-ID timestamp or other minute-precision hint.
Prefer Honeycomb for queries spanning longer than a full day.

## When to use which

| Task                                    | Tool                                  |
| --------------------------------------- | ------------------------------------- |
| One trace ID, one hour                  | DuckDB                                |
| `SELECT *` minus a few columns          | DuckDB (Athena lacks `EXCEPT`)        |
| Joining logs to other catalog tables    | Athena                                |
| Schema-drift int columns as actual ints | DuckDB                                |
| Building a saved dashboard              | Athena (and bookmark the saved query) |
