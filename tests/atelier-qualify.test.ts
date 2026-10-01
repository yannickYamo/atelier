// tests/atelier-qualify.test.ts — AN INSTRUMENT IS QUALIFIED ON TEXTS IT NEVER SAW, AND A TOPIC IS NEVER GUESSED.
//
// Unit tests for the topic requirement of qualifyAll, the families a detector is valid for, the old
// contrast-draft cache read as one generator, and the qualification store; then one journey through the
// shipped binary against a scripted backend: discovery records the generator, `atelier qualify` refuses the
// topic hold-out without labels and runs it with them, `atelier fidelity` says what the detector is valid
// for. Last, the B6 harness's own self-test, so every refusal of the study is held by this suite too.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { qualifyAll, hasTopic, type QualifyItem, type Sensor } from '../core/fidelity/qualify.js';
import { buildProfile, readFidelity } from '../core/fidelity/profile.js';
import * as fstore from '../core/state/fidelity-store.js';
import { contrastOf } from '../cli/commands/discover.js';
import { frontMatterTopic, verdictOf } from '../cli/commands/qualify.js';

const CLI = resolve('dist/cli/atelier.mjs');

// ── a sensor that separates by construction: the count of "zz" tokens ─────────────────────────────────
const zz = (n: number, salt: number): string => `${Array.from({ length: n }, () => 'zz').join(' ')} text ${salt}`;
const items = (withTopics: boolean): QualifyItem[] => {
  const out: QualifyItem[] = [];
  for (let s = 0; s < 8; s++) {
    const topic = withTopics ? `t${s % 4}` : undefined;
    out.push({ text: zz(1 + (s % 3), s), label: 'author', source: `s${s}`, ...(topic ? { topic } : {}) });
    for (const g of ['gen-a', 'gen-b']) out.push({ text: zz(10 + (s % 4), s), label: 'model', source: `s${s}`, generator: g, ...(topic ? { topic } : {}) });
  }
  return out;
};
const sensor: Sensor = { kind: 'feature', measure: (t) => (t.match(/\bzz\b/g) ?? []).length, direction: 'model-higher' };

describe('qualifyAll with requireTopics: the topic hold-out runs on real labels or not at all', () => {
  it('without topic labels the topic hold-out is NOT RUN (missing labels) and nothing qualifies', () => {
    const r = qualifyAll(items(false), sensor, { resamples: 200, requireTopics: true });
    expect(r.results.map((x) => x.holdOut)).toEqual(['source', 'generator']);
    expect(r.results.every((x) => x.passes)).toBe(true);
    expect(r.skipped).toEqual([{ holdOut: 'topic', why: 'NOT RUN (missing labels): 24 of 24 text(s) have no topic label' }]);
    expect(r.passes).toBe(false);
    expect(verdictOf(r)).toMatch(/^NOT QUALIFIED: topic hold-out not run \(missing labels\)/);
  });

  it('one text without a label is enough to refuse it; a placeholder topic is not a label', () => {
    const xs = items(true); const missing = [...xs.slice(1), { ...xs[0], topic: '(none)' }];
    expect(hasTopic({ ...xs[0], topic: '(none)' })).toBe(false);
    expect(hasTopic({ ...xs[0], topic: '  ' })).toBe(false);
    const r = qualifyAll(missing, sensor, { resamples: 200, requireTopics: true });
    expect(r.skipped[0].why).toMatch(/NOT RUN \(missing labels\): 1 of 24/);
    expect(r.passes).toBe(false);
  });

  it('with labels on every text it runs all three hold-outs and qualifies', () => {
    const r = qualifyAll(items(true), sensor, { resamples: 200, requireTopics: true });
    expect(r.results.map((x) => x.holdOut)).toEqual(['source', 'topic', 'generator']);
    expect(r.results.find((x) => x.holdOut === 'topic')!.folds.map((f) => f.held)).toEqual(['t0', 't1', 't2', 't3']);
    expect(r.passes).toBe(true);
    expect(verdictOf(r)).toBe('QUALIFIED: holds with sources, topics, generators held out.');
  });

  it('without the option the old behaviour holds: an unlabelled set runs no topic hold-out and may still qualify', () => {
    const r = qualifyAll(items(false), sensor, { resamples: 200 });
    expect(r.skipped.map((x) => x.holdOut)).toEqual(['topic']);
    expect(r.passes).toBe(true);
  });

  it('front matter gives a topic; a body line never does', () => {
    expect(frontMatterTopic('---\ntitle: x\ntopic: Hiring\n---\n# Body')).toBe('Hiring');
    expect(frontMatterTopic('topic: pricing\n\n# Body')).toBe('pricing');
    expect(frontMatterTopic('# Body\n\ntopic: not front matter')).toBeUndefined();
    expect(frontMatterTopic('---\ntitle: x\n---\ntopic: after the block')).toBeUndefined();
  });
});

