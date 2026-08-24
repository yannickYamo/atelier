// tests/atelier-carrier-delivery.test.ts — THE CARRIER REACHED THE MODEL, OR IT DID NOT.
//
// A public audit found the exact defect this project spent months learning to detect, one layer up from
// where the detector was looking. The package hash proves the BYTES on disk are the compiled bytes. It
// cannot see whether a carrier's SEMANTICS arrived, and for OUTPUT_CONTRACT they never did: the schema
// was compiled, written, installed, hashed, listed in delivery metadata and marked served, while every
// generation ran against a hardcoded `{piece: string}`.
//
// The end-to-end test below is the one that would have caught it. It does not check that the file
// exists; it captures the request the provider actually received and compares the schema in it with the
// contract that was compiled.

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { componentFor, type SkillArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';
import type { InferenceClient, InferenceRequest, Budget } from '../core/inference/client.js';
import {
  ATELIER_CLI_DELIVERY, assertDeliveryClaim, assertMatrix, describeMatrix, type Carrier,
} from '../core/delivery/carrier-delivery.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code/adapter.js';
import { CodexAdapter } from '../adapters/codex/adapter.js';
import { checkDelivery } from '../core/diagnosis/diagnose.js';
import { OpenAICompatibleInferenceClient, BACKEND_PRESETS } from '../providers/openai-compatible.js';
import { runOnce } from '../cli/commands/improve.js';
import * as store from '../core/state/store.js';
import { anInferenceResult, anInvocation, A_BINDING, aRequirement } from './fixtures.js';

const OUT_SHAPE = { verdict: { type: 'string' }, confidence: { type: 'number' } };

const req = (id: string, over: Partial<Requirement> = {}): Requirement =>
  aRequirement({ requirementId: id, statement: `rule ${id}`, materiality: 'PREFERRED', ...over });

const std = (reqs: Requirement[]): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId: 'e', workType: 'analysis', requirements: reqs,
  authorityState: 'RATIFIED', mintedAt: '2026-08-23T00:00:00Z', supersedes: null, reason: null,
});

const compiled = (reqs: Requirement[]) => {
  const v = std(reqs);
  const arch: SkillArchitecture = { architectureHash: 'ar', standardVersionHash: 'sv1', components: reqs.map(componentFor) };
  return { v, arch, pkg: renderAgentSkill(v, arch, 'skill', 'desc') };
};

/** Records the request the provider received. The only instrument that can settle delivery. */
const capturing = (): { client: InferenceClient; seen: () => InferenceRequest } => {
  let seen: InferenceRequest | null = null;
  return {
    seen: () => seen ?? (() => { throw new Error('nothing was requested'); })(),
    client: { complete: async (r: InferenceRequest) => { seen = r; return anInferenceResult({ json: { verdict: 'ok', confidence: 1 } }); } },
  };
};

const layout = (): store.StoreLayout => {
  const L = { root: mkdtempSync(join(tmpdir(), 'atelier-carrier-')), skillName: 'skill' };
  store.initStore(L);
  return L;
};

