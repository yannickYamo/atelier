// THE REQUEST AND THE EXAMPLES ARE KEPT APART, AND THE TEST READS THE WORK, NOT THE FRAME. Two things were wrong:
// a blog's own pieces were served inside a frame written for support replies ("a separate, earlier conversation with
// someone else"), and the slot shape sat in every skill, so a review with the diff bound named a slot as a finding.
// And one thing has to hold whatever the frame says: a reply to "Thanks, that solved it." after goldens about a PDF
// import must not carry the PDF into this person's case. The last test builds that skill and runs that request.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { composeServed, forThisRequest } from '../cli/served.js';
import { renderAgentSkill, WRITE_LIKE_THESE, SLOT_NOTE } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';
import type { Voice } from '../core/compiler/voice.js';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');

describe('the frame around the served examples follows the form of the work', () => {
  const files = (form: 'replies' | 'documents' | null): Record<string, string> => ({
    'SKILL.md': `---\nname: x\ndescription: d\n---\n${form ? `<!-- form: ${form} -->\n` : ''}\n# x\n\nRules.\n`,
    'examples/voice-1.md': '[voice-1] A whole piece of mine.\n\nThe PDF import stalls when the file is scanned.',
  });
  it('replies: each example is another person\'s earlier conversation; documents: a whole piece of the author\'s, read for how it is written', () => {
    const reply = composeServed(files('replies'), '').servedText;
    expect(reply).toContain('Each example is a separate, earlier conversation with someone');
    expect(reply).toContain('the work you produce begins fresh from here ===');
    expect(reply).not.toContain('a whole piece they wrote on a subject of its own');
    const doc = composeServed(files('documents'), '').servedText;
    expect(doc).toContain('shows how the author writes, or how this skill\'s rules apply');
    expect(doc).toContain('Each piece of the author\'s below is a whole piece they wrote on a subject of its own, shown for how it is');
    expect(doc).toContain('takes from these only the way they\nare written.');
    expect(doc).not.toContain('earlier conversation with someone');
    expect(doc).toContain('=== END REFERENCE MATERIAL — the request comes next. The piece you write begins fresh from it and its material ===');
    // both keep what every frame must say: private context, never content for the reader
    for (const t of [reply, doc]) expect(t).toContain('do not reproduce, continue, quote, enumerate, summarise or mention');
    // a package built before the marker existed is framed as before
    expect(composeServed(files(null), '').servedText).toContain('earlier conversation with someone');
  });
});

