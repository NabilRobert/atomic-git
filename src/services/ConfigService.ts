/**
 * src/services/ConfigService.ts
 *
 * Centralised management for .env loading and agent-state.json persistence.
 * Single source of truth for all file-system config concerns.
 */

import { config as loadDotenv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { AppEnv, AgentState, AppError } from '../types/index.js';

// Resolve the project root regardless of where this file is imported from.
// src/services/ConfigService.ts → up two levels → project root
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

const ENV_FILE    = join(PROJECT_ROOT, '.env');
const LOGS_DIR    = join(PROJECT_ROOT, 'logs');
const STATE_FILE  = join(LOGS_DIR, 'agent-state.json');
const LOG_FILE    = join(LOGS_DIR, 'agent.log');

const REQUIRED_KEYS: (keyof AppEnv)[] = [
  'SUMOPOD_API_KEY',
  'SUMOPOD_BASE_URL',
  'COMMIT_SCOPE',
];

export class ConfigService {
  /**
   * Loads the .env file and validates required keys.
   * Throws a fatal AppError if any required key is missing.
   */
  loadEnv(): AppEnv {
    loadDotenv({ path: ENV_FILE });

    const missing = REQUIRED_KEYS.filter((k) => !process.env[k]?.trim());
    if (missing.length > 0) {
      throw new AppError(
        `Missing required environment variables: ${missing.join(', ')}\n` +
        `  → Copy .env.example to .env and fill in the values.`,
        true,
        'MISSING_ENV',
      );
    }

    return {
      SUMOPOD_API_KEY  : process.env['SUMOPOD_API_KEY']!,
      SUMOPOD_BASE_URL : process.env['SUMOPOD_BASE_URL']!,
      COMMIT_SCOPE     : process.env['COMMIT_SCOPE']!,
      SUMOPOD_MODEL    : process.env['SUMOPOD_MODEL'],
    };
  }

  /**
   * Reads the persisted agent-state.json.
   * Returns null if the file doesn't exist or is malformed.
   */
  readState(): AgentState | null {
    if (!existsSync(STATE_FILE)) return null;
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as AgentState;
    } catch {
      return null;
    }
  }

  /**
   * Persists the agent state to logs/agent-state.json.
   */
  writeState(directory: string): void {
    mkdirSync(LOGS_DIR, { recursive: true });
    const state: AgentState = {
      directory,
      startedAt: new Date().toISOString(),
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  }

  /** Absolute path to the agent log file. */
  getLogPath(): string {
    return LOG_FILE;
  }

  /** Absolute path to the project root. */
  getProjectRoot(): string {
    return PROJECT_ROOT;
  }
}
