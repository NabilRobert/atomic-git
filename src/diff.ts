/**
 * Diff Cleaning Module
 *
 * Strips noise from raw git diffs before they are sent to the AI:
 *   - Lines exceeding maxLineLength (minified code, SVG paths, base64 blobs)
 *   - Lock file hunks (package-lock.json, yarn.lock, pnpm-lock.yaml)
 *   - Binary file notices
 * Truncates the result to maxTotalChars to stay within token limits.
 */

export interface CleanDiffOptions {
  /** Strip lines longer than this many characters. Default: 300 */
  maxLineLength: number;
  /** Truncate total output to this many characters. Default: 12000 */
  maxTotalChars: number;
}

/** Patterns that identify noise-only diff hunks to discard entirely. */
const NOISE_FILE_PATTERNS: RegExp[] = [
  /package-lock\.json/,
  /yarn\.lock/,
  /pnpm-lock\.yaml/,
  /\.min\.js/,
  /\.min\.css/,
];

export function cleanDiff(raw: string, options: CleanDiffOptions): string {
  const { maxLineLength, maxTotalChars } = options;

  const lines = raw.split('\n');
  const cleaned: string[] = [];
  let skipHunk = false;

  for (const line of lines) {
    // Detect start of a new file diff section
    if (line.startsWith('diff --git')) {
      skipHunk = NOISE_FILE_PATTERNS.some((pattern) => pattern.test(line));
      if (!skipHunk) cleaned.push(line);
      continue;
    }

    if (skipHunk) continue;

    // Skip binary file markers — not useful for AI
    if (line.startsWith('Binary files')) continue;

    // Strip lines that are too long (minified code, SVG data, base64)
    if (line.length > maxLineLength) {
      cleaned.push(
        `${line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : ' '}[line stripped: ${line.length} chars]`
      );
      continue;
    }

    cleaned.push(line);
  }

  const result = cleaned.join('\n');

  // Truncate if still over budget
  if (result.length > maxTotalChars) {
    const truncated = result.slice(0, maxTotalChars);
    return truncated + `\n\n... [diff truncated at ${maxTotalChars} chars]`;
  }

  return result;
}
