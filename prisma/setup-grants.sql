-- Run after setup.sql (connects to cardsync_local):
--   psql -U postgres -d cardsync_local -f prisma/setup-grants.sql

GRANT ALL ON SCHEMA public TO cardsync;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO cardsync;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO cardsync;
