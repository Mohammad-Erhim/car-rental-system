// Side-effect import: load .env into process.env before any module reads config.
// Usage: `import './config/bootstrap-env';` as the first import of an entrypoint.
import { loadDotEnv } from './load-dotenv';

loadDotEnv();
