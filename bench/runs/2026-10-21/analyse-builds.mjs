// Tests 1 and 11, read off the kept build screens: per step, the column each build gave it (measure / written /
// judgement), whether a written check qualified, and the standard hash. Writes arms/builds/summary.json.
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { HERE } from './lib.mjs';

const out = {};
for (const fixture of ['claims', 'labels']) {
  const builds = [1, 2, 3].map((n) => {
    const t = readFileSync(join(HERE, 'arms', 'builds', fixture, `build-${n}.txt`), 'utf8');
    const steps = [...t.matchAll(/^ {3}(\d+)\. (measure|written|judgement)(.*)$/gm)].map((m) => ({ step: Number(m[1]), column: m[2], qualified: m[2] === 'written' ? /; qualified:/.test(m[3]) : null, draws: /\[(\d) of 3 draws\]/.exec(m[3])?.[1] ?? null }));
    const hash = /Standard ([0-9a-f]{16}) minted/.exec(t)?.[1] ?? null;
    const reader = /read 3 times by ([\w-]+)/.exec(t)?.[1] ?? null;
    return { build: n, hash, reader, steps, measurable: steps.filter((s) => s.column === 'measure').length, written: steps.filter((s) => s.column === 'written').length,
      writtenQualified: steps.filter((s) => s.qualified).length, judgement: steps.filter((s) => s.column === 'judgement').length };
  });
  const nSteps = Math.max(...builds.map((b) => b.steps.length));
  const perStep = Array.from({ length: nSteps }, (_, i) => { const cols = builds.map((b) => b.steps.find((s) => s.step === i + 1)?.column ?? '-');
    const q = builds.map((b) => b.steps.find((s) => s.step === i + 1)?.qualified); return { step: i + 1, columns: cols, same: new Set(cols).size === 1, qualified: q }; });
  out[fixture] = { builds: builds.map(({ steps, ...b }) => b), perStep, stepsSameColumn: perStep.filter((s) => s.same).length, of: nSteps,
    sameHash: new Set(builds.map((b) => b.hash)).size === 1, distinctHashes: new Set(builds.map((b) => b.hash)).size };
}
// i-have-adhd: built with `atelier skill` from the SKILL.md text (no finished examples exist); its screen lists rules,
// not steps of a method, and says which carry a written check.
{
  const builds = [1, 2, 3].map((n) => {
    const t = readFileSync(join(HERE, 'arms', 'builds', 'adhd', `build-${n}.txt`), 'utf8');
    const rules = [...t.matchAll(/^ {2}(\d+)\. \[(do |don't)\s*\] (.*)$/gm)].map((m) => m[3]);
    const withCheck = (t.match(/a check was written for it/g) ?? []).length;
    return { build: n, hash: /StandardVersion ([0-9a-f]{16})/.exec(t)?.[1] ?? null, rules: rules.length, writtenChecks: withCheck, writtenQualified: 0,
      codeChecked: Number(/(\d+) of \d+ checked by code/.exec(t)?.[1] ?? NaN), instructing: /NOTHING HERE INSTRUCTS THE MODEL YET/.test(t) ? 0 : null, ruleTexts: rules };
  });
  out.adhd = { builds, sameHash: new Set(builds.map((b) => b.hash)).size === 1, distinctHashes: new Set(builds.map((b) => b.hash)).size };
}
writeFileSync(join(HERE, 'arms', 'builds', 'summary.json'), JSON.stringify(out, null, 1));
for (const f of ['claims', 'labels']) {
  console.log(`\n${f}: ${out[f].stepsSameColumn} of ${out[f].of} steps in the same column in all 3 builds; distinct hashes ${out[f].distinctHashes}`);
  for (const b of out[f].builds) console.log(`  build ${b.build}: measure ${b.measurable} · written ${b.written} (qualified ${b.writtenQualified}) · judgement ${b.judgement} · ${b.hash}`);
  for (const s of out[f].perStep.filter((x) => !x.same)) console.log(`  step ${s.step}: ${s.columns.join(' / ')}`);
}
console.log(`\nadhd: distinct hashes ${out.adhd.distinctHashes}`); for (const b of out.adhd.builds) console.log(`  build ${b.build}: ${b.rules} rules, ${b.writtenChecks} written checks, ${b.codeChecked} code-checked, ${b.hash}`);
