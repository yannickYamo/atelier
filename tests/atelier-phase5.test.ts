// tests/atelier-phase5.test.ts — A REWRITE KEEPS WHAT THE TEXT CLAIMS; ACCURACY BEFORE STYLE; ONE KIND OF DOCUMENT.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spanIntegrity } from '../core/loop/integrity.js';
import { planRepair, applyRepair, type Reverted } from '../core/loop/repair.js';
import { refineToStandard, checkDraft } from '../core/loop/run-repair.js';
import { checkClass, normalizeClass } from '../core/observers/doc-class.js';
import { decide } from '../core/ratification/authority.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import { anInferenceResult } from './fixtures.js';
import * as store from '../core/state/store.js';

const none = new Set<string>();

describe('the meaning check: figures, negation, qualifiers and names survive a rewrite', () => {
  it('a shortened sentence that keeps everything passes', () => {
    expect(spanIntegrity('NASA may launch roughly 40 missions, not 50.', 'NASA may launch roughly 40 missions, not 50', none, false).ok).toBe(true);
  });
  it('a lost figure is named', () => {
    expect(spanIntegrity('Costs fell by 40% last year.', 'Costs fell sharply last year.', none, false).lost).toContain('the figure 40');
  });
  it('a dropped or added negation is named', () => {
    expect(spanIntegrity('This is not a treaty problem.', 'This is a treaty problem.', none, false).ok).toBe(false);
    expect(spanIntegrity('This is a treaty problem.', 'This is never a treaty problem.', none, false).ok).toBe(false);
  });
  it('"is not" and "isn\'t" are the same negation', () => {
    expect(spanIntegrity('It is not settled.', 'It isn\'t settled.', none, false).ok).toBe(true);
  });
  it('a dropped qualifier makes the claim stronger, and is refused', () => {
    const r = spanIntegrity('Most operators may never share covariances.', 'Operators never share covariances.', none, false);
    expect(r.lost).toEqual(expect.arrayContaining(['the qualifier "may"', 'the qualifier "most"']));
  });
  it('a dropped name is refused; a sentence-opening capital is not a name', () => {
    expect(spanIntegrity('The rule comes from the Outer Space Treaty.', 'The rule comes from a treaty.', none, false).lost)
      .toEqual(expect.arrayContaining(['the name "Outer"', 'the name "Space"', 'the name "Treaty"']));
    expect(spanIntegrity('Launch is cheap now.', 'It is cheap to launch now.', none, false).ok).toBe(true);
  });
  it('a word the broken rule named may go: that is the repair', () => {
    expect(spanIntegrity('We may perhaps ship.', 'We may ship.', new Set(['perhaps']), false).ok).toBe(true);
    expect(spanIntegrity('It\'s not a vacancy, it\'s a chain.', 'It is a chain of responsibility.', new Set(['not a vacancy, it\'s']), false).ok).toBe(true);
  });
  it('a placeholder an earlier pass left must survive a later one', () => {
    expect(spanIntegrity('[your story: a launch that slipped] We value synergy.', 'We value teamwork.', none, false).ok).toBe(false);
  });
  it('"cannot" is a negation, and "cannot" to "can\'t" keeps it', () => {
    expect(spanIntegrity('You cannot skip the review.', 'You can skip the review.', none, false).ok).toBe(false);
    expect(spanIntegrity('You cannot skip it.', "You can't skip it.", none, false).ok).toBe(true);
  });
  it('a licensed drop waives only the negations it carried', () => {
    expect(spanIntegrity("We never shipped it, but it is not a bug, it's a feature.", 'We shipped it, and it is a feature.', new Set(["not a bug, it's"]), false).ok).toBe(false);
  });
  it('possessive names, and repeated qualifiers, are counted', () => {
    expect(spanIntegrity("The plan came from NASA's team.", 'The plan came from a team.', none, false).lost).toContain('the name "NASA"');
    expect(spanIntegrity('It holds in most cases and for most teams.', 'It holds in most cases and for teams.', none, false).ok).toBe(false);
  });
  it('title-cased headings, links and spelled-out numbers are not losses', () => {
    expect(spanIntegrity('## Why It Matters', '## Why it matters', none, false).ok).toBe(true);
    expect(spanIntegrity('See [the docs](http://x).', 'See the docs (http://x).', none, false).ok).toBe(true);
    expect(spanIntegrity('We ran 3 tests.', 'We ran three tests.', none, false).ok).toBe(true);
  });
  it('an invented story or figure is expected to lose its specifics', () => {
    expect(spanIntegrity('In 2019 I saw 40% of launches slip.', '[your story: a launch that slipped]', none, true).ok).toBe(true);
  });
  it('"about" and "can" are not treated as hedges', () => {
    expect(spanIntegrity('This is about launch cadence, and you can see it.', 'This concerns launch cadence, which you see.', none, false).ok).toBe(true);
  });
});

