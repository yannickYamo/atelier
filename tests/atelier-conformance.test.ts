import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill, assertPortable, PORTABLE_FRONTMATTER } from '../renderers/agent-skill/render.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code/adapter.js';
import { CodexAdapter } from '../adapters/codex/adapter.js';
import { policyFor } from '../core/state/policy.js';
import { newRun, enrol, type Run } from '../core/state/run-state.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';

const req = (o: Partial<Requirement> & { requirementId: string }): Requirement => ({
  statement: 'Open with a concrete scene.', appliesWhen: 'GENERAL', kind: 'GENERATIVE',
  authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, evidence: 'q', evidenceItemId: 'a.md', ...o,
});
const std: StandardVersion = {
  standardVersionHash: 'sv-abc', evidenceId: 'ev1', workType: 'blog', authorityState: 'RATIFIED', mintedAt: 'T', supersedes: null, reason: null,
  requirements: [req({ requirementId: 'r1' }), req({ requirementId: 'r2', kind: 'BOUNDARY', appliesWhen: 'when the reader already knows it', provenance: 'EXPERT_ADDED' })],
};
const at = (r: Run, s: Run['state']): Run => ({ ...r, state: s });

// ── THE HARD BOUNDARY ────────────────────────────────────────────────────────────────────────
describe('core imports nothing host-specific — enforced, not promised', () => {
  // WHAT THIS GUARD IS FOR, AND THE TWO WAYS IT WAS WRONG.
  //
  // It exists so that core cannot acquire a vendor. It was doing that job with a text search over raw
  // source, which gave it two defects that pull in opposite directions.
  //
  // TOO LOUD: it fired on PROSE. A comment in core explaining why core must not name a vendor was
  // reported as core naming a vendor. The sibling test below had already learned this lesson and
  // strips comments before scanning; this one had not, so the same file could pass one and fail the
  // other. Comments are stripped here now, by the same expression, for the same reason.
  //
  // TOO QUIET: the list was asymmetric. `@anthropic-ai` matched only the package specifier while
  // `openai` matched any occurrence anywhere — so the vendor Atelier actually ships was policed more
  // loosely than the one it does not. Every vendor is on the list now, at the same strength.
  const FORBIDDEN = [
    /anthropic/i, /openai/i, /gemini/i, /\bollama\b/i, /\bgroq\b/i, /\bvllm\b/i,
    /fastify/i, /supabase/i, /\bsrc\/orchestrator\b/, /\bsrc\/core\b/, /\.claude\b/, /\.codex\b/,
    /claude-code/i, /CLAUDE_/, /CODEX_/,
  ];
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

  it('no file under core mentions a host or a provider', () => {
    const offences: string[] = [];
    for (const f of walk('core')) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const pat of FORBIDDEN) if (pat.test(src)) offences.push(`${f}: ${pat}`);
    }
    expect(offences, `core must be host-agnostic; found:\n${offences.join('\n')}`).toEqual([]);
  });

  // POLARITY. A guard that was just made more permissive has to be shown still firing, or the change
  // is indistinguishable from switching it off.
  it('still catches a vendor in code — the loosening did not disable it', () => {
    const violating = `// a comment naming anthropic and openai, which is allowed\nimport x from 'openai';\nconst c = new Anthropic();\n`;
    const src = stripComments(violating);
    expect(FORBIDDEN.filter((p) => p.test(src)).length).toBeGreaterThanOrEqual(2);
    const proseOnly = stripComments(`// core must never import from openai or anthropic\nexport const x = 1;\n`);
    expect(FORBIDDEN.filter((p) => p.test(proseOnly))).toEqual([]);
  });

  // ── PROVENANCE, WHICH IS A DIFFERENT INSTRUMENT AND HAS TO BE ────────────────────────────────
  //
  // The guard above was NAMED for three things and only ever had patterns for two of them: the third
  // one. It was green from the day the repository was created while more than thirty comments carried
  // paths into the private predecessor, an internal audit filename, two commit SHAs, and — in a thrown
  // error a user could actually hit — the name of a script that does not exist here.
  //
  // It could not have caught them even with the pattern added, because it STRIPS COMMENTS first, and
  // it is right to. The two rules want opposite things from a comment:
  //
  //   vendor rule      a comment saying "core must never import anthropic" is CORRECT. Ignore comments.
  //   provenance rule  a comment saying "ported from src/private/thing.ts" IS the leak. Read comments.
  //
  // One scanner cannot hold both, which is why collapsing them hid this for the life of the repo.
  // This one reads raw source, every tracked file, and is deliberately about publication rather than
  // architecture.
  // ── STRUCTURAL: shapes, which name nothing ───────────────────────────────────────────────────
  const PRIVATE_PROVENANCE: readonly (readonly [RegExp, string])[] = [
    [/\bsrc\/(?!atelier\b)[a-z0-9-]+\/(g2s|offline|preview)\b/i, 'a source path inside another repository'],
    [/\bscratch\/[a-z0-9-]+\/|\bscripts\/[a-z0-9-]+\/[a-z-]+\.mts\b/, 'a path to a private working directory or script'],
    [/\b[A-Z][A-Z0-9_]{6,}_v\d+\.md\b/, 'an internal document filename'],
    [/^\/\/ +at +[0-9a-f]{8}$/m, "a commit SHA from another repository's history"],
    [/\bCampaign [A-Z]\b/, 'the codename of a private research corpus'],
    [/\bP[0-9](\.[0-9])?(-[a-z])? (Claim|ruling|lesson)\b|\bPhase 0[, ]+F[0-9]\b/, 'an internal phase codename'],
    [/\bMDE@\d+%/, 'a calibration measurement from a private run'],
  ];

  // ── VOCABULARY: HASHED, BECAUSE A GUARD THAT LISTS WHAT IT HIDES REPUBLISHES IT ──────────────
  //
  // The first version of this guard held the forbidden words as literals. It passed its own check —
  // the check exempts this file — and it was the only file in the repository still carrying them.
  // Anyone reading it learned the internal product name, the four dimensions of a private
  // evaluation rubric, and two skill names from another catalogue: exactly the list it exists to
  // keep out, gathered in one place and helpfully labelled.
  //
  // So the vocabulary is stored as truncated SHA-256 of the lowercased term. The check tokenizes
  // source and hashes each token, which costs nothing at this size and reveals nothing at rest.
  // The mechanism is polarity-tested below against a planted canary; the entries themselves were
  // generated from the real terms when this was written.
  const FORBIDDEN_VOCABULARY: ReadonlySet<string> = new Set([
    '2e4e6005c617b52b', 'cc90a2942090c234', '1ac5f47debd21a17', 'e29251b5b20d555e',
    'ce21da1fd5783337', '43561050fea3a644', '4b07d5ca6701c296', '5c620340d9403ff6',
    'f6230bc7f2b8402a', 'b254b016526101c2', '59458508a0827cff', '52196a62f405150a',
    '6ce3872caa836bfb',   // the canary the polarity test plants
  ]);

  const tokenHash = (t: string): string =>
    createHash('sha256').update(t.toLowerCase()).digest('hex').slice(0, 16);

  const forbiddenTokensIn = (raw: string): string[] =>
    [...new Set(raw.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [])]
      .filter((t) => FORBIDDEN_VOCABULARY.has(tokenHash(t)));

  it('no tracked source publishes a path, document, SHA or term from the private predecessor', () => {
    // Raw source. Comments included. That is the whole point of this one.
    const offences: string[] = [];
    for (const f of [...walk('core'), ...walk('cli'), ...walk('renderers'), ...walk('adapters'), ...walk('providers')]) {
      const raw = readFileSync(f, 'utf8');
      for (const [pat, why] of PRIVATE_PROVENANCE) {
        const m = raw.match(pat);
        if (m) offences.push(`${f}: ${why} — "${m[0]}"`);
      }
      for (const t of forbiddenTokensIn(raw)) offences.push(`${f}: a term from the private predecessor — "${t}"`);
    }
    expect(offences, `these would be published:\n${offences.join('\n')}`).toEqual([]);
  });

  // POLARITY. A guard nobody has watched fire is a guard nobody should trust — and this file already
  // knows that, which is why the vendor guard above has one.
  it('the structural rules fire on each shape of leak', () => {
    const samples = [
      '// PORTED from src/somerepo/offline/stats.ts',
      '// audit scratch/somewhere/veto-v3/SOME_AUDIT.md',
      '// see SOME_INTERNAL_DOC_v1.md',
      '//   at       fe99e8d2',
      '// Campaign R ran A and B over one corpus',
      ' * the representational answer to P7 Claim D',
      ' *   dim   SD   MDE@80%   headroom',
    ];
    for (const x of samples) {
      expect(PRIVATE_PROVENANCE.some(([p]) => p.test(x)), `missed: ${x}`).toBe(true);
    }
    // and NOT on ordinary prose that merely talks about provenance
    expect(PRIVATE_PROVENANCE.some(([p]) => p.test('// PORTED from the private predecessor'))).toBe(false);
    expect(PRIVATE_PROVENANCE.some(([p]) => p.test("// src/atelier/core is this repo's own path"))).toBe(false);
  });

  it('the hashed vocabulary check fires on a planted term and ignores ordinary words', () => {
    // The canary is in the set. If the tokenizer, the hash or the lookup breaks, this goes quiet —
    // which is the failure mode a hashed list has and a literal one does not, so it is pinned here.
    expect(forbiddenTokensIn('a comment mentioning polarityCanary in passing')).toEqual(['polarityCanary']);
    expect(forbiddenTokensIn('the expert ratifies the standard and the compiler emits a carrier')).toEqual([]);
    expect(FORBIDDEN_VOCABULARY.size).toBeGreaterThan(10);   // the real vocabulary is still loaded
  });

  it('core imports only relative paths and node builtins', () => {
    const bad: string[] = [];
    for (const f of walk('core')) {
      // COMMENTS ARE STRIPPED FIRST. Scanning raw source made this guard fire on a comment whose
      // line happened to end with "from " — the instrument reporting a dependency that did not
      // exist. A guard that cries wolf on prose gets disabled the third time it does it.
      // ANCHORED TO A REAL STATEMENT. A bare /from '...'/ also matches PROSE — a comment or a string
      // whose line ends with "from " pairs with the next line's quote and reports a dependency that
      // does not exist. This one starts at an import/export at line start and allows no quote or
      // semicolon before the specifier, so a multi-line import still matches and prose cannot.
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const m of code.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s+'([^']+)'/gm)) {
        const spec = m[1];
        if (!spec.startsWith('.') && !spec.startsWith('node:')) bad.push(`${f} -> ${spec}`);
      }
    }
    expect(bad, `core may not depend on packages:\n${bad.join('\n')}`).toEqual([]);
  });
});

