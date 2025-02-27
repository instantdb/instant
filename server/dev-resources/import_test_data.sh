#!/usr/bin/env bash

set -euxo pipefail

PWD=$(dirname "$0")

psql -d $DATABASE_URL -c "\copy instant_users ($(head -1 $PWD/users.csv | sed 's/,/, /g')) from '$PWD/users.csv' with (format csv, header true);"
# psql -d $DATABASE_URL -c "\copy apps ($(head -1 $PWD/apps.csv | sed 's/,/, /g')) from '$PWD/apps.csv' with (format csv, header true);"
# psql -d $DATABASE_URL -c "\copy attrs ($(head -1 $PWD/attrs.csv | sed 's/,/, /g')) from '$PWD/attrs.csv' with (format csv, header true);"
# psql -d $DATABASE_URL -c "\copy idents ($(head -1 $PWD/idents.csv | sed 's/,/, /g')) from '$PWD/idents.csv' with (format csv, header true);"
# psql -d $DATABASE_URL -c "\copy triples ($(head -1 $PWD/triples.csv | sed 's/,/, /g')) from '$PWD/triples.csv' with (format csv, header true);"
# psql -d $DATABASE_URL -c "\copy transactions ($(head -1 $PWD/transactions.csv | sed 's/,/, /g')) from '$PWD/transactions.csv' with (format csv, header true);"
