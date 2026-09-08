import { defineConfig } from 'drizzle-kit';

const url =
  process.env.DATABASE_URL ??
  'postgresql://carrental:carrental_dev_pw@127.0.0.1:5432/carrental_dev';

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
