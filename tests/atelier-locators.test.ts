// A skill that cites lines is served its material with line numbers, and its citations are looked up in code.
// The numbers behind it: a reviewer shown a raw diff cited the planted defect's exact line in 1 of 20 reviews,
// and in 13 of 20 with each line numbered.
import { describe, it, expect } from 'vitest';
import { citesLines, linesOf, numbered, citedLines } from '../core/loop/locators.js';

const DIFF = ['diff --git a/src/users/search.js b/src/users/search.js', '--- a/src/users/search.js', '+++ b/src/users/search.js', '@@ -40,3 +40,6 @@',
  ' function find(email) {', '-  const q = base;', '+  let query = base;', '+  if (email) {', '+    query += " AND email = \'" + email + "\'";', '+  }', ' }'].join('\n');

describe('which skills cite lines: read from the skill, never from a kind of work', () => {
  it('a rule that names the form', () => {
    expect(citesLines('3. Cite each Must fix item as path:line, the line number in the new file.')).toBe(true);
    expect(citesLines('Give the file:line of each finding.')).toBe(true);
  });
  it('examples that do it three times or more', () => {
    expect(citesLines('- src/a.js:41 leaks.\n- src/a.js:57 is unbounded.\n- terms.md:12 contradicts clause 4.')).toBe(true);
  });
  it('an essay, a contract with clause numbers, one stray reference: no', () => {
    expect(citesLines('I close every piece with one line the reader can act on.')).toBe(false);
    expect(citesLines('See clause 4.2 and section 12:3 of the agreement, signed at 10:30.')).toBe(false);
    expect(citesLines('The fix is in notes.md:3, as it happens.')).toBe(false);
  });
});

describe('a diff is numbered by its hunks, anything else from 1', () => {
  it('each added or context line has its number in the new file; a removed line has none', () => {
    expect(linesOf('diff', DIFF)).toEqual([
      { path: 'src/users/search.js', line: 40, text: 'function find(email) {', added: false },
      { path: 'src/users/search.js', line: 41, text: '  let query = base;', added: true },
      { path: 'src/users/search.js', line: 42, text: '  if (email) {', added: true },
      { path: 'src/users/search.js', line: 43, text: '    query += " AND email = \'" + email + "\'";', added: true },
      { path: 'src/users/search.js', line: 44, text: '  }', added: true },
      { path: 'src/users/search.js', line: 45, text: '}', added: false }]);
  });
  it('as served: the number stands before each citable line, and nothing else changes', () => {
    const rows = numbered('diff', DIFF).split('\n');
    expect(rows.slice(0, 4)).toEqual(DIFF.split('\n').slice(0, 4));
    expect(rows[4]).toBe('   40   function find(email) {');
    expect(rows[5]).toBe('       -  const q = base;');
    expect(rows[8]).toBe('   43  +    query += " AND email = \'" + email + "\'";');
  });
  it('two hunks, two files: each starts where its header says', () => {
    const two = `${DIFF}\ndiff --git a/b.py b/b.py\n--- a/b.py\n+++ b/b.py\n@@ -7,0 +9,2 @@\n+x = 1\n+y = 2`;
    expect(linesOf('diff', two).filter((l) => l.path === 'b.py')).toEqual([{ path: 'b.py', line: 9, text: 'x = 1', added: true }, { path: 'b.py', line: 10, text: 'y = 2', added: true }]);
  });
  it('a plain file is numbered from 1 under its own name', () => {
    expect(numbered('terms.md', 'One.\n\nThree.')).toBe('    1  One.\n    2  \n    3  Three.');
    expect(linesOf('terms.md', 'One.\n\nThree.').map((l) => l.line)).toEqual([1, 2, 3]);
  });
});

