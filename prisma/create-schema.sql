-- CardSync tables live in the "cardsync" schema so existing public tables (e.g. drivers, vehicles) are untouched.
-- Run once:
--   psql -U postgres -d RAP_Ride -f prisma/create-schema.sql

CREATE SCHEMA IF NOT EXISTS cardsync;

GRANT ALL ON SCHEMA cardsync TO postgres;
GRANT ALL ON SCHEMA cardsync TO PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA cardsync GRANT ALL ON TABLES TO postgres;
