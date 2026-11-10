// tests/atelier-consumers.test.ts — EVERY ARTIFACT A BUILD WRITES HAS A NAMED READER, OR IS RETIRED.
//
// The persona was served to the writer as rules and buried the voice; the fix stopped serving it, and it stayed built on
// every skill, paid for, and read by nothing on the default run. No test noticed: the tests that guarded its use
// followed the compiled path. Here a skill is built and run the default way with the store traced (core/state/trace.ts),
// and every file and voice field the build wrote is held to this table: read on the default run, or named with the
// reader it has elsewhere. A new artifact with no entry fails; so does an entry that says "default" and is not read, or
// one that says "elsewhere" and is read (the table would be lying). Expected values are written out by hand.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
}, 60_000);
afterAll(() => { backend.kill(); });
const setBackend = (b: unknown): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(b) });

/** Read on the default run (`atelier run`, the direct writer). */
const DEFAULT = ['skills/*/active.json', 'skills/*/versions/*.json', 'skills/*/standards/*.json', 'skills/*/packages/*.json', 'skills/*/ledgers/*.json',
  'skills/*/voice.json', 'skills/*/method.md', 'skills/*/exemplar.md', 'skills/*/exemplar-request.txt', 'skills/*/step-ledger.json',
  'skills/*/fidelity/active.json', 'skills/*/fidelity/releases/*.json', 'skills/*/fidelity/profiles/*.json', 'skills/*/fidelity/retrieval/*.json',
  // a skill built with no method note: its steps read off the pieces are read on the piece (core/direct/style.ts)
  'skills/*/method-inferred.json',
  // the build's count of each habit over the pieces, named by the version's receipt: which habits the style reading asks
  'skills/*/moves/h.json', 'skills/*/receipts/*.json',
  // what the work is (core/direct/card.ts): told to the editor's questions
  'skills/*/card.json'];
/** Written at build and read elsewhere, by the reader named. */
const ELSEWHERE: Readonly<Record<string, string>> = {
  'runs/*': 'the build\'s own run folder: read by the build steps that follow and by `atelier inspect`',
  'sessions/*': 'the run in flight in this project: read by the next command of the build',
  '<project>/.claude/*': 'the skill installed for a host (Claude Code loads SKILL.md and its examples)',
  'skills/*/units/*.json': 'the compiled path only',
  'skills/*/contrast.json': 'SKILL.md for a host and `atelier optimize`',
  'skills/*/architectures/*.json': '`atelier check`, `fix`, `improve`, `optimize`',
  'skills/*/evals/*.json': '`atelier eval`',
  'skills/*/fidelity/profile.json': '`atelier verify`, `fidelity`, `score`',
  'skills/*/method-keep.json': 'the build\'s later stages and the next build: which lines of the method note a model read as steps',
  'skills/*/frozen-checks.json': 'the next method build: checks kept while their step and examples are unchanged',
  'skills/*/form.txt': 'the compiled path (what form a reply takes)',
  'skills/*/moves/persona-*.json': 'the next build: the profile kept for this persona, read again only when the pieces or the reading change',
  // a build that reads the pieces with a model
  'skills/*/evidence.json': 'the skill card (`atelier status --skill`)',
  'skills/*/signals.json': 'the compiled path\'s draft choice and `atelier verify`',
  'skills/*/fidelity/retrieval.json': 'the compiled path, `atelier voice` and `fidelity`',
  'skills/*/floor/state.json': '`atelier floor`, `tend`, `fix`, `optimize`, `tells` and the next build',
};
/** Voice fields written at build and read elsewhere. (The persona is read on the default run by core/direct/style.ts.) */
const VOICE_ELSEWHERE: Readonly<Record<string, string>> = {
  lengthSpan: 'the compiled path and SKILL.md\'s length line',
  lengthWords: 'SKILL.md\'s length line',
  servedWhole: 'SKILL.md for a host',
  pieceBudget: 'the next build (the piece budget the owner chose is kept) and the compiled path\'s answer examples',
};


/**
 * EVERY READING HAS A PLACE IT RUNS (core/inference/reading.ts). `run`: the default run asks for it; `build`: a build
 * that feeds the default run asks for it; `command`: a named command other than run; `lab`: the compiled path only
 * (`--pipeline legacy`, `--deep`), frozen: no new reading lands there. A new reading with no entry fails, and so does an
 * entry the traced builds and runs contradict.
 */