describe('every citation is looked up', () => {
  const material = [{ name: 'diff', text: DIFF }, { name: 'terms.md', text: 'One.\n\nThree.' }];
  it('a line the change adds, with something on it, is a citation; by full path or by the file\'s name', () => {
    expect(citedLines('- src/users/search.js:43 builds SQL by hand.\n- search.js:42 too.', material)).toMatchObject([
      { path: 'src/users/search.js', line: 43, why: null }, { path: 'search.js', line: 42, why: null }]);
  });
  it('a lone bracket, a line the change did not add, a line or a file that is not there: each is said', () => {
    expect(citedLines('search.js:44, search.js:40, search.js:90, other.js:3, terms.md:2', material).map((c) => c.why)).toEqual([
      'a blank line or a lone bracket', 'a line the change does not add', 'no such line in the material', 'no such file in the material', 'a blank line or a lone bracket']);
  });
  it('a place cited twice is looked up once, and a time of day is not a citation', () => {
    expect(citedLines('search.js:43 and again search.js:43, at 10:30.', material)).toHaveLength(1);
  });
});

// An independent review of the first version.
describe('what a review of the first version found', () => {
  it('a citation that ends its sentence is a citation', () => {
    expect(citedLines('The defect is at src/users/search.js:43.', [{ name: 'diff', text: DIFF }])).toEqual([{ path: 'src/users/search.js', line: 43, why: null, start: 17, end: 39 }]);
  });
  it('a hunk lasts as long as its header says: a second file, a closing fence and prose after it are not code', () => {
    const plain = ['--- a/x.py', '+++ b/x.py', '@@ -1,0 +1,2 @@', '+a = 1', '+b = 2', '--- a/y.py', '+++ b/y.py', '@@ -4,0 +5,1 @@', '+c = 3'].join('\n');
    expect(linesOf('d', plain)).toEqual([{ path: 'x.py', line: 1, text: 'a = 1', added: true }, { path: 'x.py', line: 2, text: 'b = 2', added: true }, { path: 'y.py', line: 5, text: 'c = 3', added: true }]);
    const inMarkdown = ['Here is the change:', '```diff', '--- a/x.py', '+++ b/x.py', '@@ -1,0 +1,1 @@', '+a = 1', '```', 'Thanks, see the note.'].join('\n');
    expect(linesOf('d', inMarkdown)).toEqual([{ path: 'x.py', line: 1, text: 'a = 1', added: true }]);
    expect(numbered('d', inMarkdown).split('\n').slice(-2)).toEqual(['```', 'Thanks, see the note.']);
  });
  it('a document that only mentions a hunk header is not a diff, and a final newline adds no line', () => {
    const doc = 'A hunk header looks like this:\n@@ -1,2 +1,2 @@\nand so on.\n';
    expect(linesOf('doc.md', doc).map((l) => [l.line, l.text])).toEqual([[1, 'A hunk header looks like this:'], [2, '@@ -1,2 +1,2 @@'], [3, 'and so on.']]);
    expect(citedLines('doc.md:4', [{ name: 'doc.md', text: doc }])[0].why).toBe('no such line in the material');
  });
  it('what is served and what is looked up are one reading', () => {
    for (const [name, text] of [['diff', DIFF], ['terms.md', 'One.\n\nThree.\n']] as const) {
      const served = numbered(name, text).split('\n').flatMap((r) => { const m = /^ *(\d+) {2}/.exec(r); return m ? [Number(m[1])] : []; });
      expect(served).toEqual(linesOf(name, text).map((l) => l.line));
    }
  });
  it('two files that end the same way: the citation stands if it stands in either', () => {
    const two = ['--- a/src/a.js', '+++ b/src/a.js', '@@ -1,1 +1,1 @@', ' kept', '--- a/lib/a.js', '+++ b/lib/a.js', '@@ -1,0 +1,1 @@', '+added();'].join('\n');
    expect(citedLines('a.js:1', [{ name: 'd', text: two }])[0].why).toBeNull();
    expect(citedLines('src/a.js:1', [{ name: 'd', text: two }])[0].why).toBe('a line the change does not add');
  });
  it('a material bound under a plain name is cited by that name', () => {
    expect(citedLines('See notes:2 and notes:9.', [{ name: 'notes', text: 'One.\nTwo.' }]).map((c) => c.why)).toEqual([null, 'no such line in the material']);
  });
  it('line numbers in prose, a rule against them, addresses and ports do not make a skill cite lines', () => {
    for (const t of ['Line numbers in the margin help a student.', 'Never include line numbers when you cite a file.', 'File: line one is the title.',
      'See http://a.example.com:8080, http://b.example.com:8080 and http://c.example.com:9090.', 'Mail goes to ops@mail.com:25, dev@mail.com:25 and qa@mail.com:25.']) expect(citesLines(t), t).toBe(false);
    expect(citesLines('Cite the line number of each finding.')).toBe(true);
  });
});

