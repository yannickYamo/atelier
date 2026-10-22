// THROUGH THE BINARY (gap audit 2026-10-22, M7, M8, M10): the hook names the required rules it could not read; verify
// --json says the same thing in `violated` as in its record; invoke --json prints a record even when the run fails.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { standardHashOf, type Requirement } from '../core/state/canonical-state.js';

const CLI = resolve('dist/cli/atelier.mjs');
const PIECES = [
  'The team shipped the fix on Monday, and the panel held. Nobody asked for more.\n\nThe plan was simple: ship, watch, write it down.',
  'A short note on the release. We watched the queue drain and the panel stay green.\n\nThen we wrote it down, as always.',
  'The outage lasted an hour. The panel went red, the queue filled, and we waited.\n\nWriting it down was the easy part.',
];
const GOOD = 'The release went out on Monday, late, and the panel held. We wrote it down.\n';
// A written check that reads the material: every bracketed name must be a document in it.
const CITES = "(text, request, material) => { const names = material.map((m) => m.name.toLowerCase().replace(/\\.[a-z]+$/, '')); const bad = [...text.matchAll(/\\[([^\\]]+)\\]/g)].filter((m) => !names.includes(m[1].toLowerCase())); return { ok: bad.length === 0, detail: bad.length + ' citation(s) not in the material', spans: bad.map((m) => ({ start: m.index, end: m.index + m[0].length, why: 'not a document in the material' })) }; }";

describe('the hook, verify --json and invoke --json (gap audit, medium)', () => {
  let root = ''; let proj = ''; let data = '';
  const run = (stdin: string | null, ...args: string[]): { out: string; err: string; code: number } => {
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const errFile = join(root, 'err.txt'); const inFile = join(root, 'in.json');
    if (stdin !== null) writeFileSync(inFile, stdin);
    try {
      const out = execFileSync('sh', ['-c', `node "${CLI}" ${args.map((x) => `'${x}'`).join(' ')} ${stdin === null ? '' : `<"${inFile}"`} 2>"${errFile}"`], { encoding: 'utf8', cwd: proj, env });
      return { out, err: execFileSync('cat', [errFile], { encoding: 'utf8' }), code: 0 };
    } catch (e) {
      const x = e as { status?: number; stdout?: string };
      return { out: x.stdout ?? '', err: execFileSync('cat', [errFile], { encoding: 'utf8' }), code: x.status ?? 1 };
    }
  };
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    root = mkdtempSync(join(tmpdir(), 'atelier-gap-med-')); proj = join(root, 'proj'); data = join(root, 'data');
    mkdirSync(proj); mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    expect(run(null, 'new', 'posts', '--no-model', '--name', 'posts').code).toBe(0);
  }, 120_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it('M7: a hook event binds no material: a required check that reads it is named on stderr as not read, and nothing blocks', () => {
    const L = { root: data, skillName: 'posts' };
    const sv = store.getSkillVersion(L, store.getActive(L)!)!; const std = store.getStandard(L, sv.standardVersionHash)!;
    const cites: Requirement = { requirementId: 'x90', statement: 'Every citation names a document in the file.', appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_STATED',
      evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: 'REQUIRED', realizationTolerance: null, outputShape: null, obligation: 'DELIVERABLE',
      measurement: { observer: 'CHECK', params: { source: [CITES], means: ['each bracketed name is a document in the material'] } } };
    const body = { ...std, requirements: [...std.requirements, cites] };
    const v = store.putStandard(L, { ...body, standardVersionHash: standardHashOf(body), qualifications: { x90: { qualified: true, examples: { passed: 3, read: 3, of: 3 }, own: { caught: 3, of: 3 }, cross: { fired: 0, of: 0 }, why: null } } });
    store.putSkillVersion(L, { ...sv, skillVersionHash: `${sv.skillVersionHash.slice(0, 12)}m7m7`, standardVersionHash: v.standardVersionHash });
    store.setActive(L, `${sv.skillVersionHash.slice(0, 12)}m7m7`);
    writeFileSync(join(proj, 'x.md'), GOOD);
    const r = run(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(proj, 'x.md'), content: GOOD } }), 'verify', '--skill', 'posts', '--hook');
    expect(r.code, r.err).toBe(0);
    expect(r.err).toContain('Every citation names a document in the file');
    expect(r.err).toMatch(/not read/);
  });

  it('M8: verify --json says what blocked it in violated, from the same record its state comes from', () => {
    writeFileSync(join(proj, 'copied.md'), `${PIECES[0].replace('\n\n', ' ')} ${PIECES[1].replace('\n\n', ' ')}\n`);
    const r = run(null, 'verify', '--skill', 'posts', 'copied.md', '--json', '--allow-unsourced');
    const j = JSON.parse(r.out) as { state: string; failed: boolean; violated: { id: string; required: boolean }[]; record: { entries: { id: string; result: string; required: boolean }[] } };
    expect(j.state).toBe('BLOCKED');
    expect(j.failed).toBe(true);
    expect(j.violated.map((x) => x.id)).toContain('lifted');
    expect(j.violated.map((x) => x.id).sort()).toEqual(j.record.entries.filter((e) => e.result === 'FAIL' && e.required).map((e) => e.id).sort());
  });

  it('M10: invoke --json that cannot run prints one object saying so, never nothing', () => {
    for (const args of [['invoke', '--skill', 'nope', 'Write the note.', '--json'], ['invoke', '--skill', 'posts', 'Write the note.', '--json', '--provider', 'openai-compatible', '--base-url', 'http://127.0.0.1:9', '--model', 'gone']]) {
      const r = run(null, ...args);
      expect(r.code, r.err).not.toBe(0);
      const j = JSON.parse(r.out) as { schema: string; state: string; error: string };
      expect(j).toMatchObject({ schema: 'atelier-record/1', state: 'ERROR' });
      expect(j.error.length).toBeGreaterThan(0);
    }
  });
});
