// A page of markup is measured as what its reader sees. The study behind it: twelve HTML explainers whose CSS
// semicolons, `<!doctype` and unseen `<h2>` headings became rules of style.
import { describe, it, expect } from 'vitest';
import { visible, isMarkup } from '../core/observers/visible.js';
import { FEATURES } from '../core/observers/features.js';
import { headingsOf } from '../core/observers/structure.js';
import { sentencesOf, paragraphsOf } from '../core/observers/text.js';
import { proseWords } from '../core/observers/style.js';
import { measure } from '../core/observers/registry.js';

const SECTIONS = ['What it is', 'How it works', 'Why it matters', 'What to do'];
const para = (k: number): string => `A heat pump moves warmth from one place to another, and it does so with part ${k + 1} of a simple loop. You feel the result as steady heat; the bill shows it too. Nothing is burned inside the unit, which is why it wastes so little of what it draws.`;
const MD = `# Heat pumps\n\n${SECTIONS.map((s, k) => `## ${s}\n\n${para(k)}\n\n${para(k + 4)}`).join('\n\n')}\n`;
const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Heat pumps</title>
  <style>
    body { font-family: Georgia, serif; max-width: 640px; margin: 2rem auto; }
    h2 { color: #334; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>Heat pumps</h1>
${SECTIONS.map((s, k) => `  <h2 class="part">${s}</h2>\n  <p>${para(k)}</p>\n  <p>${para(k + 4)}</p>`).join('\n')}
  <script>console.log("loaded; ready!");</script>
</body>
</html>
`;

describe('what is markup, read from the content', () => {
  it('a declared page, with or without front matter, and a fragment built of block tags', () => {
    expect(isMarkup(HTML)).toBe(true);
    expect(isMarkup(`---\nrequest: Explain heat pumps.\n---\n${HTML}`)).toBe(true);
    expect(isMarkup('<h2>How it works</h2>\n<p>One.</p>\n<p>Two.</p>\n')).toBe(true);
  });
  it('an essay with a stray tag, or one that writes about tags, is not', () => {
    expect(isMarkup(MD)).toBe(false);
    expect(isMarkup('A line with a break.<br>\n\nAnd a <details> block.\n')).toBe(false);
    expect(isMarkup('Use `<p>` for a paragraph and `<h2>` for a heading. A `<div>` is neither.\n')).toBe(false);
    expect(visible(MD)).toBe(MD);
  });
});

describe('the reduction keeps the length of the page and the place of every visible word', () => {
  it('same length, and each sentence found is the page\'s own text at the page\'s own offsets', () => {
    const seen = visible(HTML);
    expect(seen.length).toBe(HTML.length);
    for (const s of sentencesOf(HTML).slice(0, 6)) expect(HTML.slice(s.start, s.end)).toBe(s.text);
    expect(seen).not.toContain('font-family');
    expect(seen).not.toContain('doctype');
    expect(seen).not.toContain('console.log');
  });
  it('an entity is the character it stands for', () => {
    const page = '<p>Fish &amp; chips &mdash; a classic.</p>\n<p>Two.</p>\n<p>Three.</p>\n';
    expect(visible(page)).toContain('Fish &     chips —       a classic.');
  });
});

describe('the same text measures the same, as a page and as markdown', () => {
  it('its headings are headings', () => {
    expect(headingsOf(HTML).map((h) => h.text)).toEqual(headingsOf(MD).map((h) => h.text));
    expect(headingsOf(HTML).map((h) => h.text)).toEqual(SECTIONS);
  });
  it('its words, sentences and paragraphs are counted alike', () => {
    expect(proseWords(HTML)).toBe(proseWords(MD));
    expect(sentencesOf(HTML).length).toBe(sentencesOf(MD).length);
    expect(paragraphsOf(HTML).length).toBe(paragraphsOf(MD).length);
  });
  it('every counted feature of style reads the same', () => {
    const differ = FEATURES.filter((f) => JSON.stringify(f.measure(HTML)) !== JSON.stringify(f.measure(MD))).map((f) => `${f.id}: ${JSON.stringify(f.measure(HTML))} vs ${JSON.stringify(f.measure(MD))}`);
    expect(differ).toEqual([]);
  });
  it('a check reads the page the same way, and points at the page', () => {
    const rule = { observer: 'PRESENCE' as const, params: { sections: ['How it works'], body: 1 } };
    expect(measure(HTML, rule).verdict).toBe('MET');
    expect(measure(HTML.replace('How it works', 'Mechanics'), rule).verdict).toBe('VIOLATED');
    const banned = measure(HTML, { observer: 'LEXICON', params: { terms: ['steady'] } });
    expect(banned.spans.length).toBe(8);
    expect(HTML.slice(banned.spans[0].start, banned.spans[0].end)).toBe('steady');
    expect(measure(HTML, { observer: 'LEXICON', params: { terms: ['serif', 'loaded'] } }).verdict).toBe('MET');
  });
});

// An independent review of the first version.
describe('what a review of the first version found', () => {
  const page = (body: string): string => `<!doctype html>\n<html><body>\n${body}\n</body></html>\n`;
  it('a heading or a list item whose words are on the next line, or over two lines, is still one', () => {
    expect(headingsOf(page('<h1>T</h1>\n<h2>\n  What it is\n</h2>\n<p>One.</p>\n<h2>How it\nworks</h2>\n<p>Two.</p>')).map((h) => h.text.replace(/\s+/g, ' '))).toEqual(['What it is', 'How it works']);
    const items = page('<ul>\n<li>\n  First item of the list here\n</li>\n<li>Second item of the list here</li>\n</ul>');
    expect(paragraphsOf(items)).toHaveLength(0);
    expect(proseWords(items)).toBe(12);
  });
  it('every level below the title is a section, whatever its tag carries', () => {
    const levels = headingsOf(page('<h1>T</h1>\n<h3>A part</h3>\n<p>One.</p>\n<h3 id="b">B part</h3>\n<p>Two.</p>')).map((h) => h.level);
    expect(levels).toEqual([2, 2]);
  });
  it('numbered entities are characters, an unknown one is nothing, and neither is a word or a number', () => {
    const text = page('<p>The page &#8212; here &#x2014; and so on &rarr; &copy; now.</p>');
    expect(visible(text)).toContain('The page —       here —        and so on');
    expect(proseWords(text)).toBe(proseWords('The page — here — and so on now.'));
    // Known and left: an entity in the middle of a word ("It&#8217;s") keeps its room, so the word reads as two.
    expect(proseWords(page('<p>It&#8217;s here.</p>'))).toBe(3);
  });
  it('a paragraph is counted by what it says, not by its links and emphasis', () => {
    const [p] = paragraphsOf(page('<p>A <a href="https://example.com/a/long/address" title="x > y">linked</a> and <strong class="k">bold</strong> claim.</p>'));
    expect(p.text.replace(/\s+/g, ' ')).toBe('A linked and bold claim.');
  });
  it('a table, and an opener that is never closed, are not prose', () => {
    expect(proseWords(page('<table><tr><td>Vendor name</td><td>Price each</td></tr></table>\n<p>One two three.</p>'))).toBe(3);
    expect(sentencesOf(page('<p>One two three.</p>\n<script>\nvar x = 1; var y = 2;')).map((s) => s.text)).toEqual(['One two three.']);
  });
  it('a README that opens with a centred block, and an essay about tags, are markdown', () => {
    const readme = '<div align="center"><p><img src="logo.png"></p></div>\n\n# Tool\n\nUse `<pre>` for code. Close it with `</pre>`. That is all there is to say here.\n';
    expect(isMarkup(readme)).toBe(false);
    expect(visible(readme)).toBe(readme);
    expect(isMarkup('<p> is the paragraph tag. A <div> groups things, and <li> is an item in a list.\n\nThat is most of it.\n')).toBe(false);
  });
  it('a long page of openers with no closers is read in linear time', () => {
    const started = Date.now();
    for (const unit of ['<h2 ', '<pre><svg><style>', '<!-- x ', '<script>']) expect(visible(`<!doctype html>\n${unit.repeat(200_000 / unit.length)}`).length).toBeGreaterThan(190_000);
    expect(Date.now() - started).toBeLessThan(3000);
  });
  it('a long paragraph in a page is not "split" by a blank line the browser will not show', async () => {
    const { splitLongParagraphs } = await import('../core/loop/mechanical-repair.js');
    const long = page(`<p>${Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} says one more thing.`).join(' ')}</p>`);
    expect(splitLongParagraphs(long, 4)).toBe(long);
  });
});
