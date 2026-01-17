COPY (SELECT * FROM triples WHERE app_id = :'app_id') TO STDOUT
