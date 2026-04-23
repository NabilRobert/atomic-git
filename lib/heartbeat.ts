import { execSync } from 'child_process';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { resolveDomain } from './domain-handlers.js';
import { getCommitMessage, AppEnv } from './ai-client.js';

const INTERVAL_MS     = 30 * 60 * 1000;          // 30 minutes adjust if needed
const LOG_FILE        = join(process.cwd(), 'logs', 'agent.log');
const MAX_LINE_LENGTH = 300;                       // diff line noise threshold
const MAX_DIFF_CHARS  = 12_000;                   // total diff size cap

/**
 * Starts the 30-minute observer loop.
 */
export function startHeartbeat(env: AppEnv): void {
  log('INFO', `Observer started. Watching: ${env.COMMIT_SCOPE}`);
  log('INFO', `Heartbeat interval: 30 minutes`);

  // Run once immediately, then on every interval
  runCycle(env);
  setInterval(() => runCycle(env), INTERVAL_MS);
}

/**
 * Runs a single commit cycle.
 */
async function runCycle(env: AppEnv): Promise<void> {
  const ts = new Date().toISOString();
  log('INFO', `─── Cycle start [${ts}] ───`);

  // ── Gatekeeper: zero-cost local check ─────────────────────────────────────
  let statusOutput: string;
  try {
    statusOutput = git('git status --porcelain', env.COMMIT_SCOPE);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', `git status failed: ${msg}`);
    return;
  }

  if (!statusOutput) {
    log('DORMANT', 'No changes detected. Sleeping until next cycle.');
    return;
  }

  // ── Parse changed files ────────────────────────────────────────────────────
  const files = parseStatus(statusOutput);
  log('INFO', `Found ${files.length} changed file(s): ${files.join(', ')}`);

  // ── Process each file atomically ───────────────────────────────────────────
  let committed = 0;
  let skipped   = 0;

  for (const file of files) {
    try {
      // 1. Stage the file
      git(`git add -- "${file}"`, env.COMMIT_SCOPE);

      // 2. Capture staged delta via RTK
      const rawDiff = git(`git diff --staged -- "${file}"`, env.COMMIT_SCOPE);

      if (!rawDiff) {
        // Binary or empty — commit with generic message
        const msg = `chore: add ${file}`;
        git(`git commit -m "${msg}"`, env.COMMIT_SCOPE);
        log('INFO', `[${file}] → "${msg}" (no diff content)`);
        committed++;
        continue;
      }

      // 3. Clean the diff
      const cleanedDiff = cleanDiff(rawDiff, MAX_LINE_LENGTH, MAX_DIFF_CHARS);

      // 4. Resolve domain context
      const { label, context } = resolveDomain(file);
      log('INFO', `[${file}] Domain: ${label}`);

      // 5. Generate commit message via SumoPod
      const message = await getCommitMessage(cleanedDiff, file, context, env);
      log('INFO', `[${file}] Message: "${message}"`);

      // 6. Commit — escape quotes to prevent shell injection
      const safeMsg = message.replace(/"/g, '\\"');
      git(`git commit -m "${safeMsg}"`, env.COMMIT_SCOPE);
      log('INFO', `[${file}] ✅ Committed.`);
      committed++;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log('ERROR', `[${file}] Failed: ${msg}`);
      // Safety: unstage the file to keep working directory clean
      try {
        git(`git restore --staged "${file}"`, env.COMMIT_SCOPE);
        log('INFO', `[${file}] Unstaged (restored).`);
      } catch {
        log('WARN', `[${file}] Could not restore staged state.`);
      }
      skipped++;
    }
  }

  log('INFO', `Cycle complete — committed: ${committed}, skipped: ${skipped}`);
}

/**
 * Runs a git command via the `rtk` token-compression prefix.
 */
function git(cmd: string, cwd: string): string {
  return execSync(`rtk ${cmd}`, { cwd, encoding: 'utf8' }).trim();
}

/**
 * Parses `git status --porcelain` output into a flat list of file paths.
 */
function parseStatus(raw: string): string[] {
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return parts[parts.length - 1] ?? null;
    })
    .filter((f): f is string => f !== null && f !== '');
}

/**
 * Cleans large lines and useless lock files from git diff.
 */
function cleanDiff(raw: string, maxLineLength: number, maxTotalChars: number): string {
  const NOISE_PATTERNS = [
    /package-lock\.json/,
    /yarn\.lock/,
    /pnpm-lock\.yaml/,
    /\.min\.js/,
    /\.min\.css/,
  ];

  const lines   = raw.split('\n');
  const cleaned: string[] = [];
  let skip      = false;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      skip = NOISE_PATTERNS.some((p) => p.test(line));
      if (!skip) cleaned.push(line);
      continue;
    }
    if (skip) continue;
    if (line.startsWith('Binary files')) continue;

    if (line.length > maxLineLength) {
      const prefix = line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : ' ';
      cleaned.push(`${prefix}[line stripped: ${line.length} chars]`);
      continue;
    }
    cleaned.push(line);
  }

  const result = cleaned.join('\n');
  if (result.length > maxTotalChars) {
    return result.slice(0, maxTotalChars) + `\n\n... [diff truncated at ${maxTotalChars} chars]`;
  }
  return result;
}

/**
 * Writes a structured log entry to stdout AND appends it to logs/agent.log.
 */
function log(level: 'INFO' | 'DORMANT' | 'WARN' | 'ERROR', message: string): void {
  const entry = `[${new Date().toISOString()}] [${level.padEnd(7)}] ${message}`;
  console.log(entry);
  try {
    appendFileSync(LOG_FILE, entry + '\n');
  } catch {
    // If log directory doesn't exist yet, fail silently
  }
}
