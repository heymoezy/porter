import { createRequire } from 'node:module';

// Single source of truth for Porter's version: backend/package.json.
// (Was hardcoded + duplicated in index.ts and routes/v1/health.ts — drift bug.)
const require = createRequire(import.meta.url);
export const PORTER_VERSION: string = (require('../package.json') as { version: string }).version;