const READINGS: Readonly<Record<string, readonly ['run' | 'build' | 'command' | 'lab', string]>> = {
  'piece-route': ['run', 'which of the author\'s pieces the writer is shown (cli/direct.ts)'],
  'editor-questions': ['run', 'what an editor would ask before the draft; only answers reach the writer'],
  'style-read': ['run', 'how the author writes, read on the piece (core/direct/style.ts)'],
  'request-latitude': ['run', 'how strictly this request holds the piece, before routing'],
  latitude: ['build', 'how strictly the skill holds output, read at build'],
  'intent-mode': ['build', 'what the skill is for, on the screen of `atelier new`'],
  'work-form': ['build', 'whether the work is a reply or a document; routes a reply to the compiled path'],
  'purpose-card': ['build', 'what the work is, read off the pieces: told to the editor\'s questions'],
  'method-infer': ['build', 'the steps read off the pieces with no method: read on the piece by the style reading'],
  'step-check': ['build', 'the check each of the owner\'s steps asks for; the checks run on every default run'],
  'step-check-repair': ['build', 'a written check that failed the owner\'s examples, repaired'],
  'step-mutants': ['build', 'the mutants that qualify a written check before it may block'],
  'rule-polarity': ['build', 'whether a step is a prohibition or a thing to do; also `fix --always`, `mine`'],
  'method-units': ['build', 'which prose sentences beside a method list are steps; what each step asks is the compiled path\'s'],
  'rule-effect': ['build', 'a several-author build: what each writer\'s rule does'],
  'unit-kind': ['build', 'the kind of each finished piece, at intake'],
  'persona-moves': ['build', 'how often each habit holds over the pieces: which habits the style reading asks'],
  'persona-table': ['build', 'the count of each habit in each piece, for the same'],
  'fix-scope': ['command', '`atelier fix`: which sentences a fix may change'],
  'own-words': ['command', '`atelier fix`, and the compiled path: the author\'s own words kept'],
  'draft-examples': ['command', '`atelier skill --draft-examples`'],
  'move-realisation': ['lab', 'moves read on the work'], 'move-cases': ['lab', 'the moves placed by the brief'],
  'execution-brief': ['lab', 'the brief'], questions: ['lab', 'the compiled path\'s questions'], 'question-gaps': ['lab', 'the same'],
  'piece-plan': ['lab', 'the plan before the draft'], 'gap-lines': ['lab', 'a deep run'], 'enrich-queries': ['lab', 'a deep run\'s web search'],
  'fact-inventory': ['lab', 'a deep run'], 'angle-fit': ['lab', 'a deep run'], 'angle-choice': ['lab', 'a deep run'],
  'rendition-prior': ['lab', 'a deep run, and `new --deep`'], 'story-loops': ['lab', 'a deep run, and `new --deep`'], 'story-novelty': ['lab', 'the same'],
  'review-inventory': ['lab', 'the deep gate'], 'review-verdict': ['lab', 'the deep gate'], 'review-pairwise': ['lab', 'the deep gate'], 'review-fix-check': ['lab', 'the deep gate'],
};
/** Every model call the default run may make, by the tool it answers with, and what reads its answer. */
const RUN_CALLS: Readonly<Record<string, string>> = {
  emit_piece: 'the draft', emit_review: 'the one self-review', emit_piece_route: 'piece-route', emit_style_read: 'style-read',
  emit_editor_questions: 'editor-questions', emit_request_latitude: 'request-latitude', emit_specifics: 'the specifics listed beside the piece',
};

/** The readings declared in the source, by id: a parser of the code's form (a declaration and its id field). */
function declaredReadings(): string[] {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []));
  const ids: string[] = [];
  for (const f of [...walk('cli'), ...walk('core')].filter((f) => !f.endsWith(join('inference', 'reading.ts')))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/Reading<[^>]*(?:<[^>]*>[^>]*)*>\s*(?:=|\{)/g)) {
      const id = /\bid:\s*(?:'([^']+)'|`([^`]+)`)/.exec(src.slice(m.index, m.index + 1500));
      ids.push(id ? (id[1] ?? id[2]) : `(no id) ${f}`);
    }
  }
  return ids;
}

