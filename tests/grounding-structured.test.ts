// A STRUCTURE IS NEVER REWRITTEN. The brand-safety assessments of the v6 study: the writer's JSON carried every key the
// examples carry, the carry-over signal read `video_id` and `safety_score` as facts of an example's case (a described video
// never says them), and the grounding step's rewrite dropped the keys. Two guards, both code: a key of the examples is the
// form (core/loop/carry-over.ts, `formTerms`), and a unit that is structure is listed, never spliced (here).
import { describe, it, expect } from 'vitest';
import { groundCarried, structuredUnit } from '../core/loop/grounding.js';
import { anInferenceResult } from './fixtures.js';
import type { InferenceRequest } from '../core/inference/client.js';

const EXAMPLE = '{\n  "video_id": "vid_0012",\n  "verdict": "fail",\n  "safety_score": 23,\n  "reasoning": "At 00:12 a fight breaks out near the Kremlin-Annex."\n}';
const REQUEST = 'Assess this video under the policy. A cooking show: the host chops onions and plates a dish. Duration 3:02.';
const budget = () => ({ spentUsd: 0, capUsd: 1 });

describe('structuredUnit', () => {
  it('a JSON object, a YAML record and a table row are structure; prose is not', () => {
    expect(structuredUnit('{\n"a": 1,\n"b": "x"\n}')).toBe(true);
    expect(structuredUnit('video_id: vid_1\nsafety_score: 9')).toBe(true);
    expect(structuredUnit('| a | b |')).toBe(true);
    expect(structuredUnit('The host chops onions. Nothing in it is unsafe.')).toBe(false);
    expect(structuredUnit('Note: the host chops onions, then plates the dish, then thanks the crew and the sponsor.')).toBe(false);
    expect(structuredUnit('video_id: vid_1')).toBe(false);
  });
});

describe('grounding on a structured draft', () => {
  it('leaves a JSON assessment byte for byte as written: the keys are the form, and nothing is spliced into a structure', async () => {
    let called = 0;
    const client = { complete: async (_r: InferenceRequest) => { called += 1; return anInferenceResult({ json: { rewrites: [{ id: 1, text: 'The verdict is pass.' }] } }); } };
    const draft = '{\n  "video_id": "vid_0107",\n  "verdict": "pass",\n  "safety_score": 92,\n  "reasoning": "The host cooks."\n}';
    const g = await groundCarried(draft, { client, budget: budget(), request: REQUEST, evidence: '', examples: EXAMPLE });
    expect(g.text).toBe(draft);
    expect(g.found).toEqual([]);
    expect(called).toBe(0);
  });
  it('a value copied from the example inside a structure is listed as borrowed, never rewritten', async () => {
    let called = 0;
    const client = { complete: async () => { called += 1; return anInferenceResult({ json: { rewrites: [{ id: 1, text: 'The verdict is pass.' }] } }); } };
    const draft = '{\n  "video_id": "vid_0107",\n  "verdict": "pass",\n  "reasoning": "A fight near the Kremlin-Annex."\n}';
    const g = await groundCarried(draft, { client, budget: budget(), request: REQUEST, evidence: '', examples: EXAMPLE });
    expect(g.text).toBe(draft);
    expect(called).toBe(0);
  });
  it('the same borrowed fact in prose is still rewritten where it stands', async () => {
    const client = { complete: async () => anInferenceResult({ json: { rewrites: [{ id: 1, text: 'The host cooks, and nothing in it is unsafe.' }] } }) };
    const draft = 'The host cooks near the Kremlin-Annex, and nothing in it is unsafe.';
    const g = await groundCarried(draft, { client, budget: budget(), request: REQUEST, evidence: '', examples: EXAMPLE });
    expect(g.text).toBe('The host cooks, and nothing in it is unsafe.');
    expect(g.found.map((f) => f.kept)).toEqual([true]);
  });
});