// ── P0. THE OUTPUT CONTRACT REACHES THE PROVIDER ─────────────────────────────────────────────
describe('an OUTPUT_CONTRACT constrains the generation, not just the directory', () => {
  const reqs = [req('g1'), req('g2', { materiality: 'REQUIRED', outputShape: OUT_SHAPE })];
  const { v, pkg } = compiled(reqs);
  const contractText = pkg.runtime['contracts/output.schema.json'];

  const invoke = async (contract: string | null) => {
    const L = layout();
    store.putStandard(L, v);
    const c = capturing();
    const budget: Budget = { spentUsd: 0, capUsd: 1 };
    const rec = await runOnce(
      L, { skillVersionHash: 'k1', standardVersionHash: 'sv1', architectureHash: 'ar' },
      pkg.runtime['SKILL.md'], 'p1',
      { expectedPackageHash: 'p1', servedPackageHash: 'p1', matched: true, servedFiles: Object.keys(pkg.runtime) },
      'a task', c.client, budget, A_BINDING, 'ORGANIC_USE', contract,
    );
    return { rec, sent: c.seen() };
  };

  it('the compiler emits the contract at all', () => {
    expect(contractText).toBeTruthy();
    expect(JSON.parse(contractText).properties).toEqual(OUT_SHAPE);
  });

  it('THE SCHEMA THE PROVIDER RECEIVED IS THE COMPILED CONTRACT', async () => {
    // The assertion the old code could not have passed. It ignores the package entirely and reads the
    // request object, because "the file is in the package" is what was true the whole time it was dark.
    const { sent } = await invoke(contractText);
    expect(sent.schema).toEqual(JSON.parse(contractText));
    expect(sent.toolName).toBe('emit_output');
  });

  it('and is NOT the free-text shape that used to run regardless', async () => {
    const { sent } = await invoke(contractText);
    expect(sent.schema).not.toHaveProperty('properties.piece');
  });

  it('records the proof as a hash comparison, not as a filename', async () => {
    const { rec } = await invoke(contractText);
    const c = rec.delivery.outputContract!;
    expect(c.enforced).toBe(true);
    expect(c.schemaHash).toBe(c.contractHash);
  });

  it('keeps the typed object whole instead of reading one field off it', async () => {
    // Under free text the output is a string on `.piece`. Under a contract it is an object, and
    // reaching for `.piece` would record an empty output as a successful run.
    const { rec } = await invoke(contractText);
    expect(JSON.parse(rec.output)).toEqual({ verdict: 'ok', confidence: 1 });
  });

  it('POLARITY — a package with no contract still generates free text, and says so', async () => {
    const { rec, sent } = await invoke(null);
    expect(sent.schema).toHaveProperty('properties.piece');
    expect(sent.toolName).toBe('emit_piece');
    // `null` is not the same as a contract that failed to arrive, and the diagnoser depends on that.
    expect(rec.delivery.outputContract).toBeNull();
  });

  it('REFUSES to run on an unparseable contract rather than falling back to free text', async () => {
    await expect(invoke('{ not json')).rejects.toThrow();
  });

  it('an unenforced contract routes as a SERVING failure, never as a taste problem', () => {
    const bad = anInvocation({ invocationId: 'i1', delivery: {
      expectedPackageHash: 'p1', servedPackageHash: 'p1', matched: true, servedFiles: [],
      outputContract: { artifact: 'contracts/output.schema.json', contractHash: 'aaa', schemaHash: 'bbb', enforced: false } } });
    expect(checkDelivery(bad)?.route).toBe('DELIVERY_FAILURE');
    const good = anInvocation({ invocationId: 'i2' });
    expect(checkDelivery(good)).toBeNull();
  });
});

// ── P0. A DELIVERY CLAIM MUST NAME A MECHANISM ───────────────────────────────────────────────
describe('DELIVERED may not be earned by an artefact existing', () => {
  it('refuses a basis that describes a file', () => {
    for (const basis of ['the file is written into the package', 'installed at .codex/skills', 'the schema exists on disk']) {
      expect(() => { assertDeliveryClaim('OUTPUT_CONTRACT', 'HOST_NATIVE', { state: 'DELIVERED', basis }); })
        .toThrow(/artefact, not a mechanism/);
    }
  });

  it('refuses an empty basis', () => {
    expect(() => { assertDeliveryClaim('PROSE', 'ATELIER_CLI', { state: 'DELIVERED', basis: '  ' }); }).toThrow(/no basis/);
  });

  it('says nothing about the weaker states, which are honest by construction', () => {
    expect(() => { assertDeliveryClaim('EXAMPLE', 'HOST_NATIVE', { state: 'REFERENCED_UNVERIFIED', basis: 'the file is named in SKILL.md' }); }).not.toThrow();
    expect(() => { assertDeliveryClaim('OUTPUT_CONTRACT', 'HOST_NATIVE', { state: 'UNSUPPORTED', basis: '' }); }).not.toThrow();
  });

  it('every shipped matrix passes its own guard', () => {
    expect(() => { assertMatrix('ATELIER_CLI', ATELIER_CLI_DELIVERY); }).not.toThrow();
    expect(() => { assertMatrix('HOST_NATIVE', new CodexAdapter().carrierDelivery()); }).not.toThrow();
    expect(() => { assertMatrix('HOST_NATIVE', new ClaudeCodeAdapter().carrierDelivery()); }).not.toThrow();
  });
});