const PERSONA = { points: [
  { aspect: 'stance', description: 'Opens from a position of my own, not a summary.', frequency: 'ALWAYS', quote: 'I would start with the riskiest line.' },
  { aspect: 'close', description: 'Closes on a short plain instruction.', frequency: 'OFTEN', quote: 'Tests first, then the rest.' },
] };
const NOTE = 'How I write\n\n1. Open with the problem.\n2. Keep three paragraphs per section.\n3. End on an idea.\n';
const post = (i: number): string => `---\nrequest: Write about tool ${i}.\n---\n# Tool ${i}\n\nI would start with the riskiest line. ${'The tool keeps notes local and syncs when asked. '.repeat(6)}\n\nTests first, then the rest.\n`;
const glob = (p: string): RegExp => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

interface Traced { readonly written: Set<string>; readonly read: Set<string>; readonly voiceRead: Set<string>; readonly voiceWritten: string[];
  /** the model calls, by tool, of the build and of the default run; and the readings asked for by id */
  readonly buildCalls: Set<string>; readonly runCalls: Set<string>; readonly buildReadings: Set<string>; readonly runReadings: Set<string> }
type Build = 'method' | 'examples' | 'discovery';
const factor = (description: string) => ({ description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['p1.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' });
async function traced(how: Build): Promise<Traced> {
  const withMethod = how === 'method';
  const data = mkdtempSync(join(tmpdir(), 'atelier-consumers-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-consumers-proj-'));
  mkdirSync(join(proj, 'posts')); for (let i = 1; i <= ({ method: 4, examples: 3, discovery: 8 } as const)[how]; i++) writeFileSync(join(proj, 'posts', `p${i}.md`), post(i));
  writeFileSync(join(proj, 'method.md'), NOTE);
  const trace = (n: string): string => join(data, `trace-${n}.txt`);
  const run = (t: string, ...a: string[]): void => {
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_TRACE_STORE: t,
      // the reader of specifics a person with a key has by default: without it the run's calls were one short
      ATELIER_CLAIMS: 'model', ATELIER_CLAIMS_MODEL: 'scripted' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ATELIER_CONTEXT_READER;
    execFileSync('node', [CLI, ...a, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] });
  };
  await setBackend({ byTool: { emit_persona: PERSONA, emit_holds_back: { ids: [] },
    // what the work is, read at the build and told to the editor's questions on the run
    emit_purpose_card: { kind: 'a post on a tool', kindQuote: 'I would start with the riskiest line', reader: null, readerQuote: null, purpose: 'Says where to start.', settles: ['where to start'] },
    // discovery: the rules read off the pieces, matched and observed on the pieces held back, then accepted
    emit_factors: { factors: [factor('Lead with the decision, then the reasoning.'), factor('Close on a plain instruction.')] },
    emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }, { leftIndex: 1, matchedRightIndex: 1 }] },
    emit_observation: { applicable: true, present: true, why: 'seen' },
    emit_piece: { piece: 'I would start with the riskiest line. The tool keeps notes local. Tests first, then the rest.' } } });
  if (how === 'discovery') {
    run(trace('read'), 'new', 'posts', 'write posts like these', '--name', 'posts');
    run(trace('build'), 'new', 'posts', 'write posts like these', '--name', 'posts', '--accept');
  } else run(trace('build'), 'new', 'posts', ...(withMethod ? ['--method', 'method.md'] : ['write posts like these']), '--name', 'posts', '--yes');
  await setBackend({ byTool: { __plain: ['# Tool\n\nA draft.', '# Tool\n\nI would start with the riskiest line. Reviewed.'], emit_specifics: { specifics: [] } } });
  // as a person runs it, with no flag that turns a reader off
  run(trace('run'), 'invoke', '--skill', 'posts', 'Write about tool 9.', '--json');
  const norm = (p: string): string => p.replace(`${data}/`, '').replace(proj, '<project>').replace(/^runs\/[^/]+\/.*/, 'runs/*').replace(/^sessions\/.*/, 'sessions/*')
    .replace(/^<project>\/\.claude\/.*/, '<project>/.claude/*').replace(/^skills\/[^/]+\//, 'skills/*/').replace(/[0-9a-f]{12,}/g, 'h');
  const lines = (n: string): string[] => (existsSync(trace(n)) ? readFileSync(trace(n), 'utf8').split('\n').filter(Boolean) : []);
  const of = (n: string, k: string): string[] => lines(n).filter((l) => l.startsWith(`${k} `)).map((l) => l.slice(2));
  const voice = JSON.parse(readFileSync(join(data, 'skills', 'posts', 'voice.json'), 'utf8')) as Record<string, unknown>;
  return {
    written: new Set([...of('read', 'W'), ...of('build', 'W')].map(norm)), read: new Set(of('run', 'R').map(norm)),
    voiceRead: new Set(of('run', 'F').filter((f) => f.split('#')[0].endsWith('/voice.json')).map((f) => f.split('#')[1])),
    voiceWritten: Object.keys(voice),
    buildCalls: new Set([...of('read', 'C'), ...of('build', 'C')]), runCalls: new Set(of('run', 'C')),
    buildReadings: new Set([...of('read', 'X'), ...of('build', 'X')]), runReadings: new Set(of('run', 'X')),
  };
}