// The step that asks for it becomes a check, and the redraft that follows a missing section follows a bad citation.
describe('"cite each item as path:line" is a step code holds', () => {
  const material = [{ name: 'diff', text: DIFF }];
  const lines = async (text: string, bound = material) => (await import('../core/observers/registry.js')).measure(text, { observer: 'LINES', params: { min: 1 } }, { request: 'Review this change.', material: bound });
  it('every citation a line the change adds: met', async () => {
    expect(await lines('## Must fix\n- src/users/search.js:43 builds SQL by hand.')).toMatchObject({ verdict: 'MET', detail: '1 of 1 citation(s) point at a line of the material with something on it' });
  });
  it('a lone bracket, or no citation at all: broken, and said by name', async () => {
    const r = await lines('## Must fix\n- src/users/search.js:44 builds SQL by hand.');
    expect(r.verdict).toBe('VIOLATED');
    expect(r.detail).toContain('not: src/users/search.js:44 (a blank line or a lone bracket)');
    expect(r.spans.map((s) => s.text)).toEqual(['src/users/search.js:44']);
    expect(await lines('## Must fix\n- The query is built by hand.')).toMatchObject({ verdict: 'VIOLATED', detail: expect.stringContaining('1 needed') as string });
  });
  it('a change pasted into the request is looked up too; a citation of something nobody gave fails', async () => {
    const { measure } = await import('../core/observers/registry.js');
    expect(measure('search.js:43', { observer: 'LINES', params: { min: 0 } }, { request: `Review this.\n${DIFF}`, material: [] }).verdict).toBe('MET');
    expect(measure('search.js:43', { observer: 'LINES', params: { min: 0 } }, { request: 'Review this.', material: [] })).toMatchObject({ verdict: 'VIOLATED', detail: expect.stringContaining('no such file in the material') as string });
  });
  it('a review with nothing to cite holds "cite each item"', async () => {
    const { measure } = await import('../core/observers/registry.js');
    expect(measure('## Must fix\nNone.', { observer: 'LINES', params: { min: 0 } }, { request: 'Review this.', material }).verdict).toBe('MET');
  });
  it('a numbered or bulleted verdict is still one of them', async () => {
    const { measure } = await import('../core/observers/registry.js');
    for (const body of ['1. Approve', '- Request changes', '> Comment']) expect(measure(`## Verdict\n${body}\n`, { observer: 'PRESENCE', params: { sections: ['Verdict'], body: 1, options: ['Approve', 'Request changes', 'Comment'] } }).verdict, body).toBe('MET');
  });
});

describe('a section that holds one of a closed set', () => {
  const verdict = async (body: string) => (await import('../core/observers/registry.js')).measure(`## Summary\nIt adds search.\n\n## Verdict\n${body}\n`,
    { observer: 'PRESENCE', params: { sections: ['Verdict'], body: 1, closes: 1, options: ['Approve', 'Request changes', 'Comment'] } });
  it('one of them on the section\'s first line, in any case or emphasis, with a reason after it if there is one', async () => {
    for (const body of ['Request changes', '**Request changes.**', 'approve', 'Comment\n\nThe retry needs a second look.']) expect((await verdict(body)).verdict, body).toBe('MET');
  });
  it('more on that line, or another word, is not one of them', async () => {
    for (const body of ['Request changes, mostly for the query.', 'Changes requested', 'Looks good to me']) {
      const r = await verdict(body);
      expect(r.verdict, body).toBe('VIOLATED');
      expect(r.detail).toContain('does not start with one of "Approve", "Request changes", "Comment" on a line of its own');
    }
  });
});
