/**
 * Environment Validation Module
 *
 * Reads and validates all required/optional env variables.
 * Exits the process immediately with a clear error if any required
 * variable is missing or invalid.
 */

export interface AppEnv {
  SUMOPOD_API_KEY: string;
  SUMOPOD_BASE_URL: string;
  COMMIT_SCOPE: string;
  DIFF_LINE_MAX_LENGTH: number;
  DIFF_MAX_CHARS: number;
}

export function validateEnv(): AppEnv {
  const errors: string[] = [];

  const SUMOPOD_API_KEY = process.env.SUMOPOD_API_KEY;
  if (!SUMOPOD_API_KEY || SUMOPOD_API_KEY.trim() === '') {
    errors.push('SUMOPOD_API_KEY is missing or empty.');
  }

  const SUMOPOD_BASE_URL = process.env.SUMOPOD_BASE_URL;
  if (!SUMOPOD_BASE_URL || SUMOPOD_BASE_URL.trim() === '') {
    errors.push('SUMOPOD_BASE_URL is missing or empty. Set it to your SumoPod API base URL.');
  }

  const COMMIT_SCOPE = process.env.COMMIT_SCOPE;
  if (!COMMIT_SCOPE || COMMIT_SCOPE.trim() === '') {
    errors.push('COMMIT_SCOPE is missing or empty. Set it to the absolute path of your target Git repo.');
  }

  if (errors.length > 0) {
    console.error('\n🚨 Fatal: Missing required environment variables:\n');
    errors.forEach((e) => console.error(`   ✗ ${e}`));
    console.error('\n   → Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }

  // Optional diff-tuning variables with sensible defaults
  const DIFF_LINE_MAX_LENGTH = parsePositiveInt(
    process.env.DIFF_LINE_MAX_LENGTH,
    300,
    'DIFF_LINE_MAX_LENGTH'
  );

  const DIFF_MAX_CHARS = parsePositiveInt(
    process.env.DIFF_MAX_CHARS,
    12000,
    'DIFF_MAX_CHARS'
  );

  return {
    SUMOPOD_API_KEY: SUMOPOD_API_KEY!,
    SUMOPOD_BASE_URL: SUMOPOD_BASE_URL!,
    COMMIT_SCOPE: COMMIT_SCOPE!,
    DIFF_LINE_MAX_LENGTH,
    DIFF_MAX_CHARS,
  };
}

function parsePositiveInt(
  raw: string | undefined,
  defaultValue: number,
  name: string
): number {
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`⚠ ${name} is not a valid positive integer ("${raw}"). Using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}
