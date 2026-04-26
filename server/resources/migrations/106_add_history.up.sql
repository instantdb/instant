create type isn as (slot_num int, lsn pg_lsn);
create type history_storage as enum ('s3', 'pg');

create table history (
  isn isn not null,
  app_id uuid not null,
  -- Acts as a bloom filter for the `a`, `e` (and possibly `v`) topic fields
  topics bigint not null,
  storage history_storage not null,
  -- Only present if storage = 'pg'
  content bytea,
  -- Each bucket spans 30 days. 13 buckets cycle every 390 days, giving ≥360
  -- days of retention. Truncate the next-to-be-reused bucket before writes
  -- wrap around.
  partition_bucket int not null,
  primary key (isn, partition_bucket)
) partition by range (partition_bucket);

-- Skip TOAST compression on content; we compress application-side before writing.
alter table history alter column content set storage external;

create table history_0 partition of history for values from (0) to (1);
create table history_1 partition of history for values from (1) to (2);
create table history_2 partition of history for values from (2) to (3);
create table history_3 partition of history for values from (3) to (4);
create table history_4 partition of history for values from (4) to (5);
create table history_5 partition of history for values from (5) to (6);
create table history_6 partition of history for values from (6) to (7);
create table history_7 partition of history for values from (7) to (8);
create table history_8 partition of history for values from (8) to (9);
create table history_9 partition of history for values from (9) to (10);
create table history_10 partition of history for values from (10) to (11);
create table history_11 partition of history for values from (11) to (12);
create table history_12 partition of history for values from (12) to (13);

-- topics allows us to do:
--   `select isn from history where app_id = :id and isn > :last-isn and (topics & :topic-mask != 0)`
-- That will return false positives, but should be very fast and requires very little data.

-- If it returns too many false positives, we have a few options:
-- 1. Create multiple topics hashes and check them all (more cpu)
-- 2. Store the `e` and `a` in array fields and check them (more space)

-- There's not really a great way to index arrays of `e` and `a` that would work for our expected usage
-- pattern. There should be a long history that is below the `:last-isn` we're querying, with a much
-- smaller set in front. We could use a gin index, but it would return a very large set for the past.

-- For more complex topics, we'll probably need to move topics to another linked table
create index topic_idx on history (app_id, isn) include (topics);
