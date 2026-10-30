// tests/atelier-dash-cap-e2e.test.ts — THE DASH CAP AND THE PLAN'S POINTS, THROUGH THE BINARY.
//
//   1. Built without --yes, an owner's "No em dashes." that their own examples dispute is planned as shown only, and the
//      examples' dash cap was dropped beside it: nothing held the dash. The cap now stays, told to the writer and checked.
//   3. With a plan, the writer was served only the plan's points (no words of the material, no file name, no note that the
//      material holds every specific), while a rule that reads the work against the whole material stayed required. Each
//      point now carries the material's words and the file's name, the no-slot note stays, and the figures the rule looks up
//      are served; the points the plan left out stay unserved.
// Against the scripted backend. Expected values are written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const FX = resolve('tests/fixtures/reaction-case');
// Ten points, each with its own word, so a point used in the work can be counted by that word.
const NOTES = [
  'The harbour fund stands at $4.27 million after the spring levy.',
  'The new pontoon takes twelve small boats at a time on the east side.',
  'Volunteers repainted the lighthouse railings over three long weekends.',
  'The ferry timetable now adds an early sailing on market days.',
  'Night fishing is allowed again from the north breakwater after dusk.',
  'The chandlery moved into the old customs shed beside the slipway.',
  'A rowing club for schools starts training on the lagoon in April.',
  'The fuel dock has a new pump that takes cards as well as cash.',
  'Storm shutters were fitted to every window of the harbour office.',
  'The tide gauge now posts its readings to the noticeboard each hour.',
];
const WORD = ['fund', 'pontoon', 'lighthouse', 'timetable', 'breakwater', 'chandlery', 'rowing', 'pump', 'shutters', 'gauge'];
const PLAN = { angle: 'The harbour is ready for the season.', pain: 'Boat owners wait for news of the works.', turn: 'The works are done.', answer: 'Come down and see.',
  points: [{ point: 'room for twelve more boats', from: 'The new pontoon takes twelve small boats at a time' },
    { point: 'an earlier ferry on market days', from: 'The ferry timetable now adds an early sailing on market days' },
    { point: 'school rowing on the lagoon', from: 'A rowing club for schools starts training on the lagoon in April' }],
  image: null, close: 'See you on the quay.', left_out: [] };
const SERVED = 'The pontoon has room for twelve more boats, the timetable has an earlier ferry on market days, and the rowing club starts on the lagoon. The harbour fund stands at $4.27 million.';
const UNSERVED = 'The pontoon has room for twelve more boats, the timetable has an earlier ferry on market days, and the rowing club starts on the lagoon. The harbour fund stands at $4.1 million.';

describe('the dash cap and the plan, through the binary', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
  });
  afterAll(() => { backend.kill(); });
  const log = async (): Promise<string[]> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;
  const be = (): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
  const project = () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-r4-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-r4-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ATELIER_CONTEXT_READER: 'scripted' };
    const cli = (...a: string[]): string => { try { return execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e as { stdout?: string }).stdout ?? ''; } };
    return { proj, cli };
  };

  it('1. built without --yes, a disputed ban keeps the examples\' dash cap: told to the writer and checked on the work', async () => {
    const checks = { checks: [
      { id: '1', how: 'judgement', measure: null, source: null, quote: 'No AI tells', means: 'yours to judge' },
      { id: '2', how: 'measure', measure: 'PATTERN_RATE:pattern=EM_DASH,maxPer1000=0', source: null, quote: 'No em dashes', means: 'no em dash' },
      { id: '3', how: 'judgement', measure: null, source: null, quote: 'not X, it\'s Y', means: 'yours to judge' },
      { id: '4', how: 'judgement', measure: null, source: null, quote: 'No named sources', means: 'yours to judge' }] };
    const draft = readFileSync(join(FX, 'draft-with-tells.md'), 'utf8');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_step_checks: checks, emit_piece: { piece: `<work>${draft}</work>` }, emit_draft: { text: draft } } }) });
    const { cli } = project();
    const built = cli('new', join(FX, 'voice'), '--method', join(FX, 'rules.md'), '--name', 'post-voice', '--latitude', 'creative', ...be());
    expect(built).toContain('blocks nothing until you');
    const out = cli('invoke', '--skill', 'post-voice', 'Write a post about the wharf, about 450 to 700 words.', '--json', '--claims', 'pattern', '--no-questions', '--no-plan', '--no-repair', ...be());
    const j = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, unknown>;
    const writer = (await log()).filter((b) => b.includes('emit_piece')).pop() ?? '';
    expect(writer).toContain('Keep em dashes (—) to at most 20.5 per 1,000 words, as the examples do.');
    expect(JSON.stringify(j)).toContain('Keep em dashes (—) to at most 20.5 per 1,000 words, as the examples do.');
  });

  it('3. with a plan: each point with its material\'s words and file, the no-slot note, the figures a material rule reads; the rest unserved', async () => {
    const { proj, cli } = project();
    const notes = join(proj, 'harbour-notes.md'); writeFileSync(notes, NOTES.join('\n'));
    cli('add', '--statement', 'Give the figure exactly as the document states.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'CITED:allow=0');
    cli('ratify-close', '--work-type', 'writing');
    cli('build', '--name', 'quay');
    // a writer that uses what it is served: the exact figure where it was given one, a guess where it was not
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: `<work>${UNSERVED}</work>` }, emit_plan: PLAN },
      when: [{ containsAll: ['emit_piece', '$4.27 million'], answer: { piece: `<work>${SERVED}</work>` } }] }) });
    const out = cli('invoke', '--skill', 'quay', 'Write a post on the harbour works.', '--with', `notes=${notes}`, '--json', '--claims', 'pattern', '--no-questions', '--no-repair', ...be());
    const j = JSON.parse(out.slice(out.indexOf('{'))) as { output: string; plan: unknown };
    expect(j.plan).not.toBeNull();
    const writer = (await log()).filter((b) => b.includes('emit_piece')).pop() ?? '';
    // each point with the words it comes from and the name of the file that holds them
    expect(writer).toContain('from \\"notes\\", in its words: \\"The new pontoon takes twelve small boats at a time\\"');
    expect(writer).toContain('Leave no bracketed slot for me to fill');
    expect(writer).toContain('$4.27 million');
    // the points the plan left out are not served
    expect(NOTES.filter((n) => writer.includes(n.slice(0, 40)))).toEqual([NOTES[1], NOTES[3], NOTES[6]]);
    expect(WORD.filter((w) => writer.includes(w)).length).toBeLessThanOrEqual(4);
    // the step is met, and the work uses no more than four of the ten points
    expect(j.output).toContain('$4.27 million');
    expect(WORD.filter((w) => j.output.includes(w)).length).toBeLessThanOrEqual(4);
    expect(JSON.stringify(j)).not.toMatch(/the figure \$4\.1 million is in neither/);
  });
});