const declared = (p: string): 'default' | 'elsewhere' | null => {
  const g = (x: string): boolean => glob(x.replace(/h/g, 'h')).test(p) || glob(x).test(p.replace(/\bh\b/g, '*'));
  if (DEFAULT.some(g)) return 'default';
  if (Object.keys(ELSEWHERE).some(g)) return 'elsewhere';
  return null;
};

// Three pieces with no method: built from the pieces as they are (cli/commands/new.ts), the persona read from them.
describe.each([['a method build', 'method'], ['a build from three examples alone', 'examples'], ['a build that reads eight pieces with a model, accepted', 'discovery']] as const)('%s, then a default run', (_, how) => {
  let t: Traced;
  beforeAll(async () => { t = await traced(how); }, 240_000);
  it('every file the build wrote is named: read on the default run, or read elsewhere by the reader the table names', () => {
    expect([...t.written].filter((p) => declared(p) === null)).toEqual([]);
  });
  it('what the table says the default run reads, it reads; what it says is read elsewhere, the default run does not', () => {
    const wrote = [...t.written];
    expect(wrote.filter((p) => declared(p) === 'default' && !t.read.has(p) && ![...t.read].some((r) => glob(p.replace(/\bh\b/g, '*')).test(r)))).toEqual([]);
    expect(wrote.filter((p) => declared(p) === 'elsewhere' && t.read.has(p))).toEqual([]);
  });
  it('every model call of the default run is named with what reads it; every reading asked for runs where the table says', () => {
    expect([...t.runCalls].filter((c) => !(c in RUN_CALLS))).toEqual([]);
    expect([...t.runReadings].filter((r) => READINGS[r]?.[0] !== 'run')).toEqual([]);
    expect([...t.buildReadings].filter((r) => !['build', 'run'].includes(READINGS[r]?.[0] ?? ''))).toEqual([]);
  });
  it('every voice field is read on the default run, or named with its reader elsewhere; and the table is true', () => {
    expect(t.voiceWritten.filter((k) => !t.voiceRead.has(k) && !(k in VOICE_ELSEWHERE))).toEqual([]);
    expect(Object.keys(VOICE_ELSEWHERE).filter((k) => t.voiceRead.has(k))).toEqual([]);
  });
});

describe('every reading in the source has a place it runs', () => {
  it('each declared reading is in the table, and the table names no reading the source does not declare', () => {
    const ids = declaredReadings();
    expect(ids.filter((id) => !(id in READINGS))).toEqual([]);
    expect(Object.keys(READINGS).filter((id) => !ids.includes(id))).toEqual([]);
  });
  it('the default run asks for the readings the table puts on it', async () => {
    const t = await traced('examples');
    for (const id of ['piece-route', 'editor-questions', 'style-read']) expect(t.runReadings).toContain(id);
    // what the work is: read at the build, written, and read by the run's editor questions
    expect(t.buildReadings).toContain('purpose-card');
    expect(t.written).toContain('skills/*/card.json');
    expect(t.read).toContain('skills/*/card.json');
  }, 240_000);
});
