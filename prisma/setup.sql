-- CardSync AI — one-time PostgreSQL setup
-- Run as the postgres superuser:
--   psql -U postgres -f prisma/setup.sql
--
-- Creates user "cardsync", database "cardsync_local", and grants.
-- Safe to re-run (skips objects that already exist).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cardsync') THEN
    CREATE ROLE cardsync LOGIN PASSWORD 'cardsync';
    RAISE NOTICE 'Created user cardsync';
  ELSE
    RAISE NOTICE 'User cardsync already exists — skipped';
  END IF;
END
$$;

SELECT format('CREATE DATABASE %I OWNER cardsync', 'cardsync_local')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cardsync_local')
\gexec

GRANT ALL PRIVILEGES ON DATABASE cardsync_local TO cardsync;
