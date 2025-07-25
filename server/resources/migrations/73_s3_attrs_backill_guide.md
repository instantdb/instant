# S3 Attrs Migration Guide

**⚠️ Note**: This migration is different from the typical SQL migrations in `server/resources/migrations/`. Instead of being a `.sql` file, this is a **Clojure-based migration** located at:

```
server/src/instant/migrations/s3_attrs_backfill.clj
```

This approach was chosen because the migration requires:
- Complex S3 API interactions to fetch file metadata
- Batch processing with retry logic
- Progress tracking and resumability
- Error handling that would be difficult to implement in pure SQL

## Overview

The S3 attrs proposal introduces two new built-in fields to the `$files` table:
- **`hash`**: The S3 ETag value (provider-agnostic naming)  
- **`lastModified`**: The S3 last-modified timestamp in epoch milliseconds

These fields enable efficient file change detection, reduce network overhead, and unlock new querying capabilities.

## Running the Migration

### Migration File Location

The migration code is located at:
```
server/src/instant/migrations/73_s3_attrs_backfill.clj
```

### Option 1: REPL-based Execution (Recommended)

Connect to your production REPL and run:

```clojure
;; 1. Load the migration namespace from server/src/instant/migrations/
(require '[instant.migrations.s3-attrs-backfill :as migration])

;; 2. Check current status and statistics
(migration/get-migration-stats)
;; => {:completed false
;;     :total-files 1500
;;     :processed-files 0
;;     :remaining-files 1500
;;     :completion-percentage 0}

;; 3. Start the migration
(migration/run-migration!)
;; => {:status :completed
;;     :total-processed 1500
;;     :total-successful 1500
;;     :total-failed 0}
```

### Option 2: Script-based Execution

Create a migration script that references the migration file in `server/src/instant/migrations/`:

```clojure
#!/usr/bin/env clojure

;; Load the migration from server/src/instant/migrations/73_s3_attrs_backfill.clj
(require '[instant.migrations.s3-attrs-backfill :as migration])

(println "Starting S3 attrs migration...")
(println "Current stats:" (migration/get-migration-stats))

(let [result (migration/run-migration!)]
  (println "Migration completed:" result)
  (println "Final stats:" (migration/get-migration-stats)))
```

## Migration Behavior

### Processing Pattern

- **Batch Size**: 50 files per batch (optimized for S3 API limits)
- **Error Handling**: Up to 3 retries with exponential backoff
- **Resumability**: Can be safely restarted - tracks progress in config table
- **Idempotency**: Skips files that already have metadata populated

### Progress Tracking

The migration uses the `config` table to track progress:

```sql
-- Check migration status in the database
SELECT * FROM config WHERE k = 's3-attrs-migration-status';
```

Sample progress states:

```json
{
  "last-entity-id": "01234567-89ab-cdef-0123-456789abcdef",
  "total-processed": 750,
  "total-successful": 745,
  "total-failed": 5,
  "completed": false
}
```

### Error Handling

The migration handles various error scenarios:

- **S3 API Rate Limits**: Exponential backoff with retries
- **Missing Files**: Logged as warnings, migration continues
- **Network Issues**: Automatic retry up to 3 times
- **Database Constraints**: Uses `ON CONFLICT DO NOTHING` for safety

## Monitoring

### Real-time Progress

```clojure
;; Check progress during migration
(migration/get-migration-stats)

;; Sample output:
;; {:completed false
;;  :total-files 10000
;;  :processed-files 3247
;;  :remaining-files 6753
;;  :completion-percentage 32
;;  :total-processed 3247
;;  :total-successful 3240
;;  :total-failed 7
;;  :last-entity-id "..."}
```

### Log Messages

Monitor application logs for:

