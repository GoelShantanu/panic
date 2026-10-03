// The AI client boundary (ai-layer.md §2–§3, §6). Jobs depend on the AiClient interface, so tests
// and the evaluation harness can substitute a fake; AnthropicAiClient is the production one.

import Anthropic from '@anthropic-ai/sdk';
import { CLASSIFY_SCHEMA } from '@stockpanic/core';
import type { SummarySentence, Usage } from '@stockpanic/core';
import { CLASSIFY_SYSTEM, SUMMARISE_SYSTEM } from './prompts.ts';

// Only public content may reach the API (ai-layer.md §7): exchange filing fields, public headlines
// and registry names. These request shapes are the whole surface; no user field exists in them.
export interface ClassifyRequest {
  kind: 'article' | 'filing';
  headline: string;
  filingCategory: string | null;
  candidates: { isin: string; name: string }[];
}

export interface SummariseRequest {
  documentText: string;
  documentTitle: string;
}

export type AiOutcome<T> =
  | { kind: 'ok'; value: T; usage: Usage; modelId: string; latencyMs: number }
  | { kind: 'refused' | 'truncated'; usage: Usage; modelId: string; latencyMs: number };

export interface AiClient {
  classify(req: ClassifyRequest, timeoutMs: number): Promise<AiOutcome<unknown>>;
  summarise(req: SummariseRequest, timeoutMs: number): Promise<AiOutcome<SummarySentence[]>>;
}

export function buildClassifyRequest(item: { kind: 'article' | 'filing'; headline: string; filingCategory: string | null }, candidates: { isin: string; name: string }[]): ClassifyRequest {
  return { kind: item.kind, headline: item.headline, filingCategory: item.filingCategory, candidates: candidates.map((c) => ({ isin: c.isin, name: c.name })) };
}

const usageOf = (u: Anthropic.Usage): Usage => ({
  inputTokens: u.input_tokens,
  outputTokens: u.output_tokens,
  cacheReadTokens: u.cache_read_input_tokens ?? 0,
  cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
});

// Text blocks become sentences; each sentence keeps the cited spans of the blocks it came from.
export function sentencesFromBlocks(blocks: readonly { text: string; citations: readonly { cited_text: string }[] | null }[]): SummarySentence[] {
  const out: SummarySentence[] = [];
  let text = '';
  let cited: string[] = [];
  const close = () => {
    if (text.trim()) out.push({ text: text.trim().replace(/\s+/g, ' '), citedText: [...new Set(cited)] });
    text = '';
    cited = [];
  };
  for (const b of blocks) {
    const cites = (b.citations ?? []).map((c) => c.cited_text);
    // Split after a terminator followed by whitespace, so decimals such as 1,250.50 stay whole.
    for (const piece of b.text.split(/(?<=[.!?])(?=\s)/)) {
      text += piece;
      if (piece.trim()) cited.push(...cites);
      if (/[.!?]\s*$/.test(piece)) close();
    }
  }
  close();
  return out;
}

export class AnthropicAiClient implements AiClient {
  readonly #client: Anthropic;
  readonly #model: string;

  // Credentials resolve as the SDK does: ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant` profile.
  constructor(model: string, client: Anthropic = new Anthropic({ maxRetries: 2 })) {
    this.#client = client;
    this.#model = model;
  }

  async classify(req: ClassifyRequest, timeoutMs: number): Promise<AiOutcome<unknown>> {
    const started = Date.now();
    const candidates = req.candidates.length ? req.candidates.map((c) => `${c.isin} ${c.name}`).join('\n') : '(none)';
    const item = [`Kind: ${req.kind}`, `Headline: ${req.headline}`, ...(req.filingCategory ? [`Exchange category: ${req.filingCategory}`] : []), `Candidate instruments:\n${candidates}`].join('\n');
    const res = await this.#client.messages.create(
      {
        model: this.#model,
        max_tokens: 512,
        system: CLASSIFY_SYSTEM,
        messages: [{ role: 'user', content: item }],
        output_config: { format: { type: 'json_schema', schema: CLASSIFY_SCHEMA as unknown as Record<string, unknown> } },
      },
      { timeout: timeoutMs },
    );
    const base = { usage: usageOf(res.usage), modelId: res.model, latencyMs: Date.now() - started };
    if (res.stop_reason === 'refusal') return { kind: 'refused', ...base };
    if (res.stop_reason === 'max_tokens') return { kind: 'truncated', ...base };
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let value: unknown = null;
    try {
      value = JSON.parse(text);
    } catch {
      value = { unparseable: text.slice(0, 500) };
    }
    return { kind: 'ok', value, ...base };
  }

  async summarise(req: SummariseRequest, timeoutMs: number): Promise<AiOutcome<SummarySentence[]>> {
    const started = Date.now();
    const res = await this.#client.messages.create(
      {
        model: this.#model,
        max_tokens: 1024,
        system: SUMMARISE_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'text', media_type: 'text/plain', data: req.documentText }, title: req.documentTitle, citations: { enabled: true } },
              { type: 'text', text: 'Summarise this filing.' },
            ],
          },
        ],
      },
      { timeout: timeoutMs },
    );
    const base = { usage: usageOf(res.usage), modelId: res.model, latencyMs: Date.now() - started };
    if (res.stop_reason === 'refusal') return { kind: 'refused', ...base };
    if (res.stop_reason === 'max_tokens') return { kind: 'truncated', ...base };
    const blocks = res.content.flatMap((b) => (b.type === 'text' ? [{ text: b.text, citations: b.citations }] : []));
    return { kind: 'ok', value: sentencesFromBlocks(blocks), ...base };
  }
}
