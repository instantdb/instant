#!/usr/bin/env bash

set -euxo pipefail

PWD=$(dirname "$0")

psql -d $DATABASE_URL -c "\copy instant_users from '$PWD/users.csv' with (format csv, header true);"
psql -d $DATABASE_URL -c "\copy apps from '$PWD/apps.csv' with (format csv, header true);"
psql -d $DATABASE_URL -c "\copy attrs from '$PWD/attrs.csv' with (format csv, header true);"
psql -d $DATABASE_URL -c "\copy idents from '$PWD/idents.csv' with (format csv, header true);"
psql -d $DATABASE_URL -c "\copy triples from '$PWD/triples.csv' with (format csv, header true);"
psql -d $DATABASE_URL -c "\copy transactions from '$PWD/transactions.csv' with (format csv, header true);"