// ── P0. HOSTS DECLARE WHAT THEY ACTUALLY HOLD ────────────────────────────────────────────────
describe('a host may not claim a carrier it cannot enforce', () => {
  for (const [name, host] of [['codex', new CodexAdapter()], ['claude-code', new ClaudeCodeAdapter()]] as const) {
    it(`${name} reports OUTPUT_CONTRACT as UNSUPPORTED, and does NOT degrade it to prose`, () => {
      const m = host.carrierDelivery();
      expect(m.OUTPUT_CONTRACT.state).toBe('UNSUPPORTED');
      // Degrading a schema to an instruction swaps a guarantee for a request the model can
      // half-satisfy while everything reports success. That is the weaker version the carrier replaces.
      expect(m.OUTPUT_CONTRACT.basis).not.toMatch(/prose|instruction|restat/i);
    });

    it(`${name} reports EXAMPLE as REFERENCED, not DELIVERED`, () => {
      // The state that keeps the fix honest. Naming the file in SKILL.md is a real mechanism and it is
      // not an observation: nobody has watched this host load one.
      expect(host.carrierDelivery().EXAMPLE.state).toBe('REFERENCED_UNVERIFIED');
    });

    it(`${name} delivers PROSE and SELF_CHECK on the host's own contract`, () => {
      const m = host.carrierDelivery();
      expect(m.PROSE.state).toBe('DELIVERED');
      expect(m.SELF_CHECK.state).toBe('DELIVERED');
    });
  }

  it('Atelier itself delivers all four when it owns the request', () => {
    for (const c of ['PROSE', 'SELF_CHECK', 'EXAMPLE', 'OUTPUT_CONTRACT'] as Carrier[]) {
      expect(ATELIER_CLI_DELIVERY[c].state).toBe('DELIVERED');
    }
  });

  it('reports the gap in words, including that the standard does not bend to the host', () => {
    const text = describeMatrix('codex', new CodexAdapter().carrierDelivery(), ['PROSE', 'OUTPUT_CONTRACT']);
    expect(text).toMatch(/OUTPUT_CONTRACT cannot be enforced here/);
    expect(text).toMatch(/standard is unchanged/);
  });
});

// ── P0. THE GUARD STOPPED CLAIMING ENFORCEMENT IT NEVER INSTALLED ────────────────────────────
describe('installProtocolGuards reports what it did, not what the host can do', () => {
  const policy = { canBuild: true, canReveal: false, canDiscover: true, reasonIfBlocked: 'recorded preference' };

  for (const [name, host] of [['codex', new CodexAdapter()], ['claude-code', new ClaudeCodeAdapter()]] as const) {
    it(`${name} returns NOT_INSTALLED, because it installs nothing`, () => {
      // Both adapters returned `{ installed: true, enforcedBy: 'BLOCKING_HOOK' }` as a literal. The
      // audit found it in one of them; it was identical in both, which makes it a contract defect
      // rather than a host bug.
      const g = host.installProtocolGuards(policy);
      expect(g.installed).toBe(false);
      expect(g.enforcedBy).toBe('NOT_INSTALLED');
      expect(g.artifact).toBeNull();
    });
  }

  it('ASSERTS AGAINST THE FILESYSTEM, not the return value', () => {
    // The return object is what lied. Checking it against itself is the check that failed to notice for
    // as long as the field existed, so this walks the installed tree instead.
    const dir = mkdtempSync(join(tmpdir(), 'atelier-guard-'));
    const { pkg } = compiled([req('g1')]);
    const host = new CodexAdapter();
    expect(host.install(pkg, dir).ok).toBe(true);
    host.installProtocolGuards(policy);

    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const written = walk(dir);
    expect(written.some((f) => /hook/i.test(f))).toBe(false);
    expect(existsSync(join(dir, '.codex', 'hooks'))).toBe(false);
    // So `installed: false` is the only answer the disk supports.
  });
});