```
INFO  [migration] Starting S3 attrs backfill migration
INFO  [migration] Processing batch {:last-entity-id "...", :total-processed 250}
INFO  [migration] Processed batch {:successful 48, :failed 2, :total-processed 300}
WARN  [migration] Failed to process files {:failed-entities ["..."]}
INFO  [migration] S3 attrs migration completed successfully {:total-processed 1500, :total-successful 1485, :total-failed 15}
```

### Database Queries

```sql
-- Count total files
SELECT COUNT(*) as total_files 
FROM triples 
WHERE app_id = 'a1111111-1111-1111-1111-111111111ca7' 
  AND attr_id = (SELECT id FROM attrs WHERE forward_ident = '...' AND etype = '$files' AND label = 'id');

-- Count files with hash populated  
SELECT COUNT(*) as processed_files
FROM triples 
WHERE app_id = 'a1111111-1111-1111-1111-111111111ca7'
  AND attr_id = (SELECT id FROM attrs WHERE forward_ident = '...' AND etype = '$files' AND label = 'hash');
```
### Database Impact

- Minimal database load - only inserts new triples
- Uses conflict resolution (`ON CONFLICT DO NOTHING`) for safety
- Batch processing reduces transaction overhead

## Troubleshooting

#### Migration Appears Stuck

```clojure
;; Check if processing is actually happening
(migration/get-migration-stats)

;; Look for recent log entries
;; If stuck, the migration can be safely restarted
```

#### High Error Rate

```clojure
;; Check specific error details in logs
;; Common causes:
;; - S3 rate limiting (automatically handled with retries)
;; - Missing files in S3 (orphaned database records)
;; - Network connectivity issues
```

#### Need to Restart Migration

```clojure
;; The migration is resumable by design
;; Simply run again - it will continue from where it left off
(migration/run-migration!)

;; If you need to completely restart (rare):
;; (migration/reset-migration!) ; Use with caution!
;; (migration/run-migration!)
```

### Emergency Procedures

#### Stop Migration Mid-Process

The migration is designed to be stopped safely at any time:

1. Stop the REPL process or kill the script
2. Check current state: `(migration/get-migration-stats)`
3. Files processed so far will retain their new metadata
4. Unprocessed files can be handled in a future run

#### Rollback (if needed)

If you need to remove the populated metadata:

```sql
-- Remove hash attributes (use with extreme caution!)
DELETE FROM triples 
WHERE app_id = 'a1111111-1111-1111-1111-111111111ca7'
  AND attr_id = (SELECT id FROM attrs WHERE etype = '$files' AND label = 'hash');

-- Remove lastModified attributes (use with extreme caution!)  
DELETE FROM triples
WHERE app_id = 'a1111111-1111-1111-1111-111111111ca7'
  AND attr_id = (SELECT id FROM attrs WHERE etype = '$files' AND label = 'lastModified');

-- Reset migration state
DELETE FROM config WHERE k = 's3-attrs-migration-status';
```

## Post-Migration Verification

### Verify Successful Migration

```clojure
(migration/get-migration-stats)
;; Should show:
;; {:completed true
;;  :completion-percentage 100
;;  :total-processed X
;;  :total-successful Y
;;  :total-failed Z}
```

### Sample Queries with New Fields

```clojure
;; Query files by hash
(instant.db.datalog/query 
  {:app-id your-app-id :attrs attrs}
  [[:ea '?e]
   [:ea '?e hash-attr-id "abc123..."]])

;; Order files by modification time (newest first)
(instant.instaql/query
  {:app-id your-app-id}
  {:$files {:$ {:order {:lastModified "desc"}}}})

;; Find recently modified files
(instant.instaql/query
  {:app-id your-app-id}
  {:$files {:$ {:where {:lastModified {:$gt 1704067200000}}}}})
```

### Performance Validation

The new fields should enable:

1. **Efficient Change Detection**: Use hash comparison instead of S3 API calls
2. **Enhanced Queries**: Sort and filter by modification time
3. **Reduced Network Overhead**: No additional S3 requests for metadata