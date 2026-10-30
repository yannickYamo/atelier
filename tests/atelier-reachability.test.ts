// tests/atelier-reachability.test.ts — THE MODULES ARE ON THE PATH A USER TAKES.
//
// Every module here was built, tested, and called by nothing outside its own tests. That is the
// shape of the failure this programme has now paid for twice: reservation existed as code while the
// corpus it should have protected was spent, and blind-spot detection existed while a standard was
// ratified with a whole layer missing. Green tests over unreachable code is a status report, not a
// fact.
//
// These assertions are about the CALL SITE, not about capability.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const walkTree = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkTree(join(d, e.name)) : [join(d, e.name)]);

const cliSource = (): string => {
  // The CLI is a TREE now — dispatch in atelier.mts, one file per command group, shared ground in
  // runtime.ts. These assertions are about what the CLI DOES, not which file it happens to live in,
  // so they read the whole tree and stay true across a refactor.
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
  return walk('cli').filter((f) => /\.(ts|mts)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
};

const cli = cliSource();

describe('reservation is on the intake path, not beside it', () => {
  it('is imported and CALLED by the CLI', () => {
    expect(cli).toMatch(/from '\.\.\/core\/golden\/reservation\.js'/);
    expect(cli).toMatch(/reserve\(goldenUnits, reserveIds/);
  });

  it('happens at INTAKE, before the corpus is sealed', () => {
    const at = cli.indexOf('reserve(goldenUnits');
    const sealed = cli.indexOf("step(s, 'CORPUS_SEALED'");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(sealed);        // a split chosen later is not a holdout
  });

  it('SAYS SO when nothing is reserved — the silent case is what cost us the last corpus', () => {
    expect(cli).toMatch(/NOTHING RESERVED/);
    expect(cli).toMatch(/It cannot be done/);
  });

  it('the reserve is ENFORCED where discovery reads, on BOTH paths', () => {
    // filtering items alone is not enough: the chain splits `goldens` into proposal and held-out
    // sets, and a reserved piece left in that list is read by the observer.
    expect(cli).toMatch(/const openItems = items\.filter\(\(i\) => !reservedIds\.has\(i\.id\)\)/);
    expect(cli).toMatch(/const openGoldens = importPlan\.goldens\.filter\(\(g\) => !reservedIds\.has\(g\.contextId\)\)/);
    expect(cli).toMatch(/runDiscoveryChain\(client, budget, 'skill', openItems, openGoldens/);
    expect(cli).toMatch(/openItems\.filter\(\(i\) => goldenIds\.has\(i\.id\)\)/);   // fallback path
  });

  it('never passes the unfiltered corpus to discovery', () => {
    expect(cli).not.toMatch(/runDiscoveryChain\([^)]*\bitems,\s*importPlan\.goldens/);
  });
});

describe('the cluster rule is on the intake path, not beside it', () => {
  it('intake derives clusters instead of using the file', () => {
    expect(cli).toMatch(/clusterAssignment\(goldenFiles\.map/);
    expect(cli).toMatch(/clusterId: clusters\.clusterOf\(r\.file\)/);
    expect(cli).not.toMatch(/clusterId: r\.file/);       // the regression, pinned out
  });

  it('says which rule it used and how many clusters resulted', () => {
    expect(cli).toMatch(/project cluster\(s\) \[\$\{clusters\.basis\}\]/);
    expect(cli).toMatch(/clusters\.why/);
  });
});

describe('coverage and blind spots reach the human', () => {
  it('both are imported and called at ratification', () => {
    // module, not path depth — the CLI is a tree and a relative depth is a refactor artifact
    expect(cli).toMatch(/core\/coverage\/standard-coverage\.js/);
    expect(cli).toMatch(/core\/coverage\/blind-spot\.js/);
    expect(cli).toMatch(/coverageOf\(left,/);
    expect(cli).toMatch(/blindSpotsOf\(/);
  });

  it('the blind-spot question is asked BEFORE approval, not after', () => {
    const q = cli.indexOf('Before you approve any of these');
    const forEach = cli.indexOf("For each: APPROVE");
    expect(q).toBeGreaterThan(-1);
    expect(q).toBeLessThan(forEach);
  });
});

describe('a decision that is not an approval is still a decision', () => {
  it('the ledger can say DECIDED_NOT_A_REQUIREMENT', async () => {
    const { appendDecision, survival } = await import('../core/ratification/decision-record.js');
    const req = { requirementId: 'g1', statement: 's', appliesWhen: 'GENERAL', kind: 'GENERATIVE' as const,
      authority: 'DERIVED_UNRATIFIED' as const, provenance: 'MACHINE_DISCOVERED' as const,
      evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null };
    let l = { standardDraftHash: 'd', records: [] as never[] } as Parameters<typeof appendDecision>[0];
    l = appendDecision(l, req, 'DECIDED_NOT_A_REQUIREMENT', { note: 'PREFERRED', decidedAt: 'now' });
    l = appendDecision(l, { ...req, requirementId: 'g2' }, 'APPROVE', { decidedAt: 'now' });
    const s = survival(l);
    // survival counts REQUIREMENTS; decidedRate counts whether the pass is finished. They differ,
    // and conflating them reported a completed pass as 45% done.
    expect(s.survivalRate).toBe(0.5);
    expect(s.decidedRate).toBe(1);
    expect(s.decidedNotRequirement).toBe(1);
    expect(s.deferred).toBe(0);
  });
});

// ── THE CENSUS. THE ONE ASSERTION THAT CAN SEE A MODULE NOBODY REMEMBERED ────────────────────
//
// Every block above names a module and checks its call site. That method can only cover what
// someone thought to add, which is exactly the wrong shape for this defect: a module goes dark by
// being FORGOTTEN, and a guard written from memory forgets it too. When this file was audited it was
// passing while eight modules, about 1,292 lines, were reachable from nothing but their own tests.
//
// So this walks the real import graph from the real entry point and demands the set of unreachable
// modules equal a list written down here. The list is empty: the seven modules it once held (two veto
// instruments, the conditional-fidelity scorer, the move reader, the boundary answer, the abstraction
// check, the evaluation-only feature family) left the codebase
// after they were measured as negative results. A module may
// leave the codebase or be parked here with its reason; it may not go dark silently.
const PARKED: Readonly<Record<string, string>> = {};

describe('the census: nothing is dark by accident', () => {
  // Deliberately parked, with the reason. Anything in PARKED is code we are keeping and not yet serving,
  // and a name in that list is a claim someone made on purpose. The reason is not decoration: the
  // difference between "parked" and "forgotten" is that somebody can read why. Nothing is parked today.

  const resolveImports = (file: string, src: string): string[] =>
    [...src.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => {
      const base = join(file, '..', m[1]).replace(/\.js$/, '');
      for (const ext of ['.ts', '.mts']) if (existsSync(base + ext)) return base + ext;
      return '';
    }).filter(Boolean);

  const reachableFromCli = (): Set<string> => {
    const seen = new Set<string>();
    const visit = (f: string): void => {
      if (seen.has(f) || !existsSync(f)) return;
      seen.add(f);
      for (const next of resolveImports(f, readFileSync(f, 'utf8'))) visit(next);
    };
    visit(join('cli', 'atelier.mts'));
    return seen;
  };

  const shipped = (): string[] => ['core', 'renderers', 'adapters', 'providers']
    .flatMap((d) => walkTree(d)).filter((f) => f.endsWith('.ts'));

  it('every shipped module is reachable from `atelier`, or is on the parked list with a reason', () => {
    const reachable = reachableFromCli();
    const dark = shipped().filter((f) => !reachable.has(f));
    const undeclared = dark.filter((f) => !(f in PARKED));
    const staleParks = Object.keys(PARKED).filter((f) => !dark.includes(f));

    expect(undeclared, `dark and undeclared — wire it, delete it, or park it with a reason:\n${undeclared.join('\n')}`).toEqual([]);
    // A parked entry that became reachable is a list telling a story the code no longer tells.
    expect(staleParks, `parked but actually reachable; remove from PARKED:\n${staleParks.join('\n')}`).toEqual([]);
  });

  it('the parked list is empty, and stays so: a module is served or it leaves the tree, never kept dark', () => {
    // An entry here would be code kept on main that no command runs.
    expect(Object.keys(PARKED)).toEqual([]);
  });

  // POLARITY. A census that has never been watched fail is a census reporting its own emptiness.
  it('and it can actually see a dark module', () => {
    const reachable = reachableFromCli();
    // core/state/canonical-state.ts is unambiguously on the path; a fake sibling is not.
    expect(reachable.has(join('core', 'state', 'canonical-state.ts'))).toBe(true);
    expect(reachable.has(join('core', 'state', 'no-such-module.ts'))).toBe(false);
    expect(shipped().length).toBeGreaterThan(60);        // the walk found the tree, not one file
    expect(reachable.size).toBeGreaterThan(60);          // and the graph, not one node
  });
});

// ─── ONE LEVEL DOWN: EXPORTED VALUES NOTHING CALLS ─────────────────────────────────────────────
//
// The census above is at MODULE granularity, which is the claim this repository makes publicly. It
// has a blind spot: a module can be reachable while an exported function inside it is called by
// nothing at all. `evaluatePairedQualityFloor` sits in a reachable file, and a reader who greps for
// it finds a quality floor that no path evaluates.
//
// So the same rule applies to values: wired, deleted, or listed here with a reason. Types are out of
// scope — an exported type with no internal consumer is ordinary for a published package, and a type
// cannot be dark in the way a function can.

const PARKED_VALUES: Readonly<Record<string, string>> = {
  'core/structure/features.ts:structureSamples':
    'Feature samples for selection, used by the structure reader\'s qualification harness. '
    + 'Wired into discovery only if the reader qualifies.',
  'core/convergence/state-machine.ts:PHASES':
    'The ordered phase list. The machine branches on phases individually; this is the enumeration a '
    + 'caller would iterate, and no caller iterates them yet.',
  'core/discovery/chain/construct-scope.ts:resolveScope':
    'Deterministic scope resolution. The single-principal authority model has no scopes, so nothing '
    + 'queries one. Kept because the organizational version needs exactly this and its semantics '
    + '(UNKNOWN_SCOPE rather than a permissive default) are the part worth not re-deciding later.',
  'core/discovery/chain/discovery-contract.ts:partitionByProvenance':
    'Partitions candidates by citation membership instead of aborting the batch. The chain currently '
    + 'refuses whole runs rather than splitting them, so no site partitions yet.',
  'core/discovery/chain/discovery-orchestration.ts:assertProspective':
    'Refuses a product claim built on cached evidence. No claim path consumes ingest outcomes yet, '
    + 'which is why it is uncalled rather than why it is unnecessary.',
    'core/discovery/chain/taste-factor.ts:canVeto':
    'LAW 4: only a calibrated, ratified factor may veto. The veto mechanism itself is parked one '
    + 'level up, so its precondition has nothing to gate.',
  'core/discovery/chain/taste-factor.ts:isRepairApplicable':
    'Whether a repair operator is qualified beyond the case it was born on. Repair qualification is '
    + 'recorded but not yet consulted at a decision site.',
  'core/discovery/conformance.ts:describeConformance':
    'The human-readable conformance report. The CLI prints its own summary; this is the fuller one '
    + 'that prints the gap on a pass as well as a failure, and no command calls it.',
  'core/distinctiveness/floor.ts:requireFrozenEntry':
    'Fails closed on a missing frozen baseline. Nothing looks up a frozen entry yet, because no '
    + 'contract dimension has reached ENFORCE.',
  'core/distinctiveness/floor.ts:evaluatePairedQualityFloor':
    'The paired composite floor. Parked for the same reason: with no dimension at ENFORCE there is '
    + 'no bundle to evaluate. This is the function a reader is most likely to mistake for wired.',
  'core/distinctiveness/floor.ts:explainFloor':
    'The one line a person reads from a floor result. Nothing produces a floor result to explain.',
  'core/measurement/longitudinal.ts:evidenceAcross':
    'Every requirement worst-evidenced first. The controller reads evidence one requirement at a '
    + 'time; the whole-standard view has no caller.',
  'core/contract/analysis.ts:seededShuffle':
    'Blinding permutation for study rounds, used by an evaluation harness against dist/, never by a command.',
  'core/coverage/blind-spot.ts:BLIND_SPOT_AUTHORITY':
    'What the blind-spot signal may support, stated as data. The CLI asks the question; nothing yet reads the limits.',
  'core/coverage/candidate-support.ts:MATERIALITY_QUESTION':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/candidate-support.ts:TOLERANCE_QUESTION':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/candidate-support.ts:assertNotSampleSize':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/candidate-support.ts:compilesAsExemplar':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/candidate-support.ts:compilesAsRequirement':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/candidate-support.ts:describeSupport':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/candidate-support.ts:protectsRatherThanGenerates':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/candidate-support.ts:readSiteEvidence':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/candidate-support.ts:summariseCounterEvidence':
    'Candidate support (core/coverage/candidate-support.ts): what recurrence across discovery cells may claim. Discovery reports counts; this fuller reading has no command yet.',
  'core/coverage/observation.ts:autonomousPromotionAllowed':
    'Whether a promotion may run without the owner. Promotion is always the owner\'s today, so nothing asks.',
  'core/coverage/standard-coverage.ts:assertCoverageIsNotAuthority':
    'Refuses an authority claim built on coverage. No claim path consumes coverage yet.',
  'core/coverage/standard-coverage.ts:signalsFromObservations':
    'Coverage signals from held-out chain observations. Coverage is computed from what discovery records; this wiring has no caller yet.',
  'core/delivery/carrier-delivery.ts:assertMatrix':
    'Checks a whole carrier-delivery matrix. Single claims are checked where they are made; no command builds a matrix.',
  'core/discovery/chain/discovery-contract.ts:discoverySummary':
    'The user-facing headline for a discovery run. The CLI prints its own summary; this one has no command.',
  'core/distinctiveness/contract.ts:MARGIN_SEMANTICS':
    'The distinctiveness floor contract. Parked with evaluatePairedQualityFloor: no contract dimension has reached ENFORCE, so nothing approves, converts or checks one.',
  'core/distinctiveness/contract.ts:approveFloor':
    'The distinctiveness floor contract. Parked with evaluatePairedQualityFloor: no contract dimension has reached ENFORCE, so nothing approves, converts or checks one.',
  'core/distinctiveness/contract.ts:revalidate':
    'The distinctiveness floor contract. Parked with evaluatePairedQualityFloor: no contract dimension has reached ENFORCE, so nothing approves, converts or checks one.',
  'core/distinctiveness/contract.ts:toQualityFloorContract':
    'The distinctiveness floor contract. Parked with evaluatePairedQualityFloor: no contract dimension has reached ENFORCE, so nothing approves, converts or checks one.',
  'core/distinctiveness/floor.ts:evaluateQualityFloor':
    'The distinctiveness floor contract. Parked with evaluatePairedQualityFloor: no contract dimension has reached ENFORCE, so nothing approves, converts or checks one.',
  'core/distinctiveness/floor.ts:requireFloorContract':
    'The distinctiveness floor contract. Parked with evaluatePairedQualityFloor: no contract dimension has reached ENFORCE, so nothing approves, converts or checks one.',
  'core/fidelity/rule-observer.ts:NO_PROXY':
    'The explicit no-proxy observer for a rule. No rule proxy is authored by a command yet, so nothing names the empty one.',
  'core/golden/golden-unit.ts:clusterCertainty':
    'Golden-unit governance (core/golden): reached through reserve() at intake; this part of the reserve\'s bookkeeping has no call site yet.',
  'core/golden/golden-unit.ts:isRegisteredKind':
    'Golden-unit governance (core/golden): reached through reserve() at intake; this part of the reserve\'s bookkeeping has no call site yet.',
  'core/golden/golden-unit.ts:usableAsReference':
    'Golden-unit governance (core/golden): reached through reserve() at intake; this part of the reserve\'s bookkeeping has no call site yet.',
  'core/golden/reservation.ts:markConsumed':
    'Golden-unit governance (core/golden): reached through reserve() at intake; this part of the reserve\'s bookkeeping has no call site yet.',
  'core/golden/reservation.ts:reserveFromUse':
    'Golden-unit governance (core/golden): reached through reserve() at intake; this part of the reserve\'s bookkeeping has no call site yet.',
  'core/inference/capability.ts:assertSemanticQualification':
    'Refuses SEMANTIC_DISCOVERY_QUALIFIED without a human label set. No command sets that state yet.',
  'core/measurement/observation.ts:authorityOf':
    'Maps an instrument\'s earned permission to observation authority. No instrument has earned one through a command yet.',
  'core/observers/grammar.ts:resetGrammar':
    'Test hook: forgets the loaded grammar engine between tests. The process loads it once and never resets.',
  'core/ratification/decision-record.ts:HISTORICAL_SURVIVAL_INFERRED':
    'The historical 12 -> 8 survival figure, inferred from id gaps and typed apart so it is never pooled with recorded decisions; nothing reads it.',
  'core/reference/arms.ts:ALL_ARMS':
    'The reference arms of the baseline study (core/reference/arms.ts). No command runs the comparison.',
  'core/reference/arms.ts:NEEDS_HUMAN_INPUT':
    'The reference arms of the baseline study (core/reference/arms.ts). No command runs the comparison.',
  'core/reference/arms.ts:TREATMENT':
    'The reference arms of the baseline study (core/reference/arms.ts). No command runs the comparison.',
  'core/stats/sign-test.ts:clopperPearson':
    'Exact binomial interval named by the qualification plans; no command reports it.',
};

describe('an exported value nothing calls is wired, deleted, or listed with a reason', () => {
  // Line comments first: a line comment that names a glob (`examples/*.md`) would otherwise open a block comment that
  // runs to the next `*/` and hide every real use between them.
  const strip = (s: string): string =>
    s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  const srcFiles = ['core', 'cli', 'renderers', 'adapters', 'providers']
    .flatMap((d) => walkTree(d)).filter((f) => /\.m?ts$/.test(f));
  // This file names every parked value in PARKED_VALUES. Counting those as uses would make each
  // entry immediately "referenced" and flip the whole census to stale — the list would erase its own
  // subject. A census must not read itself.
  // Tests are not read at all. A value only a test calls is still dark: the test proves it works, not
  // that a user command reaches it. Test hooks and study code are parked above with that reason.
  const bodies = new Map(srcFiles.map((f) => [f, strip(readFileSync(f, 'utf8'))]));

  /** Values (not types) exported from src and referenced by no other src file, nor inside their own. */
  const darkValues = (): string[] => {
    const out: string[] = [];
    for (const f of srcFiles) {
      const self = bodies.get(f) ?? '';
      for (const m of self.matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)) {
        const n = m[1];
        const re = new RegExp(`\\b${n}\\b`);
        const elsewhere = [...bodies].some(([g, b]) => g !== f && re.test(b));
        const own = (self.match(new RegExp(`\\b${n}\\b`, 'g')) ?? []).length - 1;
        if (!elsewhere && own === 0) out.push(`${f}:${n}`);
      }
    }
    return out.sort();
  };

  it('the census can see exports at all', () => {
    // Polarity: a regex that stopped matching would make every assertion below vacuous.
    const anyExport = srcFiles.some((f) => /^export (?:async )?(?:function|const) /m.test(bodies.get(f) ?? ''));
    expect(anyExport).toBe(true);
    expect(srcFiles.length).toBeGreaterThan(80);
  });

  it('every dark value is declared, and nothing is declared that is actually wired', () => {
    const dark = darkValues();
    // A module already parked whole is disclosed at that granularity; do not require it twice.
    const inParkedModule = (k: string): boolean => k.split(':')[0] in PARKED;
    // Some values carry their own written "no call site yet" note at the definition.
    const selfDeclared = (k: string): boolean => {
      const [f, n] = k.split(':');
      const raw = readFileSync(f, 'utf8');
      const at = raw.search(new RegExp(`^export (?:async )?(?:function|const|class) ${n}\\b`, 'm'));
      if (at < 0) return false;
      const preamble = raw.slice(Math.max(0, at - 900), at);
      return /not currently called|no call site yet|nothing called it/i.test(preamble);
    };

    const undeclared = dark.filter((k) => !(k in PARKED_VALUES) && !inParkedModule(k) && !selfDeclared(k));
    const stale = Object.keys(PARKED_VALUES).filter((k) => !dark.includes(k));

    expect(undeclared, `exported and called by nothing — wire it, delete it, or park it:\n${undeclared.join('\n')}`)
      .toEqual([]);
    expect(stale, `listed as dark but something now calls it; remove from PARKED_VALUES:\n${stale.join('\n')}`)
      .toEqual([]);
  });
});

// ─── WHAT A RUN LINKS ────────────────────────────────────────────────────────────────────────
//
// The module census above counts type imports as reaching: `import type` is erased by tsc and loads
// nothing, which is right for "is this module part of the product" and wrong for "what does a run
// load". A run is `invoke`. It once value-imported `runOnce` from cli/commands/improve.ts, which
// value-imports the convergence controller, the floor and the diagnosis, so every run linked the whole
// outer loop to write one draft. The draft writer lives in core/loop/run-once.ts now, and this walks
// value imports only, from invoke, and names the directories a run must not reach.
describe('a run links only what a draft needs', () => {
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /**
   * Relative imports that load a module, in either quote style: `from`, `import()`, and a bare `import './x.js'` for
   * its side effects. `import type`, `export type` and a specifier list that is all `type` are erased by tsc and skipped.
   */
  const valueImports = (file: string, src: string): string[] => {
    const body = strip(src)
      .replace(/^\s*import\s+type\s[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
      .replace(/^\s*export\s+type\s[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
      .replace(/^\s*import\s+\{(?:\s*type\s+\w+(?:\s+as\s+\w+)?\s*,?)+\s*\}\s*from\s+['"][^'"]+['"];?/gm, '');
    const specs = [
      ...body.matchAll(/from\s+['"](\.[^'"]+)['"]/g),
      ...body.matchAll(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g),
      ...body.matchAll(/^\s*import\s+['"](\.[^'"]+)['"]/gm),
    ].map((m) => m[1]);
    return specs.map((spec) => {
      const base = join(file, '..', spec).replace(/\.js$/, '');
      for (const ext of ['.ts', '.mts']) if (existsSync(base + ext)) return base + ext;
      return '';
    }).filter(Boolean);
  };
  const linkedFrom = (root: string): Set<string> => {
    const seen = new Set<string>();
    const visit = (f: string): void => {
      if (seen.has(f) || !existsSync(f)) return;
      seen.add(f);
      for (const next of valueImports(f, readFileSync(f, 'utf8'))) visit(next);
    };
    visit(root);
    return seen;
  };

  it('invoke never links the outer loop: convergence, diagnosis, optimizer, comparison, evolve, reference, mining', () => {
    const linked = linkedFrom(join('cli', 'commands', 'invoke.ts'));
    const outer = ['convergence', 'diagnosis', 'optimizer', 'comparison', 'evolve', 'reference', 'mining'].map((d) => join('core', d) + '/');
    const reached = [...linked].filter((f) => outer.some((d) => f.startsWith(d))).sort();
    expect(reached, 'a run loads the outer loop to write a draft:\n' + reached.join('\n')).toEqual([]);
    // and the draft writer is what it links instead
    expect(linked.has(join('core', 'loop', 'run-once.ts'))).toBe(true);
    expect(linked.has(join('cli', 'commands', 'improve.ts'))).toBe(false);
  });

  it('and the walk can see a value import in every form, and skips a type-only one', () => {
    // POLARITY. improve.ts still links the controller by value; the controller's own type imports load nothing.
    expect(linkedFrom(join('cli', 'commands', 'improve.ts')).has(join('core', 'convergence', 'controller.ts'))).toBe(true);
    expect(valueImports('core/x.ts', [
      "import type { A } from './state/store.js';",
      'import type { B } from "./state/receipt.js";',
      "import { type C, type D as E } from './state/store.js';",
      "import { b } from './loop/repair.js';",
      'import { type F, g } from "./loop/claims.js";',
      'import "./loop/grounding.js";',
      "import './loop/integrity.js';",
    ].join('\n'))).toEqual(['repair', 'claims', 'grounding', 'integrity'].map((m) => join('core', 'loop', `${m}.ts`)));
  });
});

describe('automated delivery is on the path every door takes', () => {
  it('the consequence table decides the record every surface prints', () => {
    expect(cli).toMatch(/withDelivery\(buildRecord\(/);
    expect(cli).toMatch(/tableOf\(x\.std, level\)/);
  });
  it('invoke, run, verify and the hook act on the delivery', () => {
    // a run and a fix in place take one decision (core/eval/consequence.ts, `deliveryOutcome`): a BLOCK exits 1
    expect(cli).toMatch(/const \{ refused, exit, head \} = deliveryOutcome\(/);
    expect(readFileSync('core/eval/consequence.ts', 'utf8')).toMatch(/decided\?\.decision === 'BLOCK' \? 1 : 0/);
    expect(cli).toMatch(/record\.delivery\?\.decision === 'BLOCK'\) process\.exitCode = 1/);
    expect(cli).toMatch(/e\.record\.delivery \? e\.record\.delivery\.decision === 'BLOCK'/);
    expect(cli).toMatch(/decided\?\.decision === 'BLOCK' \? decided\.why/);
  });
  it('the owner sets a row with amend; pending runs and requalification are reachable, and rulings requalify', () => {
    expect(cli).toMatch(/parseConsequences\(consequenceAsked/);
    expect(cli).toMatch(/argv\.includes\('--pending'\)/);
    expect(cli).toMatch(/argv\.includes\('--requalify'\)/);
    expect((cli.match(/requalifySkill\(/g) ?? []).length).toBeGreaterThanOrEqual(3);   // report --requalify, rate, build
  });
});

describe('what is settled before the draft is on the run path', () => {
  it('the answers, the plan echo, and the owner\'s own words beside the copied-stretch check are called by the CLI', () => {
    expect(cli).toMatch(/readAnswers\(o\.answers, questions\)/);
    expect(cli).toMatch(/withoutPlanLines\(draft, plan\)/);
    // the echo pass is composed where the route has it on (core/loop/route.ts), with this request's notes and the plan
    expect(cli).toMatch(/isOn\('echo'\) \? \{ notes: requestNotes, say: completions, plan: before\?\.plan \?\? null \} : null\)/);
    expect(cli).toMatch(/copiedOwn: ownWords/);
    expect(cli).toMatch(/copiedRecord\(output, materialOnly, ownWords\)/);
  });
});

describe('a fix changes the piece in place, and what it took out stays out', () => {
  it('fix hands the run the piece to change; the run changes it in place; the whole-piece run reads what was taken out', () => {
    expect(cli).toMatch(/\.\.\.fixInPlaceArgs\(last, inv\.invocationId, complaint\)/);
    expect(cli).toMatch(/const fixed = await fixInPlace\(\{/);
    expect(cli).toMatch(/fixSpans\(c\.writer\(\), budget, piece, ids, instruction, removed, \{ material: c\.materialText, own \}\)/);
    expect(cli).toMatch(/readContext\(FIX_SCOPE, \{ instruction, sentences \}/);
    expect(cli).toMatch(/removedOfPiece\(L, correctionsOf\)/);
    expect(cli).toMatch(/\.\.\.\(removed \? \{ removed \} : \{\}\)/);
    expect(cli).toMatch(/for \(const l of result\.fix\?\.lines \?\? \[\]\) console\.log\(l\)/);
  });
  it('a fix is delivered as a run is, falls back whole on an error, and never bans the owner\'s own words', () => {
    expect(cli).toMatch(/const o = deliveryOutcome\(strictFix, fixed\.record\?\.delivery, fixed\.conformant, argv\.includes\('--allow-nonconformant'\)\)/);
    expect(cli).toMatch(/deliveryOutcome\(strict, decided, evaluation\?\.result\.conformant \?\? false/);
    expect(cli).toMatch(/if \(r\.error\) \{ c\.say\(/);
    expect(cli).toMatch(/own: ownWordsOf\(L, std\)/);
    expect(cli).toMatch(/reintroducedRuns\(r\.text, removed, piece, own\)/);
    expect(cli).toMatch(/authorRatesNote\(carried, ruledFeatures\(std\)\)/);
    expect(cli).toMatch(/signalChecks\(d\.output, profile, ruledFeatures\(std\)\)/);
  });
});
