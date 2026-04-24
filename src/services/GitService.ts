/**
 * src/services/GitService.ts
 *
 * All RTK/Git shell operations in one place.
 * The Observer receives an instance via dependency injection and never
 * calls execSync directly.
 */

import { execSync } from 'child_process';

const MAX_LINE_LENGTH = 300;    // diff line noise threshold
const MAX_DIFF_CHARS  = 12_000; // total diff size cap

export class GitService {
  /**
   * Runs `rtk git status --porcelain` in the given directory.
   * Returns the raw output (empty string = nothing changed).
   * Throws if git itself errors.
   */
  getStatus(cwd: string): string {
    return this.rtk('git status --porcelain', cwd);
  }

  /**
   * Stages a single file atomically.
   */
  stageFile(file: string, cwd: string): void {
    this.rtk(`git add -- "${file}"`, cwd);
  }

  /**
   * Returns the staged diff for a single file.
   * Returns empty string for binary or empty files.
   */
  getStagedDiff(file: string, cwd: string): string {
    return this.rtk(`git diff --staged -- "${file}"`, cwd);
  }

  /**
   * Commits with the given message.
   */
  commit(message: string, cwd: string): void {
    const safeMsg = message.replace(/"/g, '\\"');
    this.rtk(`git commit -m "${safeMsg}"`, cwd);
  }

  /**
   * Unstages a file to keep the working directory clean after an error.
   */
  unstageFile(file: string, cwd: string): void {
    this.rtk(`git restore --staged "${file}"`, cwd);
  }

  /**
   * Parses `git status --porcelain` output into a flat list of file paths.
   */
  parseStatus(raw: string): string[] {
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
   * Strips noisy lines (minified files, lock files, binary markers) and
   * truncates at the configured character cap.
   */
  cleanDiff(raw: string): string {
    const NOISE_PATTERNS = [
      /package-lock\.json/,
      /yarn\.lock/,
      /pnpm-lock\.yaml/,
      /\.min\.js/,
      /\.min\.css/,
    ];

    const lines   = raw.split('\n');
    const cleaned: string[] = [];
    let skip = false;

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        skip = NOISE_PATTERNS.some((p) => p.test(line));
        if (!skip) cleaned.push(line);
        continue;
      }
      if (skip) continue;
      if (line.startsWith('Binary files')) continue;

      if (line.length > MAX_LINE_LENGTH) {
        const prefix = line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : ' ';
        cleaned.push(`${prefix}[line stripped: ${line.length} chars]`);
        continue;
      }
      cleaned.push(line);
    }

    const result = cleaned.join('\n');
    if (result.length > MAX_DIFF_CHARS) {
      return result.slice(0, MAX_DIFF_CHARS) +
        `\n\n... [diff truncated at ${MAX_DIFF_CHARS} chars]`;
    }
    return result;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  /**
   * Runs a git command via the `rtk` token-compression prefix.
   */
  private rtk(cmd: string, cwd: string): string {
    return execSync(`rtk ${cmd}`, { cwd, encoding: 'utf8' }).trim();
  }
}
