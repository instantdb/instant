COPY (SELECT * FROM idents WHERE app_id = :'app_id') TO STDOUT
