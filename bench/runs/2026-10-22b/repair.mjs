// Test 4 (repair safety): `atelier verify --skill claims <defect> --repair --json` with the material bound, on the
// build chosen for the later tests (see RESULTS.md). Before and after are scored by check.mjs; every figure of the
// material that the input carried must still be in the output, and the claims of the input are compared sentence by
// sentence with the output's (added, dropped, negated). Writes arms/repair/claims.jsonl and the repaired texts.
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cli, parseJson, ledger, log, spend, totalLine, overBudget, buildOf, meterAnswers, CONNECTION, DOMAINS, HERE, SCRATCH, WRITER } from './lib.mjs';
import { stripFront, withArgs, summarise } from './verify.mjs';

const build = Number(process.argv[2] ?? 1);
const b = buildOf('claims', build);
const { check } = await import(join(DOMAINS, 'claims', 'check.mjs'));
const material = join(DOMAINS, 'claims', 'examples', 'e01.material');
const figuresOf = (t) => (t.replace(/^#{1,4}.*$/gm, '').match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? []).map((x) => x.replace(/,/g, ''));
const matFigures = new Set(readdirSync(material).flatMap((f) => figuresOf(readFileSync(join(material, f), 'utf8'))));
const sentences = (t) => t.replace(/^#{1,4}.*$/gm, '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const NEG = /\b(?:not|no|never|none|declined|does not|is not)\b/i;
const outDir = join(HERE, 'arms', 'repair'); mkdirSync(outDir, { recursive: true });
const rows = [];
for (const f of readdirSync(join(DOMAINS, 'claims', 'defects')).sort()) {
  if (overBudget()) { log('budget reached; repair stops'); break; }
  if (!(await meterAnswers())) { log('meter does not answer; repair stops'); process.exit(4); }
  const before = stripFront(readFileSync(join(DOMAINS, 'claims', 'defects', f), 'utf8'));
  const tmp = join(SCRATCH, 'verify-in', `repair-${f}`); mkdirSync(join(SCRATCH, 'verify-in'), { recursive: true }); writeFileSync(tmp, before);
  const s0 = spend().total;
  const r = cli(['verify', '--skill', 'claims', tmp, ...withArgs(material), '--repair', '--json', '--model', WRITER], { data: b.data, tag: `repair:${f}` });
  if (!r.stdout.trim() && CONNECTION.test(r.stderr)) { log(`repair ${f}: connection error, stopped (not a result)`); process.exit(4); }
  const j = parseJson(r.stdout);
  const after = j?.text ?? j?.repaired ?? j?.output ?? null;
  if (after) writeFileSync(join(outDir, f.replace('.md', '.repaired.md')), after);
  writeFileSync(join(outDir, f.replace('.md', '.json')), r.stdout);
  const oBefore = check(before, { id: 'e01' }).fails; const oAfter = after ? check(after, { id: 'e01' }).fails : null;
  const keptFigs = after ? [...new Set(figuresOf(before).filter((n) => matFigures.has(n)))].filter((n) => !figuresOf(after).includes(n)) : null;
  const sb = sentences(before); const sa = after ? sentences(after) : [];
  const dropped = after ? sb.filter((x) => !sa.includes(x)) : null; const added = after ? sa.filter((x) => !sb.includes(x)) : null;
  const negFlip = after ? added.filter((a) => { const twin = dropped.find((d) => d.slice(0, 25) === a.slice(0, 25)); return twin && NEG.test(twin) !== NEG.test(a); }) : null;
  const row = { defect: f, exit: r.status, stateAfter: j?.state ?? null, oracleBefore: oBefore, oracleAfter: oAfter, materialFiguresLost: keptFigs,
    sentencesDropped: dropped, sentencesAdded: added, negationFlips: negFlip, summary: summarise(j), keys: j ? Object.keys(j) : null, meterUsd: spend().total - s0, stderr: r.stderr };
  rows.push(row);
  log(`repair ${f}: state ${row.stateAfter}, oracle ${oBefore.length}->${oAfter?.length ?? '?'}, figures lost ${keptFigs?.length ?? '?'}; ${totalLine()}`);
}
writeFileSync(join(outDir, 'claims.jsonl'), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
ledger({ step: 'test4', build, repairs: rows.length, meterUsd: rows.reduce((a, x) => a + x.meterUsd, 0) });
