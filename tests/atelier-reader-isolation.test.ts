// tests/atelier-reader-isolation.test.ts — A JUDGING READER IS SHOWN THE REQUEST, THE MATERIAL AND THE TEXT, AND NOTHING ELSE.
//
// A reader that judges a draft must not be told what the writer was steered by: the plan made before the draft, the answers
// the person gave to questions, a change they typed in the conversation, or what a reader said of the same text before.
// Shown any of these, a verdict reads the steer back instead of the text. Each judging reader is driven here with the
// inputs its caller gives it (invoke.ts: the request as asked, the bound material, the delivered text; checks.ts: the
// skill's rules beside the material), twice on the same text, by a stub that records every request and answers each time
// with a prior verdict carrying a marker. No marker may reach any request a reader sends.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTaste, applicabilityFor } from '../core/taste/reader.js';
import { modelSensor, type QualifiedReader, READER_VERSION } from '../core/loop/claim-extract.js';
import { MOVE_READER } from '../core/taste/move-reader.js';
import { readContext } from '../core/inference/reading.js';
import { modelJudge } from '../core/loop/context-judge.js';
import type { PiecePlan } from '../core/loop/piece-plan.js';
import type { MoveUnit } from '../core/compiler/moves.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import { anInferenceResult, aRequirement } from './fixtures.js';
import { correctionFor } from '../cli/commands/invoke.js';

const M = { plan: 'QX-PLAN-7f3a', answer: 'QX-ANSWER-91bd', turn: 'QX-TURN-c402', verdict: 'QX-VERDICT-5e88' } as const;
const MARKERS = Object.values(M);

/** One run, as the writer saw it: the request and material, and around them the steers no reader may see. */
const RUN = {
  request: 'Write a short piece on keeping a vegetable garden alive through a dry summer.',
  material: [{ name: 'notes', text: 'Mulch holds water in the soil. Water at dawn, not at noon. Tomatoes need deep watering twice a week.' }],
  plan: { angle: `Water less, but deeper (${M.plan}).`, pain: 'Plants wilt by noon.', turn: 'Shallow watering trains shallow roots.', answer: 'Mulch and water at dawn.',
    points: [{ point: `Mulch keeps the water in ${M.plan}`, from: 'Mulch holds water in the soil.' }], image: null, close: 'A garden that drinks once drinks deep.', leftOut: [], use: 'choose' } satisfies PiecePlan,
  answers: [{ ask: 'Who reads it?', answer: `Allotment beginners ${M.answer}` }],
  turn: `Make it warmer, less of a list ${M.turn}`,
};
const TEXT = 'Mulch holds water in the soil. Water at dawn, not at noon.\n\nA garden that drinks once drinks deep.';
// What the writer was given: every steer is in it. A reader handed this instead of the request would leak all four.
const WRITER_TASK = `${RUN.request}\n\nPLAN ${JSON.stringify(RUN.plan)}\n\nANSWERS ${JSON.stringify(RUN.answers)}${correctionFor(RUN.turn)}`;
// What the callers give the readers.
const ASKED = RUN.request;
const MATERIAL = RUN.material.map((m) => m.text).join('\n\n');
const RULES = 'I name the season before the advice.';

/** Records every request; answers each tool with a reading whose words carry the prior-verdict marker. */
function recorder(): InferenceClient & { seen: InferenceRequest[] } {
  const seen: InferenceRequest[] = [];
  const answers: Record<string, unknown> = {
    emit_applicability: { answers: [{ n: 1, applies: 'YES' }] },
    emit_readings: { readings: [1, 2, 3].map((n) => ({ n, verdict: 'MISSED', kind: 'OMISSION', quote: null, why: `read before: ${M.verdict}` })) },
    emit_specifics: { specifics: [{ sentence: 1, text: 'Mulch', kind: 'NAMED_FACT', attributed: false, source: 'NONE', support: M.verdict }] },
    emit_move_readings: { readings: [{ n: 1, outcome: 'MISSING', quote: null, why: M.verdict }] },
    emit_intent: { format: null, length: null, document: null, deliver: [], unknowns: [], act_on: null, irreversible: null },
    emit_reading: { claims: [1], situations: [2], parts: [{ words: 'keeping a vegetable garden', covered: true, where: M.verdict }] },
    emit_claims: { claims: [1], situations: [] },
    emit_coverage: { parts: [{ words: 'keeping a vegetable garden', covered: false, where: M.verdict }] },
    emit_verdicts: { verdicts: [{ pair: 1, standsAlone: false }] },
  };
  return { seen, complete: async (req) => { seen.push(req); return anInferenceResult({ json: answers[req.toolName] ?? {} }); } };
}

