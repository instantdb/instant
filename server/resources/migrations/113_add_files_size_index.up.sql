-- Note: Create this index concurrently before deploying to prod

-- Add partial index to $files.size system attr to speed up storage usage
-- by app queries
create index if not exists triples_files_size_idx
  on triples (app_id, triples_extract_number_value(value))
  where attr_id = '96653230-13ff-ffff-2a35-24609fffffff'
    and ave
    and checked_data_type = 'number';
