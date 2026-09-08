-- Runs once, on first initialisation of the postgres data volume.
-- POSTGRES_DB already created the primary database; add the test database so `pnpm test:*`
-- can run against the same container.
SELECT 'CREATE DATABASE carrental_test OWNER carrental'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'carrental_test')\gexec