// ── CONFORMANCE: same standard, same package, both hosts ─────────────────────────────────────
describe('one StandardVersion materializes identically for every host', () => {
  const pkg = renderAgentSkill(std, compileArchitecture(std), 'my-voice', 'Writes in the author standard');
  const claude = new ClaudeCodeAdapter();
  const codex = new CodexAdapter();

  it('both adapters install the IDENTICAL package — no per-host compilation', () => {
    const a = mkdtempSync(join(tmpdir(), 'ev-cl-')), b = mkdtempSync(join(tmpdir(), 'ev-cx-'));
    expect(claude.install(pkg, a).ok).toBe(true);
    expect(codex.install(pkg, b).ok).toBe(true);
    const fa = readFileSync(join(a, '.claude', 'skills', 'my-voice', 'SKILL.md'), 'utf8');
    const fb = readFileSync(join(b, '.codex', 'skills', 'my-voice', 'SKILL.md'), 'utf8');
    expect(fa).toBe(fb);                                   // byte-identical
    expect(claude.verifyInstallation(pkg, a).matchesPackage).toBe(true);
    expect(codex.verifyInstallation(pkg, b).matchesPackage).toBe(true);
  });

  it('adapters differ ONLY in location and invocation punctuation', () => {
    expect(claude.invocationHint('my-voice')).toBe('/my-voice <your task>');
    expect(codex.invocationHint('my-voice')).toBe('$my-voice <your task>');
    expect(claude.detect().invocationStyle).not.toBe(codex.detect().invocationStyle);
    expect(pkg.skillId).toBe('my-voice');                  // identity is the id, not the punctuation
  });

  it('no adapter can touch the standard — the package hash is the same object', () => {
    expect(pkg.standardVersionHash).toBe(std.standardVersionHash);
    const again = renderAgentSkill(std, compileArchitecture(std), 'my-voice', 'Writes in the author standard');
    expect(again.packageHash).toBe(pkg.packageHash);       // deterministic
  });

  it('detects a hand-edited install on either host', () => {
    const a = mkdtempSync(join(tmpdir(), 'ev-ed-'));
    claude.install({ ...pkg, files: { 'SKILL.md': `${pkg.files['SKILL.md']}\nedited` } }, a);
    expect(claude.verifyInstallation(pkg, a).matchesPackage).toBe(false);
  });
});

