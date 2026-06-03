-- Create a dedicated CardSync database (run once as postgres superuser)
--   psql -U postgres -f prisma/create-database.sql

SELECT format('CREATE DATABASE %I OWNER postgres', 'cardsync_local')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cardsync_local')
\gexec

GRANT ALL PRIVILEGES ON DATABASE cardsync_local TO postgres;
