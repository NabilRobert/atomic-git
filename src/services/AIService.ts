/**
 * src/services/AIService.ts
 *
 * All SumoPod / LLM interaction and prompt management.
 * Wraps the OpenAI SDK client and keeps every AI concern isolated.
 */

import OpenAI from 'openai';
import { AppEnv, DomainContext } from '../types/index.js';

export class AIService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly env: AppEnv) {
    this.client = new OpenAI({
      apiKey  : env.SUMOPOD_API_KEY,
      baseURL : env.SUMOPOD_BASE_URL,
    });
    this.model = env.SUMOPOD_MODEL ?? process.env['SUMOPOD_MODEL'] ?? 'gpt-4o-mini';
  }

  /**
   * Generates a Conventional Commit message for the given diff.
   *
   * "Update, don't rebuild" — the system prompt focuses the model exclusively
   * on what changed, preventing hallucinated rebuilds.
   */
  async getCommitMessage(
    cleanedDiff : string,
    filePath    : string,
    domain      : DomainContext,
  ): Promise<string> {
    const systemPrompt =
      `You are a Lead Dev. Analyze the git diff. Focus EXCLUSIVELY on updates ` +
      `to what's already there. Update, don't rebuild. ${domain.context}\n\n` +
      `Format: <type>(<scope>): <short description>\n` +
      `Types: feat, fix, refactor, style, docs, test, chore, perf, ci, build\n` +
      `- Scope is optional; only add it when the diff targets a clear module/domain.\n` +
      `- Description: lowercase, imperative mood, max 72 characters.\n` +
      `- Output ONLY the commit message string — no body, no footer, no markdown, no quotes.`;

    const userPrompt = `File: ${filePath}\n\n\`\`\`diff\n${cleanedDiff}\n\`\`\``;

    const response = await this.client.chat.completions.create({
      model       : this.model,
      messages    : [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens  : 150,
      temperature : 0.1,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error('SumoPod returned an empty response.');

    return this.sanitize(raw);
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private sanitize(raw: string): string {
    const cleaned = raw
      .replace(/^```[\w]*\n?/m, '')   // strip opening fence
      .replace(/```$/m, '')            // strip closing fence
      .replace(/^["'`]|["'`]$/g, ''); // strip surrounding quotes
    return (cleaned.split('\n')[0] ?? cleaned).trim();
  }
}
