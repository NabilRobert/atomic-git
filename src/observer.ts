/**
 * src/observer.ts
 *
 * The core 30-minute heartbeat loop. Receives GitService and AIService via
 * dependency injection — making the logic independently testable.
 *
 * Critical invariants preserved:
 *  1. Zero-cost local gatekeeper: rtk git status --porcelain runs before any AI call.
 *  2. "Update, don't rebuild": AI is only called with a cleaned, bounded diff.
 *  3. The heartbeat never exits the process on a per-cycle error.
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join }                          from 'path';
import { AppEnv, CommitAgent }       from './types/index.js';
import { GitService }                from './services/GitService.js';
import { AIService }                 from './services/AIService.js';
import { resolveDomain }             from './services/DomainService.js';

const INTERVAL_MS = 1 * 60 * 1000; // 30 minutes

export class Observer implements CommitAgent {
  constructor(
    private readonly git : GitService,
    private readonly ai  : AIService,
    private readonly env : AppEnv,
    private readonly logFile: string,
  ) {}

  /**
   * Starts the observer. Runs one cycle immediately, then every 30 minutes.
   * The setInterval callback is wrapped in a top-level try-catch so a single
   * cycle failure never kills the daemon.
   */
  start(): void {
    this.log('INFO', `Observer started. Watching: ${this.env.COMMIT_SCOPE}`);
    this.log('INFO', `Heartbeat interval: 30 minutes`);

    // Run immediately, then on every interval
    this.runCycle().catch((err: unknown) => {
      this.log('ERROR', `Unhandled cycle error: ${String(err)}`);
    });

    setInterval(() => {
      this.runCycle().catch((err: unknown) => {
        this.log('ERROR', `Unhandled cycle error: ${String(err)}`);
      });
    }, INTERVAL_MS);
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async runCycle(): Promise<void> {
    const ts = new Date().toISOString();
    this.log('INFO', `─── Cycle start [${ts}] ───`);

    // ── Gatekeeper: zero-cost local check ──────────────────────────────────────
    let statusOutput: string;
    try {
      statusOutput = this.git.getStatus(this.env.COMMIT_SCOPE);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log('ERROR', `git status failed: ${msg}`);
      return;
    }

    if (!statusOutput) {
      this.log('DORMANT', 'No changes detected. Sleeping until next cycle.');
      return;
    }

    // ── Parse changed files ─────────────────────────────────────────────────────
    const files = this.git.parseStatus(statusOutput);
    this.log('INFO', `Found ${files.length} changed file(s): ${files.join(', ')}`);

    // ── Process each file atomically ────────────────────────────────────────────
    let committed = 0;
    let skipped   = 0;
    let lastMessage = '';
    let aiFailed = false;

    for (const file of files) {
      let staged = false; // guard: only restore if staging succeeded

      try {
        // 0. Pre-flight: verify file still exists on disk
        //    git status can report stale/deleted entries; staging them throws.
        const fullPath = join(this.env.COMMIT_SCOPE, file);
        if (!existsSync(fullPath)) {
          this.log('INFO', `[${file}] File removed before staging, skipping.`);
          skipped++;
          continue;
        }

        // 1. Stage the file
        this.git.stageFile(file, this.env.COMMIT_SCOPE);
        staged = true;

        // 2. Capture staged delta via RTK
        const rawDiff = this.git.getStagedDiff(file, this.env.COMMIT_SCOPE);

        if (!rawDiff) {
          // Binary or empty — commit with generic message
          const msg = `chore: add ${file}`;
          this.git.commit(msg, this.env.COMMIT_SCOPE);
          this.log('INFO', `[${file}] → "${msg}" (no diff content)`);
          lastMessage = msg;
          committed++;
          continue;
        }

        // 3. Clean the diff
        const cleanedDiff = this.git.cleanDiff(rawDiff);

        // 4. Resolve domain context
        const domain = resolveDomain(file);
        this.log('INFO', `[${file}] Domain: ${domain.label}`);

        // 5. Generate commit message via SumoPod (Update, don't rebuild)
        const message = await this.ai.getCommitMessage(cleanedDiff, file, domain);
        if (!message) {
          aiFailed = true;
          throw new Error('AI returned an empty string or malformed message.');
        }

        this.log('INFO', `[${file}] Message: "${message}"`);

        // 6. Commit
        this.git.commit(message, this.env.COMMIT_SCOPE);
        this.log('INFO', `[${file}] ✅ Committed.`);
        lastMessage = message;
        committed++;

      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log('ERROR', `[${file}] Failed: ${msg}`);

        // Safety: only attempt restore if the file was actually staged
        if (staged) {
          try {
            this.git.unstageFile(file, this.env.COMMIT_SCOPE);
            this.log('INFO', `[${file}] Unstaged (restored).`);
          } catch {
            this.log('WARN', `[${file}] Could not restore staged state.`);
          }
        }
        skipped++;
      }
    }

    let cycleLog = `Cycle complete — committed: ${committed}, skipped: ${skipped}`;
    if (committed > 0 || aiFailed) {
      if (aiFailed) {
        cycleLog += ` | Message: [Unable to retrieve message]`;
      } else {
        cycleLog += ` | Message: "${lastMessage}"`;
      }
    }

    this.log(aiFailed ? 'WARN' : 'INFO', cycleLog);
  }

  /**
   * Writes a structured log entry to stdout AND appends it to logs/agent.log.
   * Format: [ISO-timestamp] [LEVEL  ] message
   */
  private log(level: 'INFO' | 'DORMANT' | 'WARN' | 'ERROR', message: string): void {
    const entry = `[${new Date().toISOString()}] [${level.padEnd(7)}] ${message}`;
    console.log(entry);
    try {
      mkdirSync(dirname(this.logFile), { recursive: true });
      appendFileSync(this.logFile, entry + '\n');
    } catch {
      // Fail silently — never crash the observer due to a log write error
    }
  }
}
