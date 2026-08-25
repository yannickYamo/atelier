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
// modules equal a list written down here. Not "is anything dark" — dark code is sometimes a
// deliberate state — but "is anything dark that nobody decided to park". A module may leave the
// codebase or leave this list; it may not leave silently.
describe('the census: nothing is dark by accident', () => {
  // Deliberately parked, with the reason. Anything here is code we are keeping and not yet serving,
  // and a name in this list is a claim someone made on purpose. The reason is not decoration: the
  // difference between "parked" and "forgotten" is that somebody can read why.
  //
  // Two of the original eight were wired instead of parked, because both backed a claim already made
  // in public: the append-only ratification ledger, which the README names in its architecture block
  // while `ratify` was overwriting a mutable blob, and the held-out reference test, which the README
  // asks contributors to run and which had no command.
  const PARKED: Readonly<Record<string, string>> = {
    'core/fidelity/conditional-fidelity.ts':
      'MEASUREMENT INFRASTRUCTURE, PARKED ON PURPOSE UNTIL A STUDY USES IT. It replaces the adherence '
      + 'endpoint that failed three times: COMPLETE defined as absence of violations, over conditional '
      + 'rules, scored 100% for every arm across 138 outputs including a base model that won 3 of 46 '
      + 'contexts, because silence buys an N/A and an N/A cannot be violated. The replacement moves WHO '
      + 'decides applicability: the expert seals it per context before any output exists, and the scorer '
      + 'only rules on whether the behaviour appeared. Wiring it to a command before a study has sealed '
      + 'cases would invent a CLI surface for data that does not exist yet, and the protocol it serves '
      + 'says explicitly to stop after building the instrument. 24 polarity fixtures pin it in both '
      + 'directions, including the exact output the old endpoint scored perfect and this one fails.',
    'core/ratification/boundary-answer.ts':
      'Wireable and not yet decided. It fits `atelier confirm --rule <id> --applies-when <condition>` '
      + 'almost exactly, which would give the CLI a scoping act distinct from the authority act it has '
      + 'today. That is a new product surface, not a repair, and it wants a deliberate decision rather '
      + 'than being slipped in behind a reachability fix.',
    // These three declare their own status in their first line. The reasons below are READ from the
    // files, not invented here — an earlier version of this list guessed, and guessed wrong about the
    // two veto modules, calling frozen negative evidence a loose end that should be wired or deleted.
    'core/fidelity/veto-contract.ts':
      'DELIBERATELY DARK — FROZEN NEGATIVE EVIDENCE. v3\'s construct was not established '
      + '(V3_CONSTRUCT_NOT_ESTABLISHED). Kept unwired and untuned as the record of what was tried: two '
      + 'observer versions produced zero abstentions across 126 observations, and source inspection ruled '
      + 'out every mechanical explanation. Deleting it would destroy the evidence that the approach was '
      + 'tried and what it cost.',
    'core/fidelity/veto-sensor.ts':
      'DELIBERATELY DARK — FROZEN NEGATIVE EVIDENCE, same campaign as veto-contract. It has no test '
      + 'because it is a record rather than a component: testing an instrument whose construct was not '
      + 'established would assert behaviour nobody is entitled to rely on.',
    'core/discovery/chain/discrimination-probe.ts':
      'DELIBERATELY DARK — DEFERRED BY POLICY. Probes are not fired in the AUTONOMOUS_LOOP_READY '
      + 'milestone. The planner emits a ProbeSpec on the live path; turning one into a blind, '
      + 'counterbalanced, manipulation-checked pair is this module\'s job and happens the first time a '
      + 'probe actually runs.',
    'core/coverage/abstraction-check.ts':
      'A verdict type and an authority constant with no producer. The live coverage path reports weak '
      + 'support and blind spots without it. It is the smallest thing here and the least load-bearing.',
    'core/state/policy.ts':
      'Protocol policy resolution, forty-one lines, reachable only from the conformance test. Whether a '
      + 'protocol policy is a real axis or a generalisation nobody needed is still open.',
  };

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

  // ── A MODULE THAT DECLARES ITSELF DARK MUST STAY DARK ───────────────────────────────────────
  //
  // Three modules open with `DELIBERATELY DARK`. Two of them are FROZEN NEGATIVE EVIDENCE: a veto
  // instrument whose construct was not established, kept unwired as the record of what was tried and
  // what it cost. That status lived in a comment, which this project already knows is where a
  // guarantee goes to fail silently — and it did fail, quietly, in the other direction: the parked
  // list beside them once described them as a loose end to be wired or deleted, because whoever wrote
  // that list inspected the code instead of reading its first line.
  //
  // Both directions are now enforced. Wiring one of these onto the live path fails here, which forces
  // the conversation about re-establishing the construct rather than letting it happen in a refactor.
  // Removing the declaration while the module is still parked fails too, so the file and the list
  // cannot drift apart.
  it('a module declaring itself DELIBERATELY DARK is unreachable, and one that is parked says why', () => {
    const declared = shipped().filter((f) => readFileSync(f, 'utf8').startsWith('// DELIBERATELY DARK'));
    expect(declared.length, 'no module declares itself dark — the marker has changed').toBeGreaterThanOrEqual(3);

    const reachable = reachableFromCli();
    const wired = declared.filter((f) => reachable.has(f));
    expect(wired, `declared DELIBERATELY DARK and now on the live path:\n${wired.join('\n')}\n`
      + 'Reaching one of these is a decision, not a refactor. Remove the declaration in the same change '
      + 'that establishes the construct, and say so.').toEqual([]);

    // and every declared-dark module is accounted for in the parked list, with the reason quoted
    const unlisted = declared.filter((f) => !(f in PARKED));
    expect(unlisted, `declared dark but absent from PARKED: ${unlisted.join(', ')}`).toEqual([]);
    for (const f of declared) {
      expect(PARKED[f], `${f} is parked without quoting its own declared status`).toMatch(/DELIBERATELY DARK/);
    }
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
