/**
 * AI Module — SumoPod Integration
 *
 * Sends a cleaned diff to the SumoPod chat completions endpoint and
 * returns a single, validated Conventional Commit message string.
 *
 * Philosophy: "Update, don't rebuild" — the system prompt instructs the
 * model to describe ONLY what changed, never the whole file's purpose.
 */

import type { AppEnv } from './env.js';

/** Enforces the "Update, don't rebuild" philosophy. */
const SYSTEM_PROMPT = `You are an expert dev. Analyze the provided diff. Focus ONLY on what was added, changed, or removed in this specific update. Do NOT describe the existing parts of the file that were not touched. Generate a Conventional Commit message based on this incremental update.

Additional formatting rules:
- Format: <type>(<scope>): <short description>
- Types: feat, fix, refactor, style, docs, test, chore, perf, ci, build
- The scope is OPTIONAL — only include it when the diff clearly targets a specific module or domain.
- Short description must be lowercase, imperative mood, max 72 characters.
- Output ONLY the commit message string. No body, no footer, no markdown, no quotes, no explanation.

Examples:
feat(auth): add jwt refresh token rotation
fix: handle null pointer in user profile loader
refactor(api): extract validation logic into middleware
chore: update dependencies to latest versions`;

interface SumoPodMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface SumoPodResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
    code?: number;
  };
}

/**
 * Calls SumoPod and returns a Conventional Commit message for the given diff.
 * Throws on API errors or empty/malformed responses.
 */
export async function generateCommitMessage(
  cleanedDiff: string,
  filePath: string,
  env: AppEnv
): Promise<string> {
  // Resolve the completions endpoint relative to the configured base URL.
  // Strip trailing slash to avoid double-slash in the URL.
  const baseUrl = env.SUMOPOD_BASE_URL.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;

  const userPrompt = `Generate a Conventional Commit message for the following staged diff.
The file being committed is: ${filePath}

\`\`\`diff
${cleanedDiff}
\`\`\``;

  const body = {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ] satisfies SumoPodMessage[],
    max_tokens: 100,
    temperature: 0.2, // Low temp = deterministic, consistent commit style
  };

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.SUMOPOD_API_KEY,
        'X-Title': 'Atomic Commit Machine',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Network error calling SumoPod: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(no response body)');
    throw new Error(
      `SumoPod API error ${response.status} ${response.statusText}: ${errorText}`
    );
  }

  const data = await response.json() as SumoPodResponse;

  // Handle API-level errors returned in the response body
  if (data.error) {
    throw new Error(`SumoPod returned an error: ${data.error.message}`);
  }

  const firstChoice = data.choices?.[0];
  const raw = firstChoice?.message?.content?.trim();

  if (!raw) {
    throw new Error('SumoPod returned an empty commit message.');
  }

  return sanitizeMessage(raw);
}

/**
 * Strips any markdown fencing, quotes, or extra whitespace the model may
 * have added despite the system prompt instructions.
 */
function sanitizeMessage(raw: string): string {
  const cleaned = raw
    .replace(/^```[\w]*\n?/m, '') // strip opening code fence
    .replace(/```$/m, '')          // strip closing code fence
    .replace(/^["'`]|["'`]$/g, ''); // strip surrounding quotes/backticks

  // .at(0) instead of [0] to satisfy noUncheckedIndexedAccess
  return (cleaned.split('\n').at(0) ?? cleaned).trim();
}
