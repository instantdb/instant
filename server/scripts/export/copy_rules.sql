COPY (SELECT * FROM rules WHERE app_id = :'app_id') TO STDOUT
