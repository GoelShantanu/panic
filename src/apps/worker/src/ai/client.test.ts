import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AnthropicAiClient, buildClassifyRequest, sentencesFromBlocks } from './client.ts';

// A stand-in for the SDK client that records requests; no network.
function stubAnthropic(response: Record<string, unknown>) {
  const calls: { body: any; opts: any }[] = [];
  const client = { messages: { create: async (body: unknown, opts: unknown) => (calls.push({ body, opts }), response) } } as unknown as Anthropic;
  return { client, calls };
}
const usage = { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

describe('request builder (ai-layer.md §7: only public content)', () => {
  it('keeps only item and registry fields', () => {
    const item = { kind: 'article', headline: 'Asterion wins order', filingCategory: null, userEmail: 'x@example.invalid', watchlist: ['INE00AST1018'] } as any;
    const req = buildClassifyRequest(item, [{ isin: 'INE00AST1018', name: 'Asterion Industries Limited', votes: 3 } as any]);
    expect(Object.keys(req).sort()).toEqual(['candidates', 'filingCategory', 'headline', 'kind']);
    expect(Object.keys(req.candidates[0]!).sort()).toEqual(['isin', 'name']);
  });
});

describe('AnthropicAiClient', () => {
  it('classify: structured output, timeout, parsed JSON', async () => {
    const { client, calls } = stubAnthropic({ model: 'claude-haiku-4-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: '{"event_types":["order_contract"],"instruments":[]}' }] });
    const out = await new AnthropicAiClient('claude-haiku-4-5', client).classify({ kind: 'article', headline: 'Asterion wins order', filingCategory: null, candidates: [] }, 10_000);
    expect(out).toMatchObject({ kind: 'ok', value: { event_types: ['order_contract'], instruments: [] }, usage: { inputTokens: 900, outputTokens: 40 } });
    expect(calls[0]!.body).toMatchObject({ model: 'claude-haiku-4-5', output_config: { format: { type: 'json_schema' } } });
    expect(calls[0]!.opts).toEqual({ timeout: 10_000 });
  });

  it('refusal and truncation are not outputs', async () => {
    for (const [stop, kind] of [['refusal', 'refused'], ['max_tokens', 'truncated']] as const) {
      const { client } = stubAnthropic({ model: 'claude-haiku-4-5', stop_reason: stop, usage, content: [] });
      expect((await new AnthropicAiClient('claude-haiku-4-5', client).classify({ kind: 'article', headline: 'h', filingCategory: null, candidates: [] }, 1)).kind).toBe(kind);
    }
  });

  it('summarise: plain-text document with citations; sentences keep their cited spans', async () => {
    const { client, calls } = stubAnthropic({
      model: 'claude-haiku-4-5',
      stop_reason: 'end_turn',
      usage,
      content: [
        { type: 'text', text: 'Revenue was ₹1,250.50 crore', citations: [{ type: 'char_location', cited_text: 'Revenue from operations was ₹1,250.50 crore' }] },
        { type: 'text', text: ' for the quarter. ', citations: [{ type: 'char_location', cited_text: 'quarter ended September 30, 2026' }] },
        { type: 'text', text: 'A dividend of ₹4 was recommended.', citations: [{ type: 'char_location', cited_text: 'recommended a dividend of ₹4 per share' }] },
      ],
    });
    const out = await new AnthropicAiClient('claude-haiku-4-5', client).summarise({ documentText: 'text', documentTitle: 'Results' }, 60_000);
    expect(calls[0]!.body.messages[0].content[0]).toEqual({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'text' }, title: 'Results', citations: { enabled: true } });
    expect(calls[0]!.body.output_config).toBeUndefined(); // citations and structured outputs cannot be combined
    expect(out.kind === 'ok' && out.value).toEqual([
      { text: 'Revenue was ₹1,250.50 crore for the quarter.', citedText: ['Revenue from operations was ₹1,250.50 crore', 'quarter ended September 30, 2026'] },
      { text: 'A dividend of ₹4 was recommended.', citedText: ['recommended a dividend of ₹4 per share'] },
    ]);
  });

  it('sentence assembly splits multi-sentence blocks and keeps decimals whole', () => {
    expect(sentencesFromBlocks([{ text: 'Revenue was 1,250.50 crore. Profit was 80 crore.', citations: [{ cited_text: 'c1' }] }])).toEqual([
      { text: 'Revenue was 1,250.50 crore.', citedText: ['c1'] },
      { text: 'Profit was 80 crore.', citedText: ['c1'] },
    ]);
  });
});
