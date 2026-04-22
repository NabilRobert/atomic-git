/**
 * AI Module — OpenRouter Integration
 *
 * Sends a cleaned diff to the OpenRouter chat completions API and
 * returns a single, validated Conventional Commit message string.
 */

import type { AppEnv } from './env.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `You are an expert software engineer writing Git commit messages.
Your ONLY output must be a single commit message in Conventional Commits format.

Rules:
- Format: <type>(<scope>): <short description>
- Types: feat, fix, refactor, style, docs, test, chore, perf, ci, build
- The scope (in parentheses) is OPTIONAL — only include it if the diff clearly targets a specific module, component, or domain.
- The short description must be in lowercase, imperative mood (e.g. "add", "fix", "update"), max 72 characters.
- Do NOT include a body, footer, bullet points, markdown, quotes, or any explanation.
- Output ONLY the commit message string. Nothing else.

Examples of valid output:
feat(auth): add jwt refresh token rotation
fix: handle null pointer in user profile loader
refactor(api): extract validation logic into middleware
chore: update dependencies to latest versions`;

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
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
 * Calls OpenRouter and returns a Conventional Commit message for the given diff.
 * Throws on API errors or empty/malformed responses.
 */
export async function generateCommitMessage(
  cleanedDiff: string,
  filePath: string,
  env: AppEnv
): Promise<string> {
  const userPrompt = `Generate a Conventional Commit message for the following staged diff.
The file being committed is: ${filePath}

\`\`\`diff
${cleanedDiff}
\`\`\``;

  const body = {
    model: env.OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ] satisfies OpenRouterMessage[],
    max_tokens: 100,
    temperature: 0.2, // Low temp = deterministic, consistent commit style
  };

  let response: Response;

  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://github.com/NabilRobert/atomic-git',
        'X-Title': 'Atomic Commit Machine',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Network error calling OpenRouter: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '(no response body)');
    throw new Error(
      `OpenRouter API error ${response.status} ${response.statusText}: ${errorText}`
    );
  }

  const data = await response.json() as OpenRouterResponse;

  // Handle API-level errors returned in the response body (OpenRouter pattern)
  if (data.error) {
    throw new Error(`OpenRouter returned an error: ${data.error.message}`);
  }

  const firstChoice = data.choices?.[0];
  const raw = firstChoice?.message?.content?.trim();

  if (!raw) {
    throw new Error('OpenRouter returned an empty commit message.');
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
