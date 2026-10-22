// Tests 2 and 3 (recall named vs blocked; no false blocks), on every build of claims and labels: `atelier verify
// --json` on every golden example and every planted defect, with the example's material bound (--with name=file), and
// the domain's check.mjs as the oracle of what should be found. Writes arms/verify/<fixture>-b<n>.jsonl.
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { cli, parseJson, ledger, log, spend, totalLine, overBudget, meterAnswers, CONNECTION, methodStep, isStep, entries, DOMAINS, HERE, SCRATCH } from './lib.mjs';

const builds = entries().filter((e) => e.step === 'testA1' && e.build === 1 && e.standardHash && e.exit === 0 && e.fixture !== 'adhd'); // build 1 of each fixture, in its own data folder
// The METHOD STEP a planted defect breaks (by its number in method.md) and the oracle rule that finds it. A defect is
// named by its own step when a violated check's statement is that step's words, whatever id the build gave it.
export const EXPECT = {
  claims: { date: [8, 'R8c'], reserve: [5, 'R5'], exclusion: [3, 'R3b'], speculation: [7, 'R7'], uncited: [2, 'R2'] },
  labels: { 'firearms-floor': [5, 'R5'], high: [4, 'R4'], paraphrase: [17, 'R17'], span: [12, 'R12'], taxonomy: [1, 'R1'] },
};
/** Where a domain's goldens for test 3 are: its held-out folder, which no build reads; the examples only where it has none. */
export const goldens = (fixture) => (existsSync(join(DOMAINS, fixture, 'held-out')) ? 'held-out' : 'examples');
export const stripFront = (t) => t.replace(/^---\n[\s\S]*?\n---\n/, '');
export const withArgs = (dir) => readdirSync(dir).sort().flatMap((f) => ['--with', `${f.replace(/\.txt$/, '').replace(/-/g, ' ')}=${join(dir, f)}`]);
export function summarise(j) {
  if (!j) return null;
  const violated = (j.checked ?? []).filter((c) => c.result?.verdict === 'VIOLATED').map((c) => ({ id: c.requirementId, statement: c.statement, materiality: c.materiality, enforced: c.enforced ?? false, observer: c.observer, spans: (c.result.spans ?? []).slice(0, 3).map((s) => s.text.slice(0, 160)), detail: (c.result.detail ?? '').slice(0, 200) }));
  const recordFails = (j.record?.entries ?? []).filter((e) => e.result === 'FAIL').map((e) => ({ id: e.id, required: e.required, evidence: String(e.observation?.evidence ?? '').slice(0, 160) }));
  return { state: j.state, standard: j.standardVersionHash, failed: j.failed, violated, recordFails, certificate: j.certificate };
}

const main = async () => {
  for (const fixture of ['claims', 'labels']) {
    const { check } = await import(join(DOMAINS, fixture, 'check.mjs'));
    const files = [
      // A GOLDEN THE SKILL WAS NOT BUILT FROM: the domain's held-out pieces, never a served example verified against itself.
      ...readdirSync(join(DOMAINS, fixture, goldens(fixture))).filter((f) => f.endsWith('.md')).map((f) => ({ kind: 'golden', id: f.replace('.md', ''), path: join(DOMAINS, fixture, goldens(fixture), f), material: join(DOMAINS, fixture, goldens(fixture), f.replace('.md', '.material')) })),
      ...readdirSync(join(DOMAINS, fixture, 'defects')).map((f) => ({ kind: 'defect', id: 'e01', defect: f.split('.')[1], path: join(DOMAINS, fixture, 'defects', f), material: join(DOMAINS, fixture, 'examples', 'e01.material') })),
    ];
    for (const b of builds.filter((x) => x.fixture === fixture)) {
      if (existsSync(join(HERE, 'arms', 'verify', `${fixture}-b${b.build}.jsonl`))) continue; // kept from an earlier pass
      if (overBudget()) { log('budget reached; verify stops'); return; }
      if (!(await meterAnswers())) { log('meter does not answer; verify stops'); process.exit(4); }
      const rows = []; const before = spend().total;
      for (const f of files) {
        const text = stripFront(readFileSync(f.path, 'utf8'));
        const tmp = join(SCRATCH, 'verify-in', `${fixture}-${f.kind}-${f.defect ?? f.id}.txt`); mkdirSync(join(SCRATCH, 'verify-in'), { recursive: true }); writeFileSync(tmp, text);
        const r = cli(['verify', '--skill', fixture, tmp, ...withArgs(f.material), '--json'], { data: b.data, tag: `verify:${fixture}:b${b.build}` });
        if (!r.stdout.trim() && CONNECTION.test(r.stderr)) { log(`verify ${fixture} ${f.id}: connection error, stopped (not a result)`); process.exit(4); }
        const s = summarise(parseJson(r.stdout));
        const oracle = check(text, { id: f.id }).fails;
        const [n, rule] = f.defect ? EXPECT[fixture][f.defect] : [null, null];
        const stepText = n ? methodStep(fixture, n) : null;
        const hits = s && stepText ? s.violated.filter((v) => isStep(v.statement, stepText)) : [];
        const hit = hits.find((h) => h.spans.length) ?? hits[0] ?? null;
        rows.push({ fixture, build: b.build, kind: f.kind, id: f.id, defect: f.defect ?? null, exit: r.status, oracle, oracleFinds: rule ? oracle.some((x) => x.startsWith(rule)) : null,
          expectStep: n, expectStatement: stepText, stepIds: hit ? hits.map((h) => h.id) : [], named: Boolean(hit), namedWithPassage: Boolean(hit && hit.spans.length), stepEnforced: hit ? hits.some((h) => h.enforced) : null, blocked: s?.state === 'BLOCKED', ...s, stderr: r.stderr });
      }
      writeFileSync(join(HERE, 'arms', 'verify', `${fixture}-b${b.build}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
      ledger({ step: 'test2+3', fixture, build: b.build, verifies: files.length, meterUsd: spend().total - before });
      log(`verify ${fixture} b${b.build}: ${files.length} files; ${totalLine()}`);
    }
  }
};
mkdirSync(join(HERE, 'arms', 'verify'), { recursive: true });
if (process.argv[1].endsWith('verify.mjs')) await main();
