#!/bin/bash
set -e

# Usage
#  scripts/export.sh --email 'your-email-address' --app-id 1c0a9039-c387-4315-8471-58979bef93bf

database_url=instant

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --app-id) app_id="$2"; shift ;;
    --database-url) database_url="$2"; shift ;;
    --email) creator_email="$2"; shift ;;
    *) echo "Unknown parameter passed: $1"; exit 1 ;;
  esac
  shift
done

script_dir=$(dirname "${BASH_SOURCE[0]}")
files_dir="$script_dir/export/"

prod_database_url=$("$script_dir/prod_connection_string.sh")

echo 'Follow progress on prod with:'

echo '  with total_tuples as ('
echo '    select count(*) as total_tuples'
echo '    from triples'
echo "    where app_id = '$app_id'"
echo '  )'
echo '  select'
echo '    total_tuples.total_tuples,'
echo '    tuples_processed,'
echo '    total_tuples.total_tuples - tuples_processed as remaining_tuples,'
echo '    (tuples_processed::numeric / total_tuples.total_tuples) * 100 as percent_done'
echo '  from'
echo '    pg_stat_progress_copy'
echo '    join total_tuples on true;'
echo ''

psql -d $database_url -v app_id="$app_id" -v creator_email="$creator_email" <<EOF
\set ON_ERROR_STOP on
BEGIN;
\echo 'Copying app'

create temp table temp_app (
  id uuid,
  title text,
  created_at timestamp without time zone
);

\copy temp_app FROM PROGRAM 'psql -d "$prod_database_url" -v app_id="$app_id" -f $files_dir/copy_apps.sql'
with app as (
  select * from temp_app where id = :'app_id'
)
insert into apps (id, creator_id, title, created_at)
  select id, (select id from instant_users where email = :'creator_email') creator_id, title, created_at from app;

insert into app_admin_tokens (app_id, token) values (:'app_id', gen_random_uuid());

\echo 'Copying attrs'
\copy attrs FROM PROGRAM 'psql -d "$prod_database_url" -v app_id="$app_id" -f $files_dir/copy_attrs.sql'
\echo 'Copying idents'
\copy idents FROM PROGRAM 'psql -d "$prod_database_url" -v app_id="$app_id" -f $files_dir/copy_idents.sql'
\echo 'Copying rules'
\copy rules FROM PROGRAM 'psql -d "$prod_database_url" -v app_id="$app_id" -f $files_dir/copy_rules.sql'
\echo 'Copying triples'
\copy triples FROM PROGRAM 'psql -d "$prod_database_url" -v app_id="$app_id" -f $files_dir/copy_triples.sql'
COMMIT;
EOF
