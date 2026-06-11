# Querying production logs

Server stdout ships as logfmt through Vector to S3 as snappy-compressed
Parquet, partitioned by env / year / month / day / hour / minute. Two ways
to query: Athena (catalogued tables) and DuckDB directly against S3
(ad-hoc, no catalog). Prefer DuckDB because it is cheaper and faster.

The dominant event type is the span. Every `tracer/with-span!` and
`record-info!` produces one via the OTel exporter; these rows carry
`trace_id`, `span_id`, `name`, `duration_ms`, and per-op attributes like
`app_id` and `op`, but no `level`, `logger`, or `message`. Start
investigations from `name`, `duration_ms`, or `exception_type`, not from
`level`.

The other shape is the log line. These come from Java libraries routed
through logback (Hazelcast, Caffeine, Hikari, AWS SDK, Undertow) or from
direct `clojure.tools.logging` calls that aren't wrapped in a span. They
have `level`, `logger`, `message`, `thread`, and sometimes `exception_*`,
but no `trace_id` or `name`. Because most failures surface through spans,
`WHERE level = 'ERROR'` catches very few real errors; use
`exception_type IS NOT NULL` instead, or OR the two together.

## Where the data lives

|                  |                                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Bucket**       | `s3://eb-logs-597134865416-us-east-1-an/`                                                                                                |
| **Region**       | `us-east-1`                                                                                                                              |
| **Prefix**       | `logs/env=<env-name>/year=YYYY/month=MM/day=DD/hour=HH/minute=MM/`                                                                       |
| **Format**       | One snappy Parquet file per Vector batch (100 MB cap or 60 s; prod cuts ~1 file/min)                                                     |
| **Athena DDL**   | [`athena/instant_logs_prod.sql`](./athena/instant_logs_prod.sql), [`athena/instant_logs_staging.sql`](./athena/instant_logs_staging.sql) |

Environment names (used both in the S3 path and Athena partition values):

- **prod**: `Instant-docker-prod-env-2`
- **staging**: `Instant-experimental-docker-env`

## Trace ID → partition

Trace IDs encode their start time as the **last 8 hex characters** (big-endian
epoch seconds; see `instant.util.id-generator`). Decode before you query so
you don't scan partitions you don't need.

```text
trace_id = "abc...def01234"
                    ^^^^^^^^ epoch seconds (hex)
```

