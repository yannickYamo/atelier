// cli/commands/score.ts — ONE NUMBER FOR HOW WELL A TEXT MEETS A SKILL'S RATIFIED STANDARD, WITH NO MODEL.
//
//   atelier score --skill house-style --task brief.md draft.md
//   atelier score --skill house-style --task "Write the launch note" --material notes.md draft.md --json
//
// An evaluator for search and comparison (bench/compare/): GEPA, SkillOpt and the plain arms are scored
// with it beside the outside benchmark's own judge. It is deterministic by construction: no model is
// called, whatever the environment says. The claim check is the pattern check (`--claims pattern`
// semantics), and the context judge is off.
//
// THE FORMULA. Four components, each in [0, 1], combined with fixed weights:
//
//   required  0.4  REQUIRED measured rules MET / REQUIRED measured rules that applied (MET or VIOLATED;
//                  NOT_APPLICABLE and conditional rules are not counted). The standard's own lines only:
//                  the product's floor lines (UNSOURCED…, FORMAT…) are scored below, not here.
//   claims   0.3  1 / (1 + k), k = the spans the pattern claim check flagged on the gating UNSOURCED line
//                  (an invented story, quotation, attribution or figure not in the task or material).
//                  Specifics a `list` format only lists for checking (UNSOURCED·check) are not counted.
//   format   0.1  1 when the FORMAT line holds, 0 when it is broken; present only when the skill's class
//                  (or --class) names a known format.
//   range    0.2  the share of qualified steering bands (RULE and SIGNAL roles) the text sits inside, read
//                  on the active release's fidelity profile (readFidelity, inBandShare); present only when
//                  the skill has a profile and at least one steering band measured the text.
//
//   score = Σ w·c / Σ w, over the components present (the weights are renormalised over what applies).
//
// A score, not a gate: it exits 0 whatever the number, and 2 when it could not score.

import { readFileSync, existsSync } from 'node:fs';
import * as store from '../../core/state/store.js';
import * as fstore from '../../core/state/fidelity-store.js';
import { checkDraftAsync } from '../../core/loop/run-repair.js';
import { readFidelity, inBandShare } from '../../core/fidelity/profile.js';
import { checkClass } from '../../core/observers/doc-class.js';
import type { VerifyReport } from '../../core/observers/verify.js';
import type { FidelityReading } from '../../core/fidelity/types.js';
import { checksFor } from '../checks.js';
import { DATA, argv, flag, positional, assertSkillName } from '../runtime.js';

/** The fixed weights. Changing one changes every score ever compared, so it is a new formula, not a tweak. */
export const SCORE_WEIGHTS = { required: 0.4, claims: 0.3, format: 0.1, range: 0.2 } as const;
export type ScoreComponent = keyof typeof SCORE_WEIGHTS;

export const SCORE_FORMULA = 'score = (0.4·required + 0.3·claims + 0.1·format + 0.2·range) / (sum of the weights of the components present); '
  + 'required = REQUIRED measured rules MET / applicable; claims = 1/(1+k), k = invented specifics the pattern claim check flagged; '
  + 'format = 1 if the FORMAT line holds else 0; range = share of steering bands the text sits inside (readFidelity on the active profile)';

/** The product's own floor lines: scored as claims and format, never as the owner's REQUIRED rules. */
const FLOOR = /^(?:UNSOURCED|FORMAT)(?:·|$)/;

export interface ScoreLine {
  readonly id: string;
  readonly statement: string;
  readonly materiality: string | null;
  readonly verdict: string;
  /** the component this line counts toward, or null when it is reported only */
  readonly counts: ScoreComponent | null;
  readonly spans: number;
  readonly detail: string;
}

export interface ScoreResult {
  readonly score: number;
  readonly components: Partial<Record<ScoreComponent, number>>;
  /** the weights after renormalising over the components present */
  readonly weights: Partial<Record<ScoreComponent, number>>;
  readonly perRequirement: readonly ScoreLine[];
}

const r4 = (x: number): number => Math.round(x * 10000) / 10000;

