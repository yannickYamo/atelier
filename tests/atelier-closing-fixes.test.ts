// THE FIXES THE THREE-CONTEXT STUDY ASKED FOR, each against the failure it was seen in:
//   the length trim cut the clause every contract carried → the cutter never removes a sentence with the house's wording;
//   7 of 10 good contracts were BLOCKED as "lifted" → a run two of twelve pieces share is the house's;
//   "src/audit/log.js:90" was called invented and a Must fix finding cut to "Await it." → a line of the bound diff traces to it;
//   a code review named "[person: who owns the shipping policy]" as a Must fix → with material bound, the writer is told to leave no slot;
//   the length line hedged ("not how long an answer must be") beside a required cap → under a cap, the span is the target.
import { describe, it, expect } from 'vitest';
import { applyCuts, taskWithMaterial } from '../cli/commands/invoke.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as store from '../core/state/store.js';
import { standardWordingOf, overlapIndex, STANDARD_WORDING_FROM_TWO_AT } from '../core/observers/overlap.js';
import { decideSpecifics } from '../core/loop/claim-extract.js';
import { renderAgentSkill, WRITE_LIKE_THESE } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';
import type { Voice } from '../core/compiler/voice.js';

const HOUSE = 'Confidential Information includes, without limitation, technical, commercial and financial information of either party.';
const DRAFT = `## Confidential Information\n\nThe term means any information disclosed in connection with the Purpose. ${HOUSE} Oral disclosures count when confirmed in writing within a reasonable time. The parties may agree otherwise in writing from time to time.\n`;
const clause = (i: number): string => `This agreement is made between Party ${i} and Party ${i + 1}. ${HOUSE} Each party keeps the other's information in confidence and uses it for the purpose alone. Clause ${i} differs in its own words and in its own numbers ${i * 7}.`;

describe('the cutter leaves the house\'s wording alone', () => {
  it('a sentence carrying a protected six-word run is never removed, and the cut falls on what else was named', () => {
    const picks = [HOUSE, 'Oral disclosures count when confirmed in writing within a reasonable time.'];
    const free = applyCuts(DRAFT, picks, 10);
    expect(free.applied).toContain(HOUSE);
    const kept = applyCuts(DRAFT, picks, 10, undefined, standardWordingOf([clause(1), clause(2), clause(3), clause(4)]));
    expect(kept.applied).not.toContain(HOUSE);
    expect(kept.text).toContain('includes, without limitation');
    expect(kept.applied).toContain('Oral disclosures count when confirmed in writing within a reasonable time.');
  });
});

describe('what two pieces of a large corpus share is the house\'s wording', () => {
  it('from four pieces on, a run two of them share counts; below, three are still needed', () => {
    const shared = 'the parties agree to keep this strictly confidential at all times';
    const two = [`Alpha. ${shared}. Beta.`, `Gamma. ${shared}. Delta.`];
    const others = ['Only its own words, nothing shared with the rest of the corpus at all here.', 'Another piece, again with no run in common with the others anywhere.'];
    expect(STANDARD_WORDING_FROM_TWO_AT).toBe(4);
    expect(standardWordingOf([...two, others[0]])).toEqual([]);
    const grams = standardWordingOf([...two, ...others]);
    expect(grams.length).toBeGreaterThan(0);
    expect(grams.every((g) => shared.includes(g))).toBe(true);
    // and such a run read in an output is not a lifted passage
    expect(overlapIndex([...two, ...others], grams)(`A new piece. ${shared}. More.`).longestShared).toBe(0);
  });
});

describe('a line of the bound diff traces to the diff', () => {
  const diff = 'diff --git a/src/audit/log.js b/src/audit/log.js\n--- a/src/audit/log.js\n+++ b/src/audit/log.js\n@@ -80,6 +84,12 @@ class AuditLog {\n+  write(entry) {\n+    fs.appendFile(this.path, line);\n+  }\n';
  const sp = (text: string, sentence: number) => ({ sentence, text, kind: 'FIGURE' as const, source: 'NONE' as const, support: '' });
  it('a path:line inside the hunks is supported whatever the reader said; one past them, or a path the diff lacks, is not', () => {
    const text = '- **src/audit/log.js:90** — The promise is neither awaited nor returned.\n- **src/audit/log.js:400** — Also wrong.\n- **src/other.js:12** — Elsewhere.\n';
    const r = decideSpecifics(text, [sp('src/audit/log.js:90', 1), sp('src/audit/log.js:400', 2), sp('src/other.js:12', 3)], diff, 'Review this change.', false, 'test');
    expect(r.claims.map((c) => c.text.trim())).toEqual(['**src/audit/log.js:400** — Also wrong.', '**src/other.js:12** — Elsewhere.']);
  });
});

describe('under a required cap, the author\'s span is the target', () => {
  const req = (over: Partial<Requirement>): Requirement => ({ requirementId: 'x1', statement: 'Between 220 and 420 words.', appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED', provenance: 'EXPERT_STATED',
    evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: 'REQUIRED', realizationTolerance: null, outputShape: null, ...over });
  const std = (rs: Requirement[]): StandardVersion => ({ standardVersionHash: 's', evidenceId: 'e', workType: 'contract', requirements: rs, authorityState: 'RATIFIED', mintedAt: '2026-10-18T00:00:00Z' } as unknown as StandardVersion);
  const voice: Voice = { passages: [], lengthWords: [400, 400], lengthSpan: [405, 419], pieces: ['A piece of some length here, with words.', 'Another piece of some length, with its words.'] };
  it('says the span and the cap, and drops the hedge; without a cap the line is as it was; the frame is the one positive one', () => {
    const withCap = std([req({ measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } } })]);
    const capped = renderAgentSkill(withCap, compileArchitecture(withCap), 'c', 'd', null, [], voice).files['SKILL.md'];
    expect(capped).toContain('My pieces of this kind run about 405 to 419 words, and my method allows at most 420. A draft lands a few percent longer than it was aimed, so aim for 378 to 399 words and never pass 420.');
    expect(capped).not.toContain('one that needs more gets more');
    expect(capped).toContain(WRITE_LIKE_THESE.split('\n')[0]);
    expect(capped).not.toMatch(/Never take my topics|never reuse its topic/);
    const noCap = std([req({})]);
    const open = renderAgentSkill(noCap, compileArchitecture(noCap), 'c', 'd', null, [], voice).files['SKILL.md'];
    expect(open).toContain('one that needs more gets more');
  });
});

describe('with material bound, the writer is told to leave no slot', () => {
  it('the task carries the material and the no-slot line; asked for slots, the line is absent; with no material, nothing is added', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-slots-')), skillName: 'review' };
    store.initStore(L);
    expect(taskWithMaterial(L, 'Review this change.', false, false).task).toBe('Review this change.');
    store.addMaterial(L, 'change.diff', 'diff --git a/x b/x\n+1\n');
    const t = taskWithMaterial(L, 'Review this change.', false, false).task;
    expect(t).toContain('<material name="change.diff">');
    expect(t).toContain('Leave no bracketed slot for me to fill');
    expect(taskWithMaterial(L, 'Review this change.', true, false).task).toMatch(/do not count\.\)\n\n\(The material holds every specific/);
    expect(taskWithMaterial(L, 'Review this change.', false, true).task).not.toContain('bracketed slot');
  });
});
