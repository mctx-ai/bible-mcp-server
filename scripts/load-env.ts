/**
 * load-env.ts
 *
 * Loads KEY=VALUE pairs from the .env file at the project root into process.env.
 * Existing env vars are NOT overwritten — shell-exported variables always win.
 *
 * Import this module as the very first import in any script that needs Cloudflare
 * credentials, so that process.env is populated before other modules read it at
 * module scope (e.g. src/lib/cloudflare.ts).
 *
 * Usage (must be the first import):
 *   import './load-env.js';
 *   import { d1 } from '../src/lib/cloudflare.js';
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

try {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    // Only set if not already defined — shell-exported vars take precedence
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // .env file is optional — silently continue if it does not exist
}
