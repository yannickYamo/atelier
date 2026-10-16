// tests/atelier-grammar-optional.test.ts — THE GRAMMAR ENGINE IS OPTIONAL, AND ITS ABSENCE CHANGES NO VERDICT.
//
// harper.js is an optional dependency: npm installs it by default, and an install that skipped it (a platform with no
// prebuilt package, `--omit=optional`, a vendored tree) must still build, run and verify. The engine is imported in one
// place (providers/harper.ts); when that import fails the check reads "grammar not checked", with a reason that says
// what to do, and the run's state stays what the person's own rules make it.
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { measure } from '../core/observers/registry.js';
import { setGrammarProvider, ensureGrammar, resetGrammar, grammarStatus, GRAMMAR_NOT_RUN } from '../core/observers/grammar.js';
import { harperGrammarFrom } from '../providers/harper.js';
import { grammarProvider } from '../providers/grammar.js';
import { buildRecord } from '../core/eval/record-build.js';
import { aRequirement } from './fixtures.js';

const length = aRequirement({ requirementId: 'x1', statement: 'Between 100 and 400 words.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 100, max: 400 } } });
const grammar = aRequirement({ requirementId: 'g1', statement: 'No mechanical errors: spelling, agreement, punctuation.', authority: 'EXPERT_RATIFIED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'GRAMMAR', params: {} } });

/** What Node throws for `import('harper.js')` when the package is not in node_modules. */
const notInstalled = (): Promise<never> => Promise.reject(Object.assign(new Error("Cannot find package 'harper.js' imported from /x/dist/providers/harper.js"), { code: 'ERR_MODULE_NOT_FOUND' }));
const NOT_INSTALLED = 'could not load: harper.js is not installed (it is optional: `npm install harper.js` turns the check on)';

afterAll(() => { resetGrammar(); setGrammarProvider(grammarProvider()); });

describe('harper.js not installed', () => {
  it('the import failing leaves the check "not checked", says why, and moves no verdict', async () => {
    resetGrammar();
    setGrammarProvider(harperGrammarFrom(notInstalled));
    await ensureGrammar();
    expect(grammarStatus()).toEqual({ ready: false, reason: NOT_INSTALLED });
    const r = measure('They was late.', { observer: 'GRAMMAR', params: {} });
    expect(r).toMatchObject({ verdict: 'NOT_APPLICABLE', detail: `${GRAMMAR_NOT_RUN}: ${NOT_INSTALLED}` });
    const record = buildRecord({ requirements: [length, grammar], checked: [{ id: 'x1', required: true, verdict: 'MET', detail: '250 words' }, { id: 'g1', required: true, verdict: r.verdict, detail: r.detail }],
      waived: new Map(), request: null, claims: null, copying: null });
    expect(record.entries.find((e) => e.id === 'g1')?.observation.evidence).toBe(`grammar not checked: ${NOT_INSTALLED}`);
    expect(record.state).toBe('VERIFIED');
  });

  it('any other import failure keeps its own first line: only a missing package is called not installed', async () => {
    resetGrammar();
    setGrammarProvider(harperGrammarFrom(() => Promise.reject(new Error('wasm instantiate failed\nstack...'))));
    await ensureGrammar();
    expect(grammarStatus()).toEqual({ ready: false, reason: 'could not load: wasm instantiate failed' });
  });
});

describe('the package declares it optional', () => {
  it('package.json lists harper.js under optionalDependencies, not dependencies, and the lock agrees', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
    expect(pkg.optionalDependencies?.['harper.js']).toBe('2.10.0');
    expect(pkg.dependencies?.['harper.js']).toBeUndefined();
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { optional?: boolean; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }> };
    expect(lock.packages[''].optionalDependencies?.['harper.js']).toBe('2.10.0');
    expect(lock.packages[''].dependencies?.['harper.js']).toBeUndefined();
    expect(lock.packages['node_modules/harper.js'].optional).toBe(true);
  });
});
