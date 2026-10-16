// tests/atelier-grammar-cache.test.ts — A GRAMMAR READING IS REUSED ONLY FOR THE SAME INPUT.
//
// The reading of a text is kept so the rule's line and the list of what to check read it once. It may be reused only
// when everything that shaped it is the same: the text, the standard's settings, the request, the material's contents
// (not its file names) and the engine. Wiring another engine, or forgetting the loaded one, starts afresh.
import { describe, it, expect, afterEach } from 'vitest';
import { setGrammarProvider, ensureGrammar, resetGrammar, readGrammar, type GrammarEngine, type GrammarLint } from '../core/observers/grammar.js';
import { grammarProvider } from '../providers/grammar.js';

const silent: GrammarEngine = { lint: () => [] };
const wire = async (e: GrammarEngine): Promise<void> => { setGrammarProvider({ load: async () => e }); await ensureGrammar(); };
// "definately" is a known misspelling: corrected in place unless the request or the material carries it.
const TEXT = 'We definately ship the beta on Friday.';

afterEach(() => { setGrammarProvider(grammarProvider()); });

describe('the grammar reading cache', () => {
  it('reads the material by its contents: the same file name with new contents protects the new terms', async () => {
    await wire(silent);
    const before = readGrammar(TEXT, {}, { material: [{ name: 'notes.md', text: 'The beta ships on Friday.' }] });
    expect(before.confirmed.map((s) => s.text)).toEqual(['definately']);
    const after = readGrammar(TEXT, {}, { material: [{ name: 'notes.md', text: 'Definately is the product name.' }] });
    expect(after.confirmed).toEqual([]);
    expect(after.uncertain.map((s) => s.text)).toEqual(['definately']);
    // and back: the first contents still read as they did
    expect(readGrammar(TEXT, {}, { material: [{ name: 'notes.md', text: 'The beta ships on Friday.' }] }).confirmed.map((s) => s.text)).toEqual(['definately']);
  });

  it('keeps material apart from the request: the same words split differently is another input', async () => {
    await wire(silent);
    const a = readGrammar(TEXT, {}, { request: 'a|b', material: [{ name: 'x', text: 'c' }] });
    const b = readGrammar(TEXT, {}, { request: 'a', material: [{ name: 'x', text: 'b|c' }] });
    expect(a).not.toBe(b);
  });

  it('starts afresh when another engine is wired in', async () => {
    const lint: GrammarLint = { rule: 'SentenceCapitalization', kind: 'Capitalization', message: 'capitalise', start: 0, end: 2, replacement: 'WE' };
    await wire(silent);
    const first = readGrammar('We met on Friday.', {});
    expect(first.uncertain).toEqual([]);
    await wire({ lint: () => [lint] });
    const second = readGrammar('We met on Friday.', {});
    expect(second.uncertain.map((s) => s.text)).toEqual(['We']);
  });

  it('starts afresh when the loaded engine is forgotten', async () => {
    let loads = 0;
    const lint: GrammarLint = { rule: 'SentenceCapitalization', kind: 'Capitalization', message: 'capitalise', start: 0, end: 2, replacement: 'WE' };
    setGrammarProvider({ load: async () => { loads += 1; return loads === 1 ? silent : { lint: () => [lint] }; } });
    await ensureGrammar();
    expect(readGrammar('We met on Friday.', {}).uncertain).toEqual([]);
    resetGrammar();
    await ensureGrammar();
    expect(loads).toBe(2);
    expect(readGrammar('We met on Friday.', {}).uncertain.map((s) => s.text)).toEqual(['We']);
  });
});