describe('portability is enforced, not hoped for', () => {
  it('emits only frontmatter that means the same thing everywhere', () => {
    expect(PORTABLE_FRONTMATTER).toEqual(['name', 'description']);
    expect(() => { assertPortable(renderAgentSkill(std, compileArchitecture(std), 'my-voice', 'd')); }).not.toThrow();
  });

  it('REFUSES host-only frontmatter', () => {
    const bad = { ...renderAgentSkill(std, compileArchitecture(std), 'm', 'd') };
    (bad as { files: Record<string, string> }).files = { 'SKILL.md': '---\nname: m\ndescription: d\nallowed-tools: Bash\n---\nbody' };
    expect(() => { assertPortable(bad); }).toThrow(/host-specific frontmatter/);
  });

  it('REFUSES a host template variable that would expand on one host and not another', () => {
    const bad = { ...renderAgentSkill(std, compileArchitecture(std), 'm', 'd') };
    (bad as { files: Record<string, string> }).files = { 'SKILL.md': '---\nname: m\ndescription: d\n---\nrun ${CLAUDE_PLUGIN_ROOT}/x' };
    expect(() => { assertPortable(bad); }).toThrow(/template variable/);
  });
});

describe('policy is decided once in core; hosts only carry the verdict', () => {
  it('the same run yields the same policy regardless of adapter', () => {
    const r = at(newRun('r'), 'TEST_PENDING');
    const p = policyFor(r);
    expect(p.canReveal).toBe(false);
    expect(p.reasonIfBlocked).toContain('recorded preference');
    // both adapters merely relay it
    expect(new ClaudeCodeAdapter().installProtocolGuards(p).detail).toContain('recorded preference');
    expect(new CodexAdapter().installProtocolGuards(p).detail).toContain('recorded preference');
  });

  it('build is blocked until ratification, on every host', () => {
    expect(policyFor(at(newRun('r'), 'PROPOSED')).canBuild).toBe(false);
    expect(policyFor(at(newRun('r'), 'RATIFIED')).canBuild).toBe(true);
  });

  it('a discovery-study run may not discover until its list is sealed', () => {
    const e = enrol(at(newRun('r'), 'CORPUS_SEALED'), 'DISCOVERY_STUDY', 'T');
    expect(e.ok).toBe(true);
    if (e.ok) { expect(policyFor(e.run).canDiscover).toBe(false); expect(policyFor(e.run).reasonIfBlocked).toContain('sealed first'); }
    expect(policyFor(at(newRun('r2'), 'CORPUS_SEALED')).canDiscover).toBe(true);
  });
});
