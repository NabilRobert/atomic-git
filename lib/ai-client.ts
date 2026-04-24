import OpenAI from 'openai';

export interface AppEnv {
  SUMOPOD_API_KEY: string;
  SUMOPOD_BASE_URL: string;
  COMMIT_SCOPE: string;
  SUMOPOD_MODEL?: string;
}

const openai = new OpenAI({
  apiKey: process.env.SUMOPOD_API_KEY,
  baseURL: process.env.SUMOPOD_BASE_URL // Ensure this is 'https://ai.sumopod.com/v1' in .env
});

/**
 * Calls SumoPod via the OpenAI SDK and returns a Conventional Commit message for the given diff.
 */
export async function getCommitMessage(
  cleanedDiff: string,
  filePath: string,
  domainContext: string,
  env: AppEnv
): Promise<string> {
  const systemPrompt = `You are a Lead Dev. Analyze the git diff. Focus EXCLUSIVELY on updates to what's already there. Update, don't rebuild. Domain: ${domainContext}

Format: <type>(<scope>): <short description>
Types: feat, fix, refactor, style, docs, test, chore, perf, ci, build
- Scope is optional; only add it when the diff targets a clear module/domain.
- Description: lowercase, imperative mood, max 72 characters.
- Output ONLY the commit message string — no body, no footer, no markdown, no quotes.`;

  const userPrompt = `File: ${filePath}\n\n\`\`\`diff\n${cleanedDiff}\n\`\`\``;

  try {
    const response = await openai.chat.completions.create({

      model: env.SUMOPOD_MODEL || process.env.SUMOPOD_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 150,
      temperature: 0.1 // Keep it low for consistent conventional commits
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('SumoPod returned an empty response.');

    return sanitize(raw);
  } catch (error) {
    console.error("AI Completion Error:", error);
    throw error;
  }
}

function sanitize(raw: string): string {
  const cleaned = raw
    .replace(/^```[\w]*\n?/m, '')   // strip opening fence
    .replace(/```$/m, '')            // strip closing fence
    .replace(/^["'`]|["'`]$/g, ''); // strip surrounding quotes
  return (cleaned.split('\n')[0] ?? cleaned).trim();
}