/** The score of a checked text. Pure: the same report and reading give the same number. */
export function scoreOf(report: VerifyReport, reading: FidelityReading | null): ScoreResult {
  const components: Partial<Record<ScoreComponent, number>> = {};
  const lines: ScoreLine[] = [];
  let met = 0; let applicable = 0;
  for (const c of report.checked) {
    const floor = FLOOR.test(c.requirementId);
    let counts: ScoreComponent | null = null;
    if (!floor && c.materiality === 'REQUIRED' && (c.result.verdict === 'MET' || c.result.verdict === 'VIOLATED')) {
      counts = 'required'; applicable += 1; if (c.result.verdict === 'MET') met += 1;
    }
    if (c.requirementId === 'UNSOURCED') {
      counts = 'claims';
      components.claims = r4(1 / (1 + (c.result.verdict === 'VIOLATED' ? Math.max(1, c.result.spans.length) : 0)));
    }
    if (c.requirementId === 'FORMAT') {
      counts = 'format';
      components.format = c.result.verdict === 'VIOLATED' ? 0 : 1;
    }
    lines.push({ id: c.requirementId, statement: c.statement, materiality: c.materiality, verdict: c.result.verdict, counts,
      spans: c.result.spans.length, detail: c.result.detail });
  }
  if (applicable) components.required = r4(met / applicable);
  const share = reading ? inBandShare(reading) : null;
  if (share !== null) components.range = share;
  const present = (Object.keys(SCORE_WEIGHTS) as ScoreComponent[]).filter((k) => components[k] !== undefined);
  const total = present.reduce((n, k) => n + SCORE_WEIGHTS[k], 0);
  const weights: Partial<Record<ScoreComponent, number>> = {};
  for (const k of present) weights[k] = r4(SCORE_WEIGHTS[k] / total);
  // Nothing applies only when the claim check was off; score cannot turn it off, so this is a guard.
  const score = total ? r4(present.reduce((n, k) => n + SCORE_WEIGHTS[k] * (components[k] ?? 0), 0) / total) : 0;
  return { score, components, weights, perRequirement: lines };
}

/** A flag that names a file is read; anything else is the text itself. */
const fileOrText = (v: string): string => (existsSync(v) ? readFileSync(v, 'utf8') : v);

export async function score(): Promise<void> {
  const name = assertSkillName(flag('--skill') ?? fail('--skill <name> required: atelier score --skill <name> --task <file-or-text> <text-file>'));
  const taskArg = flag('--task') ?? fail('--task <file-or-text> required: the brief the text answers. Its details are the writer\'s to repeat, so the claim check needs it.');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? fail(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? fail(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? fail(`standard ${sv.standardVersionHash} is missing.`);
  const cls = checkClass(store.getDocClass(L), flag('--class'));
  if (!cls.ok) fail(cls.why);
  const classNote = cls.ok ? cls.note : null;
  const file = positional([name]);
  let text: string;
  if (file && file !== '-') {
    if (!existsSync(file)) fail(`there is no file at ${file}.`);
    text = readFileSync(file, 'utf8');
  } else {
    if (process.stdin.isTTY) fail('give it a file, or pipe the text in: atelier score --skill <name> --task <file-or-text> draft.md');
    let data = '';
    for await (const chunk of process.stdin) data += (chunk as Buffer).toString();
    text = data;
  }
  if (!text.trim()) fail('there is no text to score.');
  const task = fileOrText(taskArg);
  const materialFile = flag('--material');
  if (materialFile && !existsSync(materialFile)) fail(`there is no material file at ${materialFile}.`);
  const material = [task, materialFile ? readFileSync(materialFile, 'utf8') : '', ...store.getMaterial(L).map((m) => m.text)].filter(Boolean).join('\n\n');
  const checks = checksFor(L, { material, task, guardClaims: true, offline: true });
  const report = await checkDraftAsync(name, v, text, checks);
  const activeRelease = fstore.getActiveRelease(L);
  const profile = (activeRelease?.release.profileHash ? fstore.getProfile(L, activeRelease.release.profileHash) : null) ?? fstore.getProfile(L);
  const reading = profile ? readFidelity(text, profile) : null;
  const result = scoreOf(report, reading);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ score: result.score, components: result.components, weights: result.weights, perRequirement: result.perRequirement,
      skill: name, standardVersionHash: v.standardVersionHash, profileHash: profile?.hash ?? null, formula: SCORE_FORMULA }, null, 1));
    return;
  }
  console.log(`score ${result.score.toFixed(4)}  (${name}, standard ${v.standardVersionHash.slice(0, 12)})`);
  for (const k of Object.keys(SCORE_WEIGHTS) as ScoreComponent[]) {
    const c = result.components[k];
    console.log(`  ${k.padEnd(9)} ${c === undefined ? 'n/a    ' : c.toFixed(4)}  weight ${result.weights[k]?.toFixed(4) ?? '-'}`);
  }
  for (const l of result.perRequirement.filter((x) => x.counts && x.verdict === 'VIOLATED')) console.log(`  broken: ${l.id}  ${l.statement}  (${l.detail})`);
  if (!profile) console.log('  (no fidelity profile: the range component does not apply)');
  if (classNote) console.log(`  (${classNote})`);
  console.log(`\n${SCORE_FORMULA}`);
}

/** Exit 2: could not score. A score is never an exit code. */
const fail = (m: string): never => { console.error(`atelier: ${m}`); process.exit(2); };
