\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'detective_platform_collector'
  ) THEN
    CREATE ROLE detective_platform_collector LOGIN;
  END IF;
END
$$;

ALTER ROLE detective_platform_collector
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM detective_platform_collector;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM detective_platform_collector;

GRANT USAGE ON SCHEMA public TO detective_platform_collector;
GRANT SELECT ON TABLE offices, office_sources
  TO detective_platform_collector;
GRANT SELECT, INSERT, UPDATE ON TABLE collection_runs
  TO detective_platform_collector;
GRANT SELECT, INSERT ON TABLE collected_records
  TO detective_platform_collector;
GRANT INSERT ON TABLE review_items
  TO detective_platform_collector;

SELECT format(
  'GRANT CONNECT ON DATABASE %I TO detective_platform_collector',
  current_database()
)
\gexec