// ── a detector's families ─────────────────────────────────────────────────────────────────────────────
const SENTENCES = [
  'We shipped the change on a Tuesday.', 'Nobody noticed for a week.', 'Then the support queue doubled.',
  'The cause was a cache that never expired.', 'We had read the docs and still missed it.', 'The fix took an hour.',
  'Finding it took four days.', 'I keep a list of these now.', 'Most of it is boring on purpose.', 'Boring is what lets you sleep.',
  'The team argued about the rollback.', 'We kept the flag and moved on.', 'It was the right call, mostly.', 'The graph went flat by Friday.',
  'Our users never wrote in about it.', 'That silence was the real signal.',
];
const sentence = (i: number): string => SENTENCES[i % SENTENCES.length];
const authorPiece = (k: number): string => Array.from({ length: 15 }, (_, p) =>
  Array.from({ length: 2 + ((p + k) % 2) }, (_, s) => sentence(k * 7 + p * 3 + s)).join(' ')).join('\n\n');
const modelDraft = (k: number): string => `Furthermore, it is important to note that ${Array.from({ length: 34 }, (_, s) => sentence(k * 5 + s)).join(' Moreover, ')}`;

describe('a detector is valid for the model families it was trained against, and says so', () => {
  const read = Array.from({ length: 8 }, (_, k) => ({ id: `p${k}`, text: authorPiece(k) }));
  const model = Array.from({ length: 8 }, (_, k) => modelDraft(k));

  it('buildProfile records the generators as the detector\'s families, sorted and once each', () => {
    const p = buildProfile({ read, held: [], model, corpusHash: 'c', modelFamilies: ['model-b', 'model-a', 'model-b'] });
    expect(p.detector).not.toBeNull();
    expect(p.detector!.families).toEqual(['model-a', 'model-b']);
  });

  it('every reading names the families of the detector that read it', () => {
    const p = buildProfile({ read, held: [], model, corpusHash: 'c', modelFamilies: ['model-a'] });
    expect(readFidelity(modelDraft(3), p).detector?.families).toEqual(['model-a']);
  });

  it('without generator ids the profile is what it was: no families, the same hash', () => {
    const a = buildProfile({ read, held: [], model, corpusHash: 'c' });
    const b = buildProfile({ read, held: [], model, corpusHash: 'c', modelFamilies: [] });
    expect(a.detector!.families).toBeUndefined();
    expect(a.hash).toBe(b.hash);
    expect(readFidelity(modelDraft(3), a).detector).not.toHaveProperty('families');
  });

  it('a contrast-draft cache from before generators were recorded is one generator, "unknown"', () => {
    expect(contrastOf({ corpusHash: 'c', drafts: ['a', 'b'] })).toEqual({ drafts: ['a', 'b'], generators: ['unknown', 'unknown'], sources: [null, null] });
    expect(contrastOf({ corpusHash: 'c', drafts: ['a'], meta: [{ generator: 'm1', source: 'p0' }] })).toEqual({ drafts: ['a'], generators: ['m1'], sources: ['p0'] });
  });
});

describe('the qualification is stored under the profile it measured', () => {
  it('round-trips, and a file under another profile\'s name is refused', () => {
    const L = { root: mkdtempSync(join(tmpdir(), 'atelier-q-store-')), skillName: 's' };
    const q: fstore.Qualification = { profileHash: 'abc123', measuredAt: 'now', data: { itemsHash: 'h', author: 4, model: 4, generators: ['g'], topicsLabelled: false }, seed: 1, resamples: 0, instruments: [] };
    expect(fstore.getQualification(L, 'abc123')).toBeNull();
    fstore.setQualification(L, q);
    expect(fstore.getQualification(L, 'abc123')).toEqual(q);
    fstore.setQualification(L, { ...q, profileHash: 'def456' });
    writeFileSync(join(L.root, 'skills', 's', 'fidelity', 'qualifications', 'abc123.json'), JSON.stringify({ ...q, profileHash: 'def456' }));
    expect(() => fstore.getQualification(L, 'abc123')).toThrow(/is for profile def456, not abc123/);
    expect(() => fstore.getQualification(L, '../x')).toThrow(/not a profile hash/);
  });
});

