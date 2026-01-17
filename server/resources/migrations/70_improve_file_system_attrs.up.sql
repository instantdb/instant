update
  attrs a
set
  is_required = true
where
  -- $files.path
  a.id = '96653230-13ff-ffff-2a34-f04cffffffff';

update
  attrs a
set
  checked_data_type = 'string'::checked_data_type
where
  -- $files.url
  a.id = '96653230-13ff-ffff-2a35-48afffffffff';