const v = { standardVersionHash: 's', requirements: [
  aRequirement({ requirementId: 'p1', statement: 'I name the season before the advice.' }),
  aRequirement({ requirementId: 'p2', statement: 'I end on a short line that turns the advice around.' }),
  aRequirement({ requirementId: 'p3', statement: 'I give one number a reader can act on.', appliesWhen: 'the piece gives practical advice' }),
] } as unknown as StandardVersion;
const move = { id: 'm1', aspect: 'season first', observed: 'opens on the weather', trigger: { text: 'a piece of seasonal advice', status: 'SEEN' },
  realisation: 'the first line names the weather', forbidden: null, evidence: [{ quote: 'August, and the beds are dust.' }] } as unknown as MoveUnit;
const budget = () => ({ spentUsd: 0, capUsd: 5 });
const qualified: readonly QualifiedReader[] = [{ model: 'stub', version: READER_VERSION }];

const READERS: { name: string; drive: (c: InferenceClient) => Promise<unknown> }[] = [
  { name: 'taste reader (readTaste)', drive: async (c) => {
    // the plan's enforced steps order the reading by id; the plan's words never go with them
    const decided = await applicabilityFor(c, budget(), v, ASKED);
    for (let i = 0; i < 2; i++) await readTaste(c, budget(), v, TEXT, ASKED, decided, { first: new Set(['p2']) });
    await readTaste(c, budget(), v, TEXT, ASKED);
  } },
  { name: 'claim reader (modelSensor)', drive: async (c) => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'iso-claims-'));
    for (let i = 0; i < 2; i++) {
      // a fresh sensor each time: the second is a later run reading the same text, its cache on disk the only memory
      const s = modelSensor(c, budget(), 'stub', { material: MATERIAL, task: ASKED, rules: RULES, placeholders: false, qualifiedReaders: qualified, reads: 2, ...(i ? {} : { cacheDir }) });
      await s.read(TEXT); await s.read(`${TEXT}\n\nTomatoes need deep watering twice a week.`);
    }
  } },
  { name: 'move reader (MOVE_READER)', drive: async (c) => {
    for (let i = 0; i < 2; i++) await readContext(MOVE_READER, { text: TEXT, request: ASKED, moves: [move] }, c, 'stub', budget());
  } },
  { name: 'context judge (modelJudge)', drive: async (c) => {
    const sentences = TEXT.split(/(?<=\.)\s+/);
    for (let i = 0; i < 2; i++) {
      const j = modelJudge(c, budget());
      await j.requestIntent(ASKED);
      await j.readAnswer(sentences);
      await j.readAnswer(sentences, { request: ASKED, material: MATERIAL, reply: { task: ASKED, output: TEXT } });
      await j.covers?.(ASKED, `${TEXT} More.`);
      await j.standsAlone([{ removed: sentences[0], next: sentences[1] }]);
    }
  } },
];

describe('a judging reader sees the request, the material and the text; never the plan, the answers, a turn or a prior verdict', () => {
  it('the writer\'s task carries every steer (the markers are real)', () => {
    for (const m of [M.plan, M.answer, M.turn]) expect(WRITER_TASK).toContain(m);
  });
  it.each(READERS)('$name', async ({ drive }) => {
    const c = recorder();
    await drive(c);
    expect(c.seen.length).toBeGreaterThan(1);
    for (const req of c.seen) {
      for (const field of [req.userMessage, req.stableBlock, req.variableBlock]) for (const m of MARKERS) expect(field, `${req.toolName} carries ${m}`).not.toContain(m);
    }
    // what a reader needs does reach it: the text it judges, and the request
    expect(c.seen.some((r) => `${r.userMessage}${r.variableBlock}`.includes('Water at dawn'))).toBe(true);
    expect(c.seen.some((r) => `${r.userMessage}${r.variableBlock}`.includes('vegetable garden'))).toBe(true);
  });
});
