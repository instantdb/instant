create type checked_data_type as enum ('string', 'number', 'boolean', 'date');

alter table attrs add column checked_data_type checked_data_type;
alter table attrs add column checking_data_type boolean;
alter table attrs add column indexing boolean;

alter table triples add column checked_data_type checked_data_type;

-- Assumes that the check has already been run on the triples, so ignores
-- any type mismatch
create or replace function triples_extract_string_value(value jsonb)
returns text as $$
  begin
    if jsonb_typeof(value) = 'string' then
      return (value->>0)::text;
    else
      return null;
    end if;
  end;
$$ language plpgsql immutable;

-- Assumes that the check has already been run on the triples, so ignores
-- any type mismatch
create or replace function triples_extract_number_value(value jsonb)
returns double precision as $$
  begin
    if jsonb_typeof(value) = 'number' then
      return (value->>0)::double precision;
    else
      return null;
    end if;
  end;
$$ language plpgsql immutable;

-- Assumes that the check has already been run on the triples, so ignores
-- any type mismatch
create or replace function triples_extract_boolean_value(value jsonb)
returns double precision as $$
  begin
    if jsonb_typeof(value) = 'boolean' then
      return (value->>0)::boolean;
    else
      return null;
    end if;
  end;
$$ language plpgsql immutable;

-- Assumes that the check has already been run on the triples, so ignores
-- any type mismatch
create or replace function triples_extract_date_value(value jsonb)
returns timestamp with time zone as $$
  begin
    case jsonb_typeof(value)
      when 'number' then
        return to_timestamp((value->>0)::double precision);
      when 'string' then
        return ((value->>0)::text)::timestamp with time zone;
      else
        return null;
    end case;
  end;
$$ language plpgsql immutable;

create or replace function is_jsonb_valid_timestamp(value jsonb)
returns boolean as $$
  declare
    timestamp_check timestamp with time zone;
    valid boolean;
  begin
    begin
      if (jsonb_typeof(value) = 'number') then
        timestamp_check := triples_extract_date_value(value);
        valid := true;
      else
        valid := false;
      end if;

    exception when others then
      valid := false;
    end;

    return valid;
  end;
$$ language plpgsql immutable;

create or replace function is_jsonb_valid_datestring(value jsonb)
returns boolean as $$
  declare
    timestamp_check timestamp with time zone;
    valid boolean;
  begin
    begin
      if jsonb_typeof(value) = 'string' then
        timestamp_check := triples_extract_date_value(value);
        valid := true;
      else
        valid := false;
      end if;
    exception when others then
      valid := false;
    end;

    return valid;
  end;
$$ language plpgsql immutable;

-- XXX: Note about how we should go about changing this
create or replace function triples_valid_value(data_type checked_data_type, value jsonb)
returns boolean as $$
  begin
    case data_type
      when 'string' then
        return jsonb_typeof(value) in ('string', 'null');
      when 'number' then
        return jsonb_typeof(value) in ('number', 'null');
      when 'boolean' then
        return jsonb_typeof(value) in ('boolean', 'null');
      when 'date' then
        case jsonb_typeof(value)
          when 'null' then
            return true;
          when 'number' then
            return is_jsonb_valid_timestamp(value);
          when 'string' then
            return is_jsonb_valid_datestring(value);
          else
            return false;
        end case;
      else
        return data_type is null;
    end case;
  end;
$$ language plpgsql immutable;


-- We use `not valid` here to prevent a full table scan when we add the constraint
-- We need to run validate constraint in production after adding this
-- See note https://www.postgresql.org/docs/current/sql-altertable.html#SQL-ALTERTABLE-NOTES
-- TODO: run `alter table triples validate constraint valid_value_data_type;` in production
alter table triples
  add constraint valid_value_data_type
    check (triples_valid_value(checked_data_type, value))
    not valid;

create type indexing_job_status as enum (
  'waiting',
  'processing',
  'canceled',
  'completed',
  'errored'
);

create table indexing_jobs(
  id uuid primary key,
  app_id uuid not null references apps(id) on delete cascade,
  attr_id uuid not null references attrs(id) on delete cascade,
  -- Prevents multiple processes from conflicting (see index below)
  job_serial_key text not null,
  job_type text not null,
  job_status text not null,
  job_dependency uuid references indexing_jobs(id) on delete cascade,
  job_stage text,
  -- If the job is checking the data type, then this field is the
  -- data type that is being checked.
  checked_data_type checked_data_type,
  error text,
  work_estimate integer,
  work_completed integer,
  worker_id text,
  created_at timestamp with time zone not null default now(),
  done_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

create index on indexing_jobs (app_id);
create index on indexing_jobs (attr_id);
create index on indexing_jobs (job_dependency);

-- Prevents multiple processes from conflicting
create unique index on indexing_jobs (app_id, attr_id, job_serial_key)
  where job_status = 'processing';

create trigger update_updated_at_trigger
  before update on indexing_jobs for each row
  execute function update_updated_at_column();
