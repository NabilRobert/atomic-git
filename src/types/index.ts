/**
 * src/types/index.ts
 *
 * Centralised TypeScript interfaces and types for the Atomic Commit Machine.
 * All modules import from here — no scattered interface declarations.
 */

// ─── Environment ──────────────────────────────────────────────────────────────

export interface AppEnv {
  SUMOPOD_API_KEY  : string;
  SUMOPOD_BASE_URL : string;
  COMMIT_SCOPE     : string;
  SUMOPOD_MODEL?   : string;
}

// ─── Agent State (persisted to logs/agent-state.json) ─────────────────────────

export interface AgentState {
  directory : string;
  startedAt : string;
}

// ─── Domain Handlers ──────────────────────────────────────────────────────────

export interface DomainHandler {
  extensions : string[];
  label      : string;
  context    : string;
}

export interface DomainContext {
  label   : string;
  context : string;
}

// ─── PM2 Process Info (used by CLI --status) ──────────────────────────────────

export interface PM2ProcessInfo {
  name   : string;
  status : string;       // 'online' | 'stopped' | 'errored' | …
  pid    : number | null;
  uptime : number;       // ms since PM2 recorded pm_uptime
  memory : number;       // bytes
}

// ─── CommitAgent (core observer contract) ────────────────────────────────────

export interface CommitAgent {
  /** Begin the heartbeat loop. Runs once immediately, then every 30 minutes. */
  start(): void;
}

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    message: string,
    /** If true, the process should exit after this error. */
    public readonly fatal: boolean = false,
    public readonly code: string   = 'APP_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}