// ── P1. EXAMPLES ARE NAMED WHERE A HOST WILL LOOK ────────────────────────────────────────────
describe('SKILL.md points at its reference material', () => {
  const conditional = req('g2', { materiality: 'PREFERRED', appliesWhen: 'the reader already knows the background' });
  const { pkg } = compiled([req('g1'), conditional]);
  const skillMd = pkg.runtime['SKILL.md'];

  it('names each example file', () => {
    expect(pkg.runtime['examples/g2.md']).toBeTruthy();
    // Before this, examples/*.md was written and mentioned nowhere a model would read. On Atelier's own
    // path that was fine — it composes them itself. On a host's path the file had no reason to be opened.
    expect(skillMd).toContain('examples/g2.md');
  });

  it('carries the condition beside the reference, so routing survives without context-map.json', () => {
    expect(skillMd).toMatch(/examples\/g2\.md.*when the reader already knows the background/);
  });

  it('does NOT restate the output contract as prose', () => {
    // THE STATEMENT IS DELIBERATELY WORDY. The first version of this test used `rule g3` as the
    // statement and asserted the SKILL.md did not contain "confidence" — a schema property name that
    // was never going to appear in a body built from that sentence. It passed while the real package
    // was restating the rule in full, and only the acceptance fixture, with a realistic statement,
    // showed it. A negative assertion is only worth what its subject would have contained.
    const statement = 'Every analysis ends with a verdict and a confidence.';
    const { pkg: withContract } = compiled([
      req('g3', { statement, materiality: 'REQUIRED', outputShape: OUT_SHAPE }),
    ]);
    const md = withContract.runtime['SKILL.md'];
    expect(withContract.runtime['contracts/output.schema.json']).toContain('confidence');
    // Having both gives one shape two owners, and the compiler chose the schema precisely because
    // prose describing a shape is the weaker version of it. Worse: on a host that cannot enforce the
    // schema, the surviving prose is a silent degradation the delivery matrix reports as UNSUPPORTED.
    expect(md).not.toContain(statement);
    expect(md).not.toContain('contracts/output.schema.json');
  });

  it('so a contract-only standard instructs the model in nothing, and that is the honest result', () => {
    const { pkg: only } = compiled([req('g4', { statement: 'Always end with a verdict.', materiality: 'REQUIRED', outputShape: OUT_SHAPE })]);
    expect(only.runtime['SKILL.md']).toContain('_(none)_');
    expect(only.runtime['contracts/output.schema.json']).toBeTruthy();
  });
});