const std = (reqs: Partial<Requirement>[]): StandardVersion => ({ standardVersionHash: 's', requirements: reqs.map((r, i) => ({
  requirementId: `x${i + 1}`, statement: 'r', appliesWhen: 'GENERAL', kind: 'BOUNDARY', materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED', ...r })) } as unknown as StandardVersion);

describe('the splice refuses a rewrite that changes the claim, and keeps the original span', () => {
  const v = std([{ measurement: { observer: 'LEXICON', params: { terms: ['leverage=>use'] } } }]);
  const draft = 'We shipped on Monday. Most teams may leverage roughly 40 tools. The team met twice.';
  const targets = planRepair(draft, checkDraft('d', v, draft, { guardClaims: false }));
  it('the target licenses dropping the banned word only', () => {
    expect(targets[0].drops).toEqual(['leverage']);
  });
  it('a rewrite that drops "most" and the figure is reverted and reported', () => {
    const reverted: Reverted[] = [];
    const out = applyRepair(draft, targets, [{ id: 1, text: 'Teams use tools.' }], reverted);
    expect(out).toBe(draft);
    expect(reverted[0].lost).toEqual(expect.arrayContaining(['the figure 40', 'the qualifier "most"']));
  });
  it('a faithful rewrite is spliced', () => {
    expect(applyRepair(draft, targets, [{ id: 1, text: 'Most teams may use roughly 40 tools.' }])).toContain('Most teams may use roughly 40 tools.');
  });
});

describe('the loop: accuracy first, and refused rewrites are recorded', () => {
  const budget = () => ({ spentUsd: 0, capUsd: 5 });
  it('an UNSOURCED claim is repaired in its own pass before any style rule', async () => {
    const v = std([{ measurement: { observer: 'LEXICON', params: { terms: ['synergy'] } } }]);
    const draft = 'According to a 2023 survey, 73% of teams failed. We value synergy here. The rest is plain.';
    const seen: string[] = [];
    const client: InferenceClient = { complete: async (r: InferenceRequest) => {
      seen.push(r.userMessage);
      const first = seen.length === 1;
      // The placeholder has no full stop, so the next pass's sentence starts at it; the model keeps it.
      return anInferenceResult({ json: { replacements: [{ id: 1, text: first ? '[figure: what failed, and its source]' : '[figure: what failed, and its source] We value working together here.' }] } });
    } };
    const out = await refineToStandard(client, budget(), 'd', v, draft, 2, { material: '' });
    expect(seen[0]).toContain('UNSOURCED');
    expect(seen[0]).not.toContain('synergy (');
    expect(seen[1]).toContain('synergy');
    expect(out.output).toBe('[figure: what failed, and its source] We value working together here. The rest is plain.');
    expect(out.repair?.passes).toBe(2);
  });
  it('an accuracy pass that fixes only one of two invented claims is kept, and style still gets its passes', async () => {
    const v = std([{ measurement: { observer: 'LEXICON', params: { terms: ['synergy'] } } }]);
    const draft = 'According to a 2023 survey, 73% of teams failed. We value synergy here. In 2021 I watched 40% of launches slip.';
    let n = 0;
    const client: InferenceClient = { complete: async (r: InferenceRequest) => {
      n += 1;
      if (n === 1) return anInferenceResult({ json: { replacements: [{ id: 1, text: '[figure: what failed, and its source]' }] } });
      const spans = [...r.userMessage.matchAll(/SPAN (\d+)\n"""([\s\S]*?)"""/g)].map((m) => ({ id: Number(m[1]), text: m[2] }));
      return anInferenceResult({ json: { replacements: spans.map((x) => ({ id: x.id, text: x.text.includes('2021')
        ? '[your story: a launch that slipped]' : x.text.replace('synergy', 'working together') })) } });
    } };
    const out = await refineToStandard(client, budget(), 'd', v, draft, 2, { material: '' });
    expect(out.output).toContain('[figure: what failed, and its source]');
    expect(out.output).toContain('working together');
    expect(out.repair?.violatedAfter).toEqual([]);
  });
  it('a pass whose every rewrite loses meaning ends the loop with the draft, and says why', async () => {
    const v = std([{ measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } }]);
    const draft = 'Most operators may leverage 40 tools. Nothing else changes here.';
    const client: InferenceClient = { complete: async () => anInferenceResult({ json: { replacements: [{ id: 1, text: 'Operators use tools.' }] } }) };
    const out = await refineToStandard(client, budget(), 'd', v, draft, 2, { guardClaims: false });
    expect(out.output).toBe(draft);
    expect(out.repair?.integrityReverted?.[0]).toMatch(/the figure 40/);
    expect(out.repair?.why).toMatch(/changed what the text claims/);
  });
});

describe('phase is a decision the owner makes, through decide()', () => {
  const r = { requirementId: 'x1', statement: 'Cite sources.', appliesWhen: 'GENERAL', kind: 'GENERATIVE', materiality: 'REQUIRED',
    authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED', evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
    realizationTolerance: 'FLEXIBLE', outputShape: null } as unknown as Requirement;
  it('AMEND with only a phase is a change, recorded on the rule', () => {
    expect(decide(r, { verb: 'AMEND', phase: 'STYLE' }).requirement.phase).toBe('STYLE');
    expect(decide(r, { verb: 'AMEND', phase: 'ACCURACY' }).requirement.phase).toBe('ACCURACY');
  });
});

describe('document class', () => {
  it('declared on both sides and different: refused', () => {
    expect(checkClass('blog-post', 'Support reply').ok).toBe(false);
  });
  it('declared on both sides and equal, whatever the spelling: runs silently', () => {
    expect(checkClass('support-reply', 'Support_Reply')).toEqual({ ok: true, note: null });
    expect(normalizeClass(' Blog Post ')).toBe('blog-post');
  });
  it('one side silent: runs, and says what it assumed', () => {
    expect(checkClass('blog-post', undefined)).toMatchObject({ ok: true, note: expect.stringMatching(/checked as blog-post/) });
    expect(checkClass(null, 'tweet')).toMatchObject({ ok: true, note: expect.stringMatching(/declares no document class/) });
  });
});

describe('through the binary: class and UNSOURCED on verify, invoke and the MCP tool', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  const seed = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-p5-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p5-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['pipe', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    run('add', '--statement', 'Never use the word tea.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'LEXICON:tea', '--phase', 'STYLE');
    run('ratify-close', '--work-type', 'writing');
    const b = run('build', '--name', 'nodrink', '--class', 'Blog Post');
    expect(b.out).toContain('Document class: blog-post');
    return { data, proj, env, run };
  };
  it('verify refuses a text declared as another class with exit 2, and notes the assumption otherwise', () => {
    const { proj, run } = seed();
    const f = join(proj, 'd.md'); writeFileSync(f, 'We had coffee on Monday.');
    expect(run('verify', '--skill', 'nodrink', f, '--class', 'tweet').code).toBe(2);
    const ok = run('verify', '--skill', 'nodrink', f);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('checked as blog-post');
    expect(run('verify', '--skill', 'nodrink', f, '--class', 'blog post').out).not.toContain('checked as');
  });
  it('verify fails an invented figure as UNSOURCED, and passes it once it is in the material', () => {
    const { proj, run } = seed();
    const f = join(proj, 'd.md'); writeFileSync(f, 'According to a 2023 survey, 73% of teams drink coffee.');
    const bad = run('verify', '--skill', 'nodrink', f);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('UNSOURCED');
    const notes = join(proj, 'notes.md'); writeFileSync(notes, 'The 2023 survey: 73% of teams drink coffee.');
    run('material', '--skill', 'nodrink', notes);
    expect(run('verify', '--skill', 'nodrink', f).code).toBe(0);
    expect(run('verify', '--skill', 'nodrink', join(proj, 'd.md'), '--allow-unsourced').code).toBe(0);
  });
  it('amend --phase reaches the built standard; a bad phase is refused; build --class none clears the class', () => {
    const { data, run } = seed();
    const L = { root: data, skillName: 'nodrink' };
    const rule = () => store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)!.requirements[0];
    expect(rule().phase).toBe('STYLE');
    expect(run('amend', '--skill', 'nodrink', '--rule', rule().requirementId, '--phase', 'accuracy', '--reason', 'claims first').code).toBe(0);
    expect(rule().phase).toBe('ACCURACY');
    expect(run('amend', '--skill', 'nodrink', '--rule', rule().requirementId, '--phase', 'loud', '--reason', 'x').code).not.toBe(0);
    run('build', '--name', 'nodrink', '--class', 'none');
    expect(store.getDocClass(L)).toBeNull();
  });
  it('invoke refuses another class before spending anything', () => {
    const { run } = seed();
    const r = run('invoke', '--skill', 'nodrink', 'write a tweet', '--class', 'tweet', '--provider', 'openai-compatible', '--base-url', 'http://127.0.0.1:9', '--model', 'x');
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('this standard measures blog-post');
  });
  it('the MCP tool refuses another class, and flags UNSOURCED', () => {
    const { proj, env } = seed();
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'atelier_verify', arguments: { skill: 'nodrink', text: 'We had coffee.', class: 'tweet' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'atelier_verify', arguments: { skill: 'nodrink', text: 'According to a 2023 survey, 73% of teams drink coffee.' } } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'atelier_verify', arguments: { skill: 'nodrink', text: 'According to a 2023 survey, 73% of teams drink coffee.', material: 'survey 2023: 73%' } } },
    ].map((m) => JSON.stringify(m)).join('\n');
    const out = execFileSync('node', [CLI, 'mcp'], { encoding: 'utf8', cwd: proj, env, input }).trim().split('\n')
      .map((l) => JSON.parse(l) as { result: { content: { text: string }[]; isError?: boolean } });
    expect(out[0].result.isError).toBe(true);
    expect(out[1].result.content[0].text).toMatch(/"rule":"UNSOURCED"/);
    expect(out[2].result.content[0].text).toMatch(/"failed":false/);
  });
});
