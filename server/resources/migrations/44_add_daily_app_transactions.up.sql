CREATE TABLE daily_app_transactions (
   date date,
   app_id uuid,
   active_date timestamp without time zone,
   is_active boolean,
   count bigint,
   UNIQUE (date, app_id, is_active)
);
