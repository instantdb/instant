DO $$
BEGIN
  IF EXISTS (
      SELECT 1
      FROM instant_users
      WHERE email = 'testuser@instantdb.com'
  ) THEN
    RAISE NOTICE 'Test data already loaded. Skipping migration.';
  ELSE
    RAISE NOTICE 'Importing test data from CSV files in dev-resources';
    
    COPY instant_users (id, email, created_at, google_sub)
      FROM '../../dev-resources/users.csv'
      WITH (FORMAT csv, HEADER true);

    COPY apps
      FROM '../../dev-resources/apps.csv'
      WITH (FORMAT csv, HEADER true);

    COPY attrs
      FROM '../../dev-resources/attrs.csv'
      WITH (FORMAT csv, HEADER true);

    COPY idents
      FROM '../../dev-resources/idents.csv'
      WITH (FORMAT csv, HEADER true);

    COPY triples
      FROM '../../dev-resources/triples.csv'
      WITH (FORMAT csv, HEADER true);

    COPY transactions
      FROM '../../dev-resources/transactions.csv'
      WITH (FORMAT csv, HEADER true);
  END IF;
END $$;

