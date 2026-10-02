// atelier/core/voice/pass.ts — THE VOICE PASS: CONTENT FIRST, THEN HOW IT IS SAID, ONE PARAGRAPH AT A TIME.
//
// The draft that reaches this point already holds the standard: its rules were counted, its invented claims
// cut. What it may still lack is the part no rule states, how the author's sentences move. The pass takes
// each prose paragraph and asks for it again in the author's voice, shown a few pairs from the bank
// (./pairs.ts) whose plain side is closest in content: the same facts said plainly, then as the author said
// them. In-context only; nothing is trained.
//
// EVERY PARAGRAPH IS GATED ALONE (./integrity.ts). A rewrite that changes a fact, a claim's strength or its
// length, or lifts the author's words, is refused and the content paragraph is kept whole. The caller then
// reads the assembled text with the standard's full checks and keeps it only if nothing got worse.
//
// OPT-IN. Off unless a release sets `voice: 'incontext'` or a run passes `--voice incontext`, and never run
// out of register: pairs carry the whole voice of the register they were written in, and nothing here can
// restrict them to the traits the owner's policy carries.

import { createHash } from 'node:crypto';
import { paragraphsOf, wordsOf } from '../observers/text.js';
import type { overlapIndex } from '../observers/overlap.js';
import { spend, BudgetExceeded, CallBudgetExceeded, UnboundedRuntime, type Budget, type InferenceClient } from '../inference/client.js';
import { nearestPairs, type PairBank } from './pairs.js';
import { voiceIntegrity, type VoiceCheck } from './integrity.js';

/** Pairs shown per paragraph. */
export const PAIRS_SHOWN = 4;
/** A paragraph shorter than this has too little rhythm to rewrite and too much to lose. */
export const MIN_PARAGRAPH_WORDS = 25;
/** The most paragraphs one pass rewrites: the calls are reserved in the run's budget before anything is spent. */
export const MAX_PARAGRAPHS = 24;
export const VOICE_TEMPERATURE = 0.7;

export const VOICE_SYSTEM = 'Rewrite the paragraph in the author\'s voice. Keep every fact, figure, name, date, quotation and claim '
  + 'exactly. Add nothing and remove nothing. The examples show the same content said plainly and then as the author wrote it: '
  + 'learn how the author\'s sentences move from them, and never reuse their sentences or their subject matter. '
  + 'Return only the rewritten paragraph.';

const SCHEMA = { type: 'object', properties: { paragraph: { type: 'string' } }, required: ['paragraph'], additionalProperties: false };
const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 12);

export interface VoiceParagraph {
  /** which prose paragraph of the text, in order */
  readonly index: number;
  readonly contentHash: string;
  /** the rewrite's hash, when one came back */
  readonly voiceHash: string | null;
  readonly kept: boolean;
  /** the check that refused it, or why it was not tried */
  readonly check?: VoiceCheck | 'not-tried';
  readonly why: string;
}

export interface VoicePassResult { readonly text: string; readonly paragraphs: readonly VoiceParagraph[] }

/** The examples block: plain, then the author's, for each pair shown. */
export function renderPairs(bank: PairBank, ids: readonly number[]): string {
  return ids.map((i, n) => `EXAMPLE ${n + 1}\nPlain:\n${bank.pairs[i].neutral}\n\nAs the author wrote it:\n${bank.pairs[i].author}`).join('\n\n');
}

/**
 * Rewrite each prose paragraph of `text` in the author's voice and keep the rewrites that pass the gate.
 * Paragraphs are replaced from the end backwards, so earlier offsets hold. A call that fails, or a budget
 * that runs out, leaves the remaining paragraphs as they were and says so.
 */
export async function voicePass(client: InferenceClient, budget: Budget, text: string, bank: PairBank,
  copied: ReturnType<typeof overlapIndex> | null): Promise<VoicePassResult> {
  const paragraphs = paragraphsOf(text);
  const records: VoiceParagraph[] = [];
  const replacements: { start: number; end: number; text: string }[] = [];
  let stopped: string | null = null;
  for (const [index, p] of paragraphs.entries()) {
    const contentHash = sha(p.text);
    const skip = (why: string): void => { records.push({ index, contentHash, voiceHash: null, kept: false, check: 'not-tried', why }); };
    if (wordsOf(p.text).length < MIN_PARAGRAPH_WORDS) { skip('too short to rewrite'); continue; }
    if (replacements.length + records.filter((r) => r.check !== 'not-tried' && !r.kept).length >= MAX_PARAGRAPHS) { skip(`past the ${MAX_PARAGRAPHS} paragraphs one pass rewrites`); continue; }
    if (stopped) { skip(stopped); continue; }
    const shown = nearestPairs(bank, p.text, PAIRS_SHOWN);
    if (!shown.length) { skip('no pair in the bank is near this paragraph'); continue; }
    let voice: string;
    try {
      voice = await spend(budget, 0.02, async () => {
        const x = await client.complete({ stableBlock: VOICE_SYSTEM, variableBlock: renderPairs(bank, shown),
          userMessage: `Rewrite this paragraph in the author's voice:\n\n${p.text}`,
          toolName: 'emit_paragraph', toolDescription: 'Return the rewritten paragraph.', schema: SCHEMA,
          maxTokens: Math.max(400, Math.ceil(wordsOf(p.text).length * 3)), temperature: VOICE_TEMPERATURE });
        const out = (x.json as { paragraph?: unknown }).paragraph;
        return { value: typeof out === 'string' ? out.trim() : '', cost: x.cost };
      });
    } catch (e) {
      const why = `the voice pass could not run (${(e as Error).message.split('\n')[0]})`;
      if (e instanceof BudgetExceeded || e instanceof CallBudgetExceeded || e instanceof UnboundedRuntime) stopped = 'the run\'s budget was reached before this paragraph';
      skip(stopped ?? why);
      continue;
    }
    // One paragraph in, one paragraph out: a rewrite that came back as several is held to the same checks as one.
    const flat = voice.replace(/\s*\n+\s*/g, ' ').trim();
    const verdict = voiceIntegrity(p.text, flat, copied);
    records.push(verdict.ok ? { index, contentHash, voiceHash: sha(flat), kept: true, why: 'kept: facts, strength, length and copying all held' }
      : { index, contentHash, voiceHash: sha(flat), kept: false, ...(verdict.check ? { check: verdict.check } : {}), why: `refused (${verdict.check}): ${verdict.detail ?? ''}` });
    if (verdict.ok) replacements.push({ start: p.start, end: p.end, text: flat });
  }
  let out = text;
  for (const r of [...replacements].sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + r.text + out.slice(r.end);
  return { text: out, paragraphs: records };
}