```bash
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

```text
start-query-execution
  query_string="
    SELECT timestamp, name, exception_type, exception_message, level, message
    FROM instant_logs
    WHERE year = 2026 AND month = 6 AND day = 6 AND hour = 23
      AND minute BETWEEN 15 AND 30
      AND app_id = '<app-id>'
      AND (exception_type IS NOT NULL OR level = 'ERROR')
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
SET threads = 16;
CREATE SECRET (TYPE S3, PROVIDER credential_chain);
```

`threads = 16` is the only knob that controls S3 fetch parallelism.
Each thread runs its own range-GETs and spends most of its time blocked
on the network, so going above core count is fine.

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

```bash
duckdb -markdown -c "
INSTALL httpfs; LOAD httpfs; SET s3_region = 'us-east-1'; SET threads = 16;
CREATE SECRET (TYPE S3, PROVIDER credential_chain);
SELECT *
FROM read_parquet('s3://eb-logs-597134865416-us-east-1-an/logs/env=Instant-docker-prod-env-2/year=2026/month=06/day=06/hour=23/minute=*/*.parquet', union_by_name=true)
WHERE trace_id = '<the-trace-id>'
ORDER BY timestamp;
"
```

DuckDB does not support brace expansion (`{15..30}`, `{22,23}`) in S3
paths. Whole hour: `hour=23/minute=*/*.parquet`. Whole day:
`hour=*/minute=*/*.parquet`. For a narrower window, pass a list of
explicit paths:

```sql
SELECT *
FROM read_parquet([
  's3://.../hour=23/minute=15/*.parquet',
  's3://.../hour=23/minute=16/*.parquet',
  's3://.../hour=23/minute=17/*.parquet'
], union_by_name = true)
WHERE trace_id = '<the-trace-id>';
```

For a trace ID, decode the timestamp (see "Trace ID → partition" above)
and list every minute from 5 before to 5 after. That covers Vector's
ingestion-vs-event-time skew without scanning a whole hour.

Watch the rollover: if the decoded minute is within 5 of :00 or :59 the
window spans two hours, and at 23:55–00:04 it spans two days. The
`hour=`/`day=` segments change too, so you have to emit paths for both
sides or you'll silently miss files. Generate them with proper datetime
arithmetic rather than tweaking the minute by hand:

```bash
DECODED="2026-06-11 16:57:30"  # from the python decode step
for off in $(seq -5 5); do
  python3 -c "
import datetime as d
t = d.datetime.fromisoformat('$DECODED').replace(tzinfo=d.timezone.utc) + d.timedelta(minutes=$off)
print(f's3://eb-logs-597134865416-us-east-1-an/logs/env=Instant-docker-prod-env-2/year={t.year}/month={t.month:02d}/day={t.day:02d}/hour={t.hour:02d}/minute={t.minute:02d}/*.parquet')
"
done
```

`union_by_name = true` is required. Different parquet files (especially
from before/after a vector.yaml change) have different column sets and
sometimes different column types; `union_by_name` merges them. Without it
DuckDB errors on the first column mismatch.

### Save results to a local file

If you'll look at the same window more than once, write it to a local
parquet file and query that instead of re-scanning S3:

```sql
COPY (
  SELECT *
  FROM read_parquet([...], union_by_name = true)
  WHERE trace_id = '<the-trace-id>'
) TO '/tmp/trace-<id>.parquet' (FORMAT PARQUET);
```

Then:

```bash
duckdb -markdown -c "SELECT * FROM read_parquet('/tmp/trace-<id>.parquet') ORDER BY timestamp;"
```

## Common queries

Prefer `SELECT *`. The schema is wide (see `athena/instant_logs_prod.sql`)
and op-specific columns are easy to leave out by accident.

### Errors

Catches both span-thrown exceptions (most failures) and the rare
library-logged ERROR.

```sql
SELECT *
FROM read_parquet('s3://.../hour=23/minute=*/*.parquet', union_by_name=true)
WHERE exception_type IS NOT NULL OR level = 'ERROR'
ORDER BY timestamp DESC;
```

### Find every event for a trace

```sql
SELECT *
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
SELECT * EXCLUDE (some_noisy_column)
FROM read_parquet('s3://.../hour=23/minute=*/*.parquet', union_by_name=true)
WHERE trace_id = '<id>';
```

Athena uses Trino but doesn't enable `SELECT * EXCEPT`. Use DuckDB if you
need to drop columns from a `SELECT *`.

## Schema drift caveats

Every typed column in the DDL has to match what Vector wrote to parquet.
There are two ways drift sneaks in.

The first is when a field gets added to a `to_int` or `to_bool` block in
`vector.yaml`, but old parquet files (written before the coercion landed)
still have it as a string. Athena fails the next time a query touches a
partition that straddles the change:
`HIVE_BAD_DATA: Field port's type BINARY (string) is incompatible with
bigint`.

The second is when a field that was always written as a string starts
arriving as a number from some new code path. The error looks the same,
just in the opposite direction.

Before adding a coercion, ask whether you'll actually filter or aggregate
on the typed value. If you only ever inspect the column when it shows up,
leave it as a string. Storing every counter as `bigint` costs nothing
operationally but creates a drift-prone DDL row you'll have to revisit
when the column's history shifts again.

When you hit the error in Athena, the fastest fix is to rerun the query
in DuckDB with `union_by_name = true`. DuckDB auto-promotes mixed types
across files and the query works. If you must stay on Athena, either
restrict the `WHERE` clause to a partition range that's entirely on one
side of the change, or declare the column as `string` in the DDL and
cast at the call site: `CAST("port" AS BIGINT)`.

The fields currently coerced live in `vector.yaml`'s `parse_logs`
transform. Declarations in `athena/instant_logs_*.sql` should match what's
coerced there; if they drift apart, every query against a straddling
partition fails.

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
