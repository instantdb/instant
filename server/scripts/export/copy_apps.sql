COPY (SELECT id, title, created_at FROM apps WHERE id = :'app_id') TO STDOUT