describe('through the binary: qualify on the skill\'s own data, fidelity names the families', () => {
  let backend: ChildProcess; let port = 0;
  const data = mkdtempSync(join(tmpdir(), 'atelier-q-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-q-proj-'));
  const wall = modelDraft(7);
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
    const factor = (description: string) => ({ description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_factors: { factors: [factor('Say what happened before why.')] },
      emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] },
      emit_observation: { applicable: true, present: true, why: 'seen' },
      emit_piece: { piece: wall },
      emit_text: { text: wall },
    } }) });
    const dir = join(proj, 'posts'); mkdirSync(dir, { recursive: true });
    for (let k = 0; k < 12; k++) writeFileSync(join(dir, `post-${k}.md`), authorPiece(k));
  });
  afterAll(() => { backend.kill(); });
  const run = (...args: string[]): string => {
    try {
      return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
        encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' },
      });
    } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${x.status}\n${x.stderr ?? ''}${x.stdout ?? ''}`; }
  };

  it('discovery records the generator; fidelity shows what the detector is valid for', () => {
    expect(run('new', join(proj, 'posts'), 'write a post like these', '--name', 'posts', '--accept', '--no-ai-assist')).not.toMatch(/^EXIT:/);
    const page = run('fidelity', '--skill', 'posts');
    expect(page).toMatch(/Style detector [0-9a-f]{16} \(a monitor\)/);
    expect(page).toMatch(/ {2}valid for: scripted\n/);
    expect(page).toMatch(/not qualified yet: atelier qualify --skill posts/);
  }, 120_000);

  it('without topic labels the topic hold-out is NOT RUN and no instrument qualifies', () => {
    const out = run('qualify', '--skill', 'posts', '--resamples', '100');
    expect(out).not.toMatch(/^EXIT:/);
    expect(out).toMatch(/style detector \(valid for: scripted\)/);
    expect(out).toMatch(/topic +NOT RUN \(missing labels\)/);
    expect(out).toMatch(/0 of \d+ instrument\(s\) qualified/);
    const j = JSON.parse(run('qualify', '--skill', 'posts', '--resamples', '100', '--json')) as fstore.Qualification;
    expect(j.data.topicsLabelled).toBe(false);
    expect(j.data.generators).toEqual(['scripted']);
    const det = j.instruments.find((x) => x.kind === 'detector')!;
    expect(det.result.results.map((x) => x.holdOut)).toEqual(['source']);
    expect(det.result.skipped.map((x) => x.holdOut)).toEqual(['topic', 'generator']);
    expect(det.result.passes).toBe(false);
  }, 120_000);

  it('with a topics sidecar the topic hold-out runs, and the result is stored with the skill', () => {
    const topics = join(proj, 'topics.json');
    writeFileSync(topics, JSON.stringify(Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`post-${k}.md`, `topic-${k % 3}`]))));
    const j = JSON.parse(run('qualify', '--skill', 'posts', '--resamples', '100', '--topics', topics, '--json')) as fstore.Qualification;
    expect(j.data.topicsLabelled).toBe(true);
    const det = j.instruments.find((x) => x.kind === 'detector')!;
    expect(det.result.results.map((x) => x.holdOut)).toEqual(['source', 'topic']);
    expect(det.result.results[1].folds.map((f) => f.held)).toEqual(['topic-0', 'topic-1', 'topic-2']);
    expect(det.result.skipped.map((x) => x.holdOut)).toEqual(['generator']);
    const L = { root: data, skillName: 'posts' };
    expect(fstore.getQualification(L, j.profileHash)?.data.topicsLabelled).toBe(true);
    expect(run('fidelity', '--skill', 'posts')).toMatch(/qualified: \d+ of \d+ instrument\(s\) hold out of sample/);
  }, 120_000);

  it('topics in the pieces\' front matter count as labels, with no sidecar', () => {
    const proj2 = mkdtempSync(join(tmpdir(), 'atelier-q-proj2-')); const data2 = mkdtempSync(join(tmpdir(), 'atelier-q-data2-'));
    const dir = join(proj2, 'posts'); mkdirSync(dir, { recursive: true });
    for (let k = 0; k < 12; k++) writeFileSync(join(dir, `post-${k}.md`), `---\ntopic: subject-${k % 3}\n---\n\n${authorPiece(k)}`);
    const run2 = (...args: string[]): string => execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
      encoding: 'utf8', cwd: proj2, env: { ...process.env, ATELIER_DATA: data2, ATELIER_PROJECT_DIR: proj2, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' },
    });
    run2('new', dir, 'write a post like these', '--name', 'fm', '--accept', '--no-ai-assist');
    const j = JSON.parse(run2('qualify', '--skill', 'fm', '--resamples', '100', '--json')) as fstore.Qualification;
    expect(j.data.topicsLabelled).toBe(true);
    const det = j.instruments.find((x) => x.kind === 'detector')!;
    expect(det.result.results.find((x) => x.holdOut === 'topic')!.folds.map((f) => f.held)).toEqual(['subject-0', 'subject-1', 'subject-2']);
  }, 120_000);
});

describe('the B6 harness refuses what should not be possible', () => {
  it('bench/b6/selftest.mjs: every refusal fires and the pre-registered design is scored', () => {
    const r = spawnSync(process.execPath, [resolve('bench/b6/selftest.mjs')], { encoding: 'utf8', timeout: 120_000 });
    expect(r.stdout).toMatch(/\n\d+ passed, 0 failed\n/);
    expect(r.stdout).not.toMatch(/^FAIL/m);
    expect(r.status).toBe(0);
  }, 150_000);
});