// ── P1. THE TOKEN LIMIT SPELLING IS A BACKEND FACT ───────────────────────────────────────────
describe('one protocol, two spellings of the output token limit', () => {
  const send = async (o: Record<string, unknown>): Promise<Record<string, unknown>> => {
    let body: Record<string, unknown> = {};
    const real = globalThis.fetch;
    globalThis.fetch = (async (_u: string, init: { body: string }) => {
      body = JSON.parse(init.body) as Record<string, unknown>;
      return { ok: true, status: 200, json: async () => ({ model: 'm', choices: [{ finish_reason: 'stop', message: { tool_calls: [{ function: { arguments: '{}' } }] } }], usage: {} }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      await new OpenAICompatibleInferenceClient({ modelId: 'm', baseUrl: 'http://localhost:11434/v1', ...o })
        .complete({ stableBlock: 's', variableBlock: '', userMessage: 'go', toolName: 't', toolDescription: 'd', schema: {}, maxTokens: 77 });
    } finally { globalThis.fetch = real; }
    return body;
  };

  it('defaults to the spelling most backends accept', async () => {
    expect(await send({})).toMatchObject({ max_tokens: 77 });
  });

  it('sends the other one when the backend needs it', async () => {
    const b = await send({ tokenLimitParam: 'max_completion_tokens' });
    expect(b).toMatchObject({ max_completion_tokens: 77 });
    expect(b.max_tokens).toBeUndefined();
  });

  it('does not make the generic adapter less compatible to satisfy one vendor', () => {
    // The trade the preset table exists to avoid. Only the vendor that deprecated max_tokens gets the
    // other spelling; every other known backend keeps the widely-supported one.
    expect(BACKEND_PRESETS.openai.tokenLimitParam).toBe('max_completion_tokens');
    for (const name of ['groq', 'together', 'ollama']) {
      expect(BACKEND_PRESETS[name].tokenLimitParam).toBe('max_tokens');
    }
  });

  it('is part of the runtime binding, because it separates a working run from a rejected one', () => {
    expect(readFileSync('cli/runtime.ts', 'utf8')).toMatch(/parameters\.tokenLimitParam = tokenLimitParam/);
  });
});


// ── EVERY CARRIER MUST BE REACHABLE BY A PERSON, NOT ONLY BY A FIXTURE ───────────────────────
describe('a carrier nobody can ask for is a carrier that does not exist', () => {
  // OUTPUT_CONTRACT was read by the compiler, rendered by the renderer, delivered to the provider and
  // proven by a hash comparison — and no command anywhere set `outputShape`. The whole carrier was
  // reachable from a test fixture and from nowhere a person could stand. A delivery proof over an
  // unreachable carrier proves the plumbing and nothing about the product.
  //
  // These requirements are built ONLY from fields `atelier ratify` can set, which is what makes this a
  // reachability test rather than another compiler test.
  const fromRatify = (o: Partial<Requirement> & { requirementId: string }): Requirement =>
    aRequirement({ statement: 'a rule', appliesWhen: 'GENERAL', authority: 'EXPERT_RATIFIED', ...o });

  it('all five carriers are produced by decisions a person can actually make', () => {
    const carriers = new Set([
      fromRatify({ requirementId: 'a', materiality: 'REQUIRED' }),
      fromRatify({ requirementId: 'b', materiality: 'TOLERATED' }),
      fromRatify({ requirementId: 'c', materiality: 'PREFERRED' }),
      fromRatify({ requirementId: 'd', materiality: 'REQUIRED', outputShape: { verdict: { type: 'string' } } }),
      fromRatify({ requirementId: 'e', materiality: 'INCIDENTAL' }),
    ].map((r) => componentFor(r).carrier));

    expect(carriers).toEqual(new Set(['PROSE', 'SELF_CHECK', 'EXAMPLE', 'OUTPUT_CONTRACT', 'NONE']));
  });

  // `cli/runtime.ts` resolves ATELIER_DATA at module load, so each of these needs a FRESH module
  // graph pointed at its own directory. `vi.resetModules()` is what makes the command re-read it.
  const proposal = (id: string): Requirement => aRequirement({
    requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL', authority: 'DERIVED_UNRATIFIED',
    provenance: 'MACHINE_DISCOVERED', evidence: 'a span', evidenceItemId: 'w1', wouldBeAbsentIf: 'otherwise',
  });

  const seedSession = (proposals: Requirement[]): string => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-ratify-'));
    writeFileSync(join(dir, 'session.json'), JSON.stringify({
      run: { id: 'r1', state: 'PROPOSED', enrolments: [], corpusHash: 'abc', events: [] },
      skillName: null, evidence: { evidenceId: 'e1', workType: 'writing', items: [] },
      proposals, decided: [], reservation: null, ledger: null,
    }));
    return dir;
  };

  /** Run one CLI command with a given argv against a given data dir, capturing stdout and any die(). */
  const runCli = async (dir: string, args: string[], fn: 'ratifyBatch' | 'pending'): Promise<{ printed: string; error: string | null }> => {
    const prior = { data: process.env.ATELIER_DATA, argv: process.argv, log: console.log, exit: process.exit };
    process.env.ATELIER_DATA = dir;
    process.argv = ['node', 'atelier', ...args];
    let printed = ''; let error: string | null = null;
    console.log = (...a: unknown[]): void => { printed += `${a.join(' ')}\n`; };
    // `die` calls process.exit(1) after writing to stderr; turn that into a throw so the test can read it.
    process.exit = ((): never => { throw new Error('__EXIT__'); });
    const errs: string[] = [];
    const priorErr = console.error;
    console.error = (...a: unknown[]): void => { errs.push(a.join(' ')); };
    try {
      vi.resetModules();
      const mod = await import('../cli/commands/discover.js');
      (mod as unknown as Record<string, () => void>)[fn]();
    } catch (e) {
      error = errs.length ? errs.join('\n') : (e instanceof Error ? e.message : String(e));
    }
    console.log = prior.log; console.error = priorErr; process.exit = prior.exit;
    process.env.ATELIER_DATA = prior.data; process.argv = prior.argv;
    return { printed, error };
  };

  const ratifyIn = async (dir: string, decisions: unknown): Promise<{ out: Requirement[]; error: string | null }> => {
    const { error } = await runCli(dir, ['ratify', '--decisions', JSON.stringify(decisions)], 'ratifyBatch');
    const sess = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')) as { decided: Requirement[] };
    return { out: sess.decided, error };
  };

  const capturePending = async (dir: string): Promise<string> => (await runCli(dir, ['pending'], 'pending')).printed;

  // THESE THREE WERE GREPS OVER `cli/commands/discover.ts` SOURCE.
  //
  // `expect(src).toMatch(/outputShape: shape,/)` asserts a spelling. It fails when someone renames a
  // local variable, which is a correct refactor, and it passes when someone deletes the feature and
  // leaves the string behind in a dead branch. Neither direction is the property anyone cared about.
  //
  // The property is that a decision a person can type reaches the requirement. So run the command.
  // These drive the real `ratifyBatch` in a temp ATELIER_DATA, through the same JSON a user pastes.
  it('a shape typed on a decision lands on the requirement, through the real command', async () => {
    const dir = seedSession([proposal('p1'), proposal('p2')]);
    const { out, error } = await ratifyIn(dir, [
      { id: 'p1', decision: 'APPROVE', materiality: 'REQUIRED', shape: { verdict: { type: 'string' } } },
      { id: 'p2', decision: 'APPROVE', materiality: 'PREFERRED' },
    ]);
    expect(error).toBeNull();
    expect(out.find((r) => r.requirementId === 'p1')!.outputShape).toEqual({ verdict: { type: 'string' } });
    expect(out.find((r) => r.requirementId === 'p2')!.outputShape).toBeNull();
    // and the shape that landed actually compiles to the carrier it exists for
    expect(componentFor(out.find((r) => r.requirementId === 'p1')!).carrier).toBe('OUTPUT_CONTRACT');
  });

  it('ratify refuses a shape the runtime would not hold', async () => {
    const dir = seedSession([proposal('p1')]);
    const { error } = await ratifyIn(dir, [{ id: 'p1', decision: 'APPROVE', materiality: 'PREFERRED', shape: { v: { type: 'string' } } }]);
    expect(error).toMatch(/only enforceable on a REQUIRED rule/);
  });

  it('and refuses a shape that is not an object of field to schema fragment', async () => {
    expect((await ratifyIn(seedSession([proposal('p1')]), [{ id: 'p1', decision: 'APPROVE', materiality: 'REQUIRED', shape: '{{not json' }])).error)
      .toMatch(/not valid JSON/);
    expect((await ratifyIn(seedSession([proposal('p1')]), [{ id: 'p1', decision: 'APPROVE', materiality: 'REQUIRED', shape: {} }])).error)
      .toMatch(/object of field name to JSON Schema fragment/);
  });

  it('and tells the author the field exists, which is why it stayed empty before', async () => {
    // `pending` is where the author is already deciding what each rule obliges, so it is the only
    // moment the prompt can land. Captured from the command, not read out of its source.
    const dir = seedSession([proposal('p1')]);
    const printed = await capturePending(dir);
    expect(printed).toMatch(/If a REQUIRED rule is really about the SHAPE/);
    expect(printed).toMatch(/"shape":\{"verdict"/);
  });
});
