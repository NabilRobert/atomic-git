/**
 * main.ts
 *
 * Entry Point — Domain-Aware Observer Agent
 *
 * Loads environment, validates required variables, and starts the heartbeat.
 * This is the only file you need to run: `npx ts-node main.ts`
 */

import 'dotenv/config';
import { startHeartbeat } from './lib/heartbeat.js';
import { AppEnv } from './lib/ai-client.js';

// ─── Environment validation ───────────────────────────────────────────────────

const REQUIRED = ['SUMOPOD_API_KEY', 'SUMOPOD_BASE_URL', 'COMMIT_SCOPE'];
const missing  = REQUIRED.filter((k) => !process.env[k]?.trim());

if (missing.length > 0) {
  console.error('\n🚨 Missing required environment variables:\n');
  missing.forEach((k) => console.error(`   ✗ ${k}`));
  console.error('\n   → Copy .env.example to .env and fill in the values.\n');
  process.exit(1);
}

const env: AppEnv = {
  SUMOPOD_API_KEY:  process.env.SUMOPOD_API_KEY!,
  SUMOPOD_BASE_URL: process.env.SUMOPOD_BASE_URL!,
  COMMIT_SCOPE:     process.env.COMMIT_SCOPE!,
};

// ─── Banner ───────────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════════════════╗
║      🤖  Atomic Commit Machine  — Observer       ║
║         Domain-Aware · RTK-Compressed · Safe     ║
╚══════════════════════════════════════════════════╝
  Repo   : ${env.COMMIT_SCOPE}
  AI     : ${env.SUMOPOD_BASE_URL}
  Cycle  : every 30 minutes
`);

// ─── Start ────────────────────────────────────────────────────────────────────

startHeartbeat(env);
