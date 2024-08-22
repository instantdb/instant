\set user_ids '{a46d7279-6cd7-4315-a2de-4a5fabf94a86,f487bef2-59f7-4176-9ad2-9f05c0c5db26}'
\set app_ids '{92cb730c-8b4f-46ef-9925-4fab953694c6,9a70439e-33c0-4b34-91f5-efac20b58301}'
\set pwd `pwd | tr -d '\n'`
\set users_path :pwd/users.csv
\set apps_path :pwd/apps.csv
\set attrs_path :pwd/attrs.csv
\set idents_path :pwd/idents.csv
\set triples_path :pwd/triples.csv
\set transactions_path :pwd/transactions.csv

copy (select * from instant_users where id = any(:'user_ids')) to :'users_path' with csv header;

copy (select * from apps where id = any(:'app_ids')) to :'apps_path' with csv header;

copy (select * from attrs where app_id = any(:'app_ids')) to :'attrs_path' with csv header;

copy (select * from idents where app_id = any(:'app_ids')) to :'idents_path' with csv header;

copy (select * from triples where app_id = any(:'app_ids')) to :'triples_path' with csv header;

copy (select * from transactions where app_id = any(:'app_ids')) to :'transactions_path' with csv header;
