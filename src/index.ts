/**
 * Atomic Commit Machine — Entry Point
 *
 * Reads modified/untracked files from the target Git repo and
 * commits each one individually with an AI-generated Conventional
 * Commit message via SumoPod (RTK token-compressed git commands).
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { validateEnv } from './env.js';
import { cleanDiff } from './diff.js';
import { generateCommitMessage } from './ai.js';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const env = validateEnv(); // exits process if invalid

const git = (cmd: string): string => {
  // All git commands are prefixed with `rtk` for token compression.
  return execSync(`rtk ${cmd}`, { cwd: env.COMMIT_SCOPE, encoding: 'utf8' }).trim();
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses `git status --porcelain` output into a flat list of relative file paths.
 * Handles renamed files (format: `R old -> new`) by using the new path.
 */
function getStagedFiles(): string[] {
  const raw = git('git status --porcelain');
  if (!raw) return [];

  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      // Porcelain format: XY <space> filename
      // Rename format:    R  old -> new
      const parts = line.trim().split(/\s+/);
      // For renames "R old -> new", take the last token
      return parts[parts.length - 1] ?? null;
    })
    .filter((f): f is string => f !== null && f !== '');
}

function unstageFile(file: string): void {
  try {
    execSync(`git restore --staged "${file}"`, {
      cwd: env.COMMIT_SCOPE,
      stdio: 'pipe',
    });
  } catch {
    // Best-effort — don't crash on unstage failure
  }
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log('\n🤖 Atomic Commit Machine starting...');
  console.log(`📂 Repo: ${env.COMMIT_SCOPE}`);
  console.log(`🔌 Provider: SumoPod (${env.SUMOPOD_BASE_URL})\n`);

  const files = getStagedFiles();

  if (files.length === 0) {
    console.log('✅ Nothing to commit. Working tree is clean.');
    process.exit(0);
  }

  console.log(`📋 Found ${files.length} modified/untracked file(s):\n`);
  files.forEach((f) => console.log(`   • ${f}`));
  console.log();

  let committed = 0;
  let skipped = 0;

  for (const file of files) {
    console.log(`\n─────────────────────────────────────────`);
    console.log(`📄 Processing: ${file}`);

    try {
      // 1. Stage the file — quote to handle spaces & special characters
      git(`git add -- "${file}"`);
      console.log(`   ✔ Staged`);

      // 2. Extract the staged diff via rtk git diff --staged
      const rawDiff = git(`git diff --staged -- "${file}"`);

      if (!rawDiff) {
        console.log(`   ⚠ No diff content (possibly a binary or empty file). Committing with generic message.`);
        const msg = `chore: add ${file}`;
        git(`git commit -m "${msg}"`);
        console.log(`   ✅ Committed: "${msg}"`);
        committed++;
        continue;
      }

      // 3. Clean the diff (strip long lines, truncate)
      const cleanedDiff = cleanDiff(rawDiff, {
        maxLineLength: env.DIFF_LINE_MAX_LENGTH,
        maxTotalChars: env.DIFF_MAX_CHARS,
      });
      console.log(
        `   ✔ Diff cleaned (${rawDiff.length} → ${cleanedDiff.length} chars)`
      );

      // 4. Call AI to generate commit message
      console.log(`   ⏳ Generating commit message...`);
      const message = await generateCommitMessage(cleanedDiff, file, env);
      console.log(`   ✔ Message: "${message}"`);

      // 5. Commit — escape double-quotes to prevent shell injection
      const safeMessage = message.replace(/"/g, '\\"');
      git(`git commit -m "${safeMessage}"`);
      console.log(`   ✅ Committed successfully.`);
      committed++;

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ Failed: ${message}`);
      console.error(`   ↩ Unstaging ${file} and continuing...`);
      unstageFile(file);
      skipped++;
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n═════════════════════════════════════════`);
  console.log(`🏁 Done. Committed: ${committed} | Skipped: ${skipped}`);
  console.log(`═════════════════════════════════════════\n`);

  if (skipped > 0) {
    process.exit(1); // Signal partial failure to calling scripts/CI
  }
}

run().catch((err) => {
  console.error('\n💥 Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
