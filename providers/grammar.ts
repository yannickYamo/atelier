// providers/grammar.ts — WHICH GRAMMAR ENGINE THIS PROCESS USES: harper.js, or a small fixed checker for the test suite.
//
// `ATELIER_GRAMMAR=stub` selects `stubGrammar`: a handful of known slips found by fixed patterns, in the engine's own
// rule names, loaded at once. The suite runs the shipped binary many times over and harper's dictionary costs seconds
// a process; the stub keeps every check of the rule a real, deterministic check there. Anything else selects harper.
// `ATELIER_GRAMMAR=off` is read by core (core/observers/grammar.ts): the check is then unverified, with that reason.

import type { GrammarEngine, GrammarLint, GrammarProvider } from '../core/observers/grammar.js';
import { harperGrammar } from './harper.js';

/** The stub's slips: a pattern, the engine rule it stands for, and its correction from the match. */
const STUB_SLIPS: readonly { readonly re: RegExp; readonly rule: string; readonly kind: string; readonly fix: (m: RegExpMatchArray) => string; readonly at?: (m: RegExpMatchArray) => [number, number] }[] = [
  // "they was": the verb only
  { re: /\b(?:they|we|you) (was)\b/gi, rule: 'PronounVerbAgreement', kind: 'Agreement', fix: () => 'were',
    at: (m) => { const s = (m.index ?? 0) + m[0].length - 3; return [s, s + 3]; } },
  // "the the": the second word goes with the space before it
  { re: /\b(the|a|and|to|of) \1\b/gi, rule: 'RepeatedWords', kind: 'Repetition', fix: (m) => m[1] },
  // a few common misspellings
  { re: /\b(recieve|teh|lenght|seperate|occured)\b/gi, rule: 'SpellCheck', kind: 'Spelling',
    fix: (m) => ({ recieve: 'receive', teh: 'the', lenght: 'length', seperate: 'separate', occured: 'occurred' } as Record<string, string>)[m[1].toLowerCase()] },
];

export const stubGrammar: GrammarProvider = {
  load: () => Promise.resolve<GrammarEngine>({
    lint(text) {
      const out: GrammarLint[] = [];
      for (const s of STUB_SLIPS) {
        for (const m of text.matchAll(s.re)) {
          const [start, end] = s.at ? s.at(m) : [m.index, m.index + m[0].length];
          out.push({ rule: s.rule, kind: s.kind, message: 'stub', start, end, replacement: s.fix(m) });
        }
      }
      return out;
    },
  }),
};

/** The engine this process wires in (cli/atelier.mts, and the suite's setup): the stub when asked for, harper otherwise. */
export const grammarProvider = (env: NodeJS.ProcessEnv = process.env): GrammarProvider => (env.ATELIER_GRAMMAR === 'stub' ? stubGrammar : harperGrammar);
