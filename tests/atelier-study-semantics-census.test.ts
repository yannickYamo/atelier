// #1 AND #10 AS A GUARD RATHER THAN A PROMISE.
//
// A rule stated in a commit message decays; a census does not. The split this repo just closed —
// research-quality machinery in bespoke scripts, product-quality machinery in the system — reopens
// the moment somebody reimplements one semantic constant in a runner "just for this study".
//
// So the SEMANTIC RULES have exactly one home. A study script may choose parameters: which
// behaviour, how many contexts, how many generations, which arms, the seed, where output lands. It
// may not decide what counts as a duplicate, what counts as fired, what counts as valid, or how an
// interval is computed.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', '.github'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mjs|js)$/.test(e)) out.push(p);
  }
  return out;
};

/** Each rule, and the ONE file entitled to state it. */
const OWNED: readonly { readonly rule: RegExp; readonly owner: string; readonly what: string }[] = [
  { rule: /0\.35/, owner: 'core/contract/diversity.ts', what: 'the near-duplicate ceiling' },
  { rule: /\[\*_\]\{0,2\}/, owner: 'core/contract/study.ts', what: 'the numbered-list observer' },
  // NOT "0.975 appears once": that is a t-quantile in core/stats/t.ts, a DIFFERENT estimator with
  // its own owner, and a census that conflated the two would report a defect that is not one. The
  // distinctive marker of THIS estimator is resampling with replacement.
  { rule: /Math\.floor\(rnd\(\) \* /, owner: 'core/contract/analysis.ts', what: 'resampling with replacement' },
];

describe('a semantic rule has one owner, and a study script is not it', () => {
  const files = walk(ROOT).map((p) => ({ path: p.slice(ROOT.length), src: readFileSync(p, 'utf8') }));

  for (const { rule, owner, what } of OWNED) {
    it(`${what} is stated only in ${owner}`, () => {
      const offenders = files
        .filter((f) => rule.test(f.src))
        .map((f) => f.path)
        // A test may assert on a rule; it may not be a second implementation of one.
        .filter((p) => p !== owner && !p.startsWith('tests/'));
      expect(offenders, `${what} is reimplemented outside its owner`).toEqual([]);
    });
  }

  it('A STUDY RUNNER DECIDES NOTHING — it may choose parameters, never rules', () => {
    // The boundary the migration exists to establish. A runner that computes an overlap, a
    // percentile, a resample or a validity has forked the instrument, and the fork is what let a
    // paper measure something a user could not run.
    const FORBIDDEN: readonly { readonly re: RegExp; readonly what: string }[] = [
      { re: /Math\.floor\([a-z]*rnd[a-zA-Z]*\(\) \* /, what: 'a resample loop' },
      { re: /0\.975|0\.025/, what: 'a percentile index' },
      { re: /intersection|inter \/ \(|jaccard/i, what: 'an overlap computation' },
      { re: /stop_reason|max_tokens'/, what: 'a validity decision' },
    ];
    const runners = files.filter((f) => /^studies\/.*\.(mjs|js|ts)$/.test(f.path));
    const offenders = runners.flatMap((f) =>
      FORBIDDEN.filter((x) => x.re.test(f.src)).map((x) => `${f.path}: ${x.what}`));
    expect(offenders, 'a study runner implements a rule that core/contract must own').toEqual([]);
  });

  it('the owning modules actually exist and export the rule, so the census is not vacuous', () => {
    // Without this, deleting an owner would make every check above pass trivially.
    for (const { owner } of OWNED) {
      expect(files.some((f) => f.path === owner), `${owner} is missing`).toBe(true);
    }
  });

  it('no runner reimplements execution validity from output text', () => {
    // The precise line that produced a retracted finding: `text.trim() ? 'COMPLETE' : 'EMPTY'`.
    const offenders = files
      .filter((f) => !f.path.startsWith('tests/'))
      .filter((f) => /trim\(\)\s*\?\s*'COMPLETE'/.test(f.src))
      .map((f) => f.path)
      // run.ts IS the owner: the line lives inside `validityFrom`, which is the function every
      // other caller was moved onto. Flagging the owner would make the census unsatisfiable.
      .filter((p) => p !== 'core/contract/run.ts');
    expect(offenders, 'completeness inferred from text rather than reported by the provider').toEqual([]);
  });
});
