// tests/setup-grammar.ts — the suite's in-process code gets the grammar engine the binary would: the one
// `ATELIER_GRAMMAR` selects (vitest.config.ts sets the fixed stub), through the same wiring point.
import { setGrammarProvider } from '../core/observers/grammar.js';
import { grammarProvider } from '../providers/grammar.js';

setGrammarProvider(grammarProvider());
