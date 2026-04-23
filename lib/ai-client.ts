/**
 * lib/ai-client.ts
 *
 * SumoPod AI client — "Update, don't rebuild" philosophy.
 * Every call receives a domain-specific context layer from domain-handlers.ts
 * that focuses the model on the file type's conventions.
 */

export interface AppEnv {
  SUMOPOD_API_KEY: string;
  SUMOPOD_BASE_URL: string;
  COMMIT_SCOPE: string;
}

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

const BASE_SYSTEM_PROMPT = `You are an expert dev acting as the last line of defense for code quality.
Analyze the provided git diff. Focus EXCLUSIVELY on the incremental updates — lines added, modified, or removed.
Do NOT describe or summarize unchanged parts of the file.
Generate a single Conventional Commit message for this specific delta only.

Format: <type>(<scope>): <short description>
Types: feat, fix, refactor, style, docs, test, chore, perf, ci, build
- Scope is optional; only add it when the diff targets a clear module/domain.
- Description: lowercase, imperative mood, max 72 characters.
- Output ONLY the commit message string — no body, no footer, no markdown, no quotes.`;

/**
 * Calls SumoPod and returns a Conventional Commit message for the given diff.
 *
 * @param cleanedDiff   - The pre-processed git diff string.
 * @param filePath      - Relative path of the staged file.
 * @param domainContext - Extra instructions from domain-handlers.ts.
 * @param env           - Environment configuration variables.
 * @returns A single commit message string.
 */
export async function generateCommitMessage(
  cleanedDiff: string,
  filePath: string,
  domainContext: string,
  env: AppEnv
): Promise<string> {
  const baseUrl = env.SUMOPOD_BASE_URL.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/chat/completions`;

  const systemPrompt = domainContext
    ? `${BASE_SYSTEM_PROMPT}\n\n${domainContext}`
    : BASE_SYSTEM_PROMPT;

  const userPrompt =
    `File: ${filePath}\n\n` +
    `\`\`\`diff\n${cleanedDiff}\n\`\`\``;

  const body = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ] satisfies SumoPodMessage[],
    max_tokens: 120,
    temperature: 0.2,
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error calling SumoPod: ${msg}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    throw new Error(`SumoPod ${response.status} ${response.statusText}: ${text}`);
  }

  const data = await response.json() as SumoPodResponse;

  if (data.error) {
    throw new Error(`SumoPod API error: ${data.error.message}`);
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('SumoPod returned an empty response.');

  return sanitize(raw);
}

function sanitize(raw: string): string {
  const cleaned = raw
    .replace(/^```[\w]*\n?/m, '')   // strip opening fence
    .replace(/```$/m, '')            // strip closing fence
    .replace(/^["'`]|["'`]$/g, ''); // strip surrounding quotes
  return (cleaned.split('\n')[0] ?? cleaned).trim();
}
