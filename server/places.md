# Places Where attrs Table is Queried

This document lists all locations in the codebase where the `attrs` table is queried directly or through joins. These locations will need to be updated to use `active_attrs` view when implementing soft-delete functionality.

## Direct Table Queries

### 1. src/instant/db/model/attr.clj

**DELETE queries:**
x- `delete-by-app-id!` (line 185): `DELETE FROM attrs WHERE attrs.app_id = ?`
x- `delete-multi!` (line 590): `{:delete-from :attrs ...}`

**SELECT queries:**
- `validate-add-required!` (line 275): `SELECT * FROM attrs JOIN triples ...`

Not needed, as this is about creating a new attr 

- `insert-multi!` (line 360): Subquery checking existing attrs `{:select :1 :from :attrs ...}`

Not needed, as here id would have to be the same 


- `validate-update-required` (line 476): `JOIN attrs ON attrs_cte.id = attrs.id`

This is not needed, as this about existing attrs. 

- `delete-attr-usage` (line 500): Subquery `SELECT attrs.id FROM attrs WHERE ...`



x - `get-by-app-id*` (line 721): Complex query with CTEs selecting from attrs
x - `get-by-app-ids` (line 756): `{:select [:attrs.* ...] :from :attrs ...}`

### 2. src/instant/db/model/triple.clj

**JOIN queries:**
x- `value-lookupable-sql` (line 93): `[:exists {:select :* :from :attrs ...}]`

- `create-lookup-triple-tx-steps` (line 179): `JOIN attrs ON ...` (in CTE)
- `delete-entity-multi!` (line 706): `JOIN attrs ON triples.attr_id = attrs.id`
- `delete-entity-multi!` (line 717): `JOIN attrs ON triples.attr_id = attrs.id` (reverse attrs)

we _want_ these to always check, because when entities delete the triples should delete too.

### 3. src/instant/db/indexing_jobs.clj

**JOIN queries:**
- `get-for-client-q` (line 89): `{:from :attrs :join [:idents ...] ...}`
- `get-for-client-q` (line 142): Subquery `{:select :id :from :attrs ...}`
- `get-for-client-q` (line 147): Nested subquery `{:select :etype :from :attrs ...}`
- `create-indexing-job-entities` (line 1109): `{:select :* :from :attrs ...}`

### 4. scripts/export/copy_attrs.sql
- Line 1: `COPY (SELECT * FROM attrs WHERE app_id = :'app_id') TO STDOUT`

### 5. resources/migrations/68_attrs_etype_label_schema.up.sql
- Contains DDL for attrs table and trigger `check_attrs_unique_names` that queries attrs table

## Indirect Usage Through attr-model Functions

The following files use `attr-model` functions that internally query the attrs table:

### Core attr-model function users:
- src/instant/db/transaction.clj - Uses `attr-model/insert-multi!`, `delete-multi!`, `update-multi!`
- src/instant/db/instaql.clj - Uses `attr-model/seek-by-*` functions extensively
- src/instant/admin/model.clj - Uses `attr-model/seek-by-fwd-ident-name`
- src/instant/reactive/session.clj - Uses `attr-model/get-by-app-id`
- src/instant/db/permissioned_transaction.clj - Uses various attr-model functions
- src/instant/model/schema.clj - Uses `attr-model/get-by-app-id`
- src/instant/system_catalog_migration.clj - Uses `attr-model/get-by-app-id`, `insert-multi!`

### Other notable users:
- src/instant/reactive/query.clj
- src/instant/data/resolvers.clj
- src/instant/db/cel.clj
- src/instant/util/instaql.clj
- src/instant/dash/routes.clj
- src/instant/admin/routes.clj

## Key Changes Required

### 1. Create active_attrs view
All SELECT queries should be updated to use `active_attrs` instead of `attrs`.

### 2. Update DELETE operations
- Change `delete-multi!` to perform soft-delete (UPDATE deletion_marked_at)
- Add new `hard-delete-multi!` for sweeper use

### 3. Update JOINs
All JOINs with attrs table should join with `active_attrs` view instead.

### 4. Special Considerations

**Triggers:**
- `check_attrs_unique_names` trigger needs to be aware of soft-deleted attrs
- May need to update uniqueness constraints to exclude soft-deleted records

**CTEs and Subqueries:**
- Complex queries with CTEs (like in `get-by-app-id*`) need careful review
- Subqueries checking for attr existence need to exclude soft-deleted attrs

**System Catalog:**
- System catalog attrs should never be soft-deleted
- May need special handling in deletion logic

**Performance:**
- Index on `deletion_marked_at` will be critical
- View performance should be monitored, especially for complex joins

## Testing Requirements

All test files that reference attrs functionality will need updates:
- test/instant/db/transaction_test.clj
- test/instant/db/instaql_test.clj
- test/instant/reactive/session_test.clj
- test/instant/admin/routes_test.clj
- test/instant/db/indexing_jobs_test.clj
- test/instant/reactive/invalidator_test.clj