describe('the slot shape is the run\'s to say, never the skill\'s', () => {
  const req = (over: Partial<Requirement>): Requirement => ({ requirementId: 'r1', statement: 'Open with the claim.', appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED', provenance: 'EXPERT_STATED',
    evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: 'REQUIRED', realizationTolerance: null, outputShape: null, ...over });
  const std = (rs: Requirement[]): StandardVersion => ({ standardVersionHash: 's', evidenceId: 'e', workType: 'post', requirements: rs, authorityState: 'RATIFIED', mintedAt: '2026-10-18T00:00:00Z' } as unknown as StandardVersion);
  const voice: Voice = { passages: [], lengthWords: [400, 400], pieces: ['A piece of some length here, with words.'], form: 'DOCUMENT' };
  it('the skill carries the frame and the form marker, and no slot syntax; the request notes carry the slot line when asked', () => {
    const v = std([req({})]);
    const md = renderAgentSkill(v, compileArchitecture(v), 'post', 'd', null, [], voice).files['SKILL.md'];
    expect(md).toContain(WRITE_LIKE_THESE.split('\n')[0]);
    expect(md).toContain('<!-- form: documents -->');
    expect(md).not.toMatch(/\[link: |\[product: |\[figure: |mark it as a slot/);
    expect(WRITE_LIKE_THESE).not.toContain('slot');
    expect(SLOT_NOTE).toContain('[link: what it points to]');
    expect(forThisRequest([], SLOT_NOTE)).toContain(SLOT_NOTE);
    expect(forThisRequest([], '')).toBe('');
    const reply = renderAgentSkill(v, compileArchitecture(v), 'post', 'd', null, [], { ...voice, form: 'REPLY' }).files['SKILL.md'];
    expect(reply).toContain('<!-- form: replies -->');
  });
});

// ── THE THANK-YOU, END TO END ─────────────────────────────────────────────────────────────────────────────
const QUOTE_A = 'run the import once more'; const QUOTE_B = 'That is all it needs.';
const golden = (n: number): string => `---\nrequest: The PDF import stalls at ${n}0% on a scanned file. What do I do?\n---\nThat stall is the OCR pass on the scanned PDF: it reads every page before the import can move. Leave it for a minute, then ${QUOTE_A} from the same screen; the second pass skips what it has read. ${QUOTE_B}\n`;
const PERSONA = { points: [
  { aspect: 'open', description: 'Names the cause before the fix.', frequency: 'ALWAYS', quote: QUOTE_A },
  { aspect: 'close', description: 'Closes on a short plain line.', frequency: 'OFTEN', quote: QUOTE_B },
] };
const REPLY_FORM = { examples: [1, 2, 3].map((n) => ({ example: n, form: 'REPLY', quote: QUOTE_A })), form: 'REPLY' };
const SCOPE = { examples: [1, 2, 3].map((n) => ({ example: n, asked: 'NEITHER', kind: 'how-to', beyond: [] })) };
// What a writer that took the PDF for this person's case writes, and the rewrite that keeps the sentence's work without it.
const CARRIED = 'Glad it worked. If the PDF import stalls again on a scanned file, run the import once more from the same screen. That is all it needs.';
const REWRITES = { rewrites: [{ id: 1, text: 'If the import stalls again, run the import once more from the same screen.' }] };

let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const BACKEND = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted'];

describe('a reply after goldens about a PDF import does not carry the PDF into this person\'s case', () => {
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify({
      byTool: { emit_persona: PERSONA, emit_scope: SCOPE, emit_holds_back: { ids: [] }, emit_piece: { piece: CARRIED }, emit_rewrites: REWRITES },
      when: [{ contains: 'The work is described as', answer: REPLY_FORM }] }) });
  }, 60_000);
  afterAll(() => { backend.kill(); });

  it('"Thanks, that solved it." gets a short reply with no PDF in it, and the record says the sentence was grounded', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-gf-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-gf-proj-'));
    mkdirSync(join(proj, 'examples'));
    for (const n of [1, 2, 3]) writeFileSync(join(proj, 'examples', `r${n}.md`), golden(n));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    const built = run('new', 'examples', 'answer support questions about the importer', '--name', 'support', ...BACKEND());
    expect(built.code, built.out).toBe(0);
    const skill = readFileSync(join(proj, '.claude', 'skills', 'support', 'SKILL.md'), 'utf8');
    expect(skill).toContain('<!-- form: replies -->');
    const r = run('invoke', '--skill', 'support', 'Thanks, that solved it.', '--json', ...BACKEND());
    expect(r.code, r.out).toBe(0);
    const json = JSON.parse(r.out.slice(r.out.indexOf('\n{') + 1)) as { output: string | null; invocationId: string };
    expect(json.output, r.out.slice(0, 400)).not.toBeNull();
    const output = json.output ?? '';
    expect(output).not.toMatch(/PDF/);
    expect(output).toContain('Glad it worked.');
    expect(output.split(/\s+/).length).toBeLessThan(40);
    // the model's own text stays on record, and the record says why the delivered text differs
    const rec = store.listInvocations({ root: data, skillName: 'support' }).find((i) => i.invocationId === json.invocationId);
    expect(rec?.repair?.draft).toContain('PDF');
    expect(JSON.stringify(rec)).toMatch(/Grounded: 1 sentence\(s\) stated a fact only an example's case held; 1 rewritten to state only what the request gives/);
  }, 180_000);
});
