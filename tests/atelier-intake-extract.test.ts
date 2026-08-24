/**
 * The format readers — the step that decides whether a user's corpus is read correctly at all.
 *
 * These were exported for testability and never tested. That is the worst place for a silent defect:
 * a docx parser that drops paragraph breaks does not fail, it succeeds and hands discovery a wall of
 * text — and every rule inferred about paragraph rhythm is then inferred from damage we caused. The
 * refusals are tested too, because a refusal a user can act on is the whole reason `.pdf` delegates
 * instead of approximating.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { docxXmlToText, stripRtf, extract, READABLE, META_NAME } from '../core/intake/extract.js';

const tmp = mkdtempSync(join(tmpdir(), 'atelier-extract-'));
const write = (name: string, body: string): string => { const p = join(tmp, name); writeFileSync(p, body); return p; };

describe('docxXmlToText', () => {
  it('paragraph breaks SURVIVE — they are the rhythm rules get inferred from', () => {
    const xml = '<w:body><w:p><w:r><w:t>First para.</w:t></w:r></w:p><w:p><w:r><w:t>Second para.</w:t></w:r></w:p></w:body>';
    const out = docxXmlToText(xml);
    expect(out).toBe('First para.\n\nSecond para.');
    expect(out.split('\n\n')).toHaveLength(2);
  });

  it('runs inside one paragraph do NOT gain a break — Word splits a sentence across runs freely', () => {
    // A sentence that changes font mid-way is several <w:r> in one <w:p>. Breaking on runs would
    // shred sentences and invent paragraph structure that the author never wrote.
    const xml = '<w:p><w:r><w:t>One sentence </w:t></w:r><w:r><w:t>in two runs.</w:t></w:r></w:p>';
    expect(docxXmlToText(xml)).toBe('One sentence in two runs.');
  });

  it('line breaks and tabs are kept as themselves', () => {
    expect(docxXmlToText('<w:p><w:r><w:t>a</w:t><w:br/><w:t>b</w:t><w:tab/><w:t>c</w:t></w:r></w:p>')).toBe('a\nb\tc');
  });

  it('XML entities are decoded, and & is decoded LAST', () => {
    // Decoding &amp; first turns "&amp;lt;" into "&lt;" and then into "<" — text the document never
    // contained. Ordering is the whole correctness condition here.
    expect(docxXmlToText('<w:p><w:r><w:t>a &amp;lt; b</w:t></w:r></w:p>')).toBe('a &lt; b');
    expect(docxXmlToText('<w:p><w:r><w:t>Tom &amp; Jerry &quot;quoted&quot;</w:t></w:r></w:p>')).toBe('Tom & Jerry "quoted"');
  });

  it('collapses runs of blank lines rather than emitting empty paragraphs', () => {
    expect(docxXmlToText('<w:p><w:r><w:t>a</w:t></w:r></w:p><w:p/><w:p/><w:p><w:r><w:t>b</w:t></w:r></w:p>'))
      .not.toContain('\n\n\n');
  });
});

describe('stripRtf', () => {
  it('drops control words and keeps the prose', () => {
    expect(stripRtf(String.raw`{\rtf1\ansi\deff0 Hello there.}`)).toBe('Hello there.');
  });

  it('\\par becomes a line break, because it is one', () => {
    expect(stripRtf(String.raw`{\rtf1 First.\par Second.}`)).toContain('\n');
  });

  it('discards font and colour tables instead of emitting them as text', () => {
    const rtf = String.raw`{\rtf1{\fonttbl{\f0 Times;}}{\colortbl;\red0\green0\blue0;}Real prose.}`;
    const out = stripRtf(rtf);
    expect(out).toContain('Real prose');
    expect(out).not.toContain('Times');
    expect(out).not.toContain('red0');
  });
});

describe('extract — what is readable, and what is refused with a remedy', () => {
  it('reads plain formats directly', () => {
    const r = extract(write('a.md', '# Hello\n\nbody'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('Hello');
  });

  it('refuses an unknown format WITH something the user can act on', () => {
    const r = extract(write('a.xyz', 'x'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('not a format Atelier reads');
      expect(r.remedy).toBeTruthy();
      expect(r.remedy).toContain('.md');
    }
  });

  it('names the file in the refusal — a silent skip is the failure this replaced', () => {
    const r = extract(write('important-notes.xyz', 'x'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('important-notes.xyz');
  });

  it('a corrupt .docx refuses rather than returning garbage as prose', () => {
    const r = extract(write('broken.docx', 'this is not a zip'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.remedy).toBeTruthy();
  });

  it('READABLE and the refusal message agree — a list that drifts misroutes the user', () => {
    const r = extract(write('a.xyz', 'x'));
    if (!r.ok) for (const ext of READABLE) expect(r.remedy).toContain(ext);
  });
});

describe('META_NAME — files that are ABOUT the work', () => {
  it('catches the usual suspects', () => {
    for (const n of ['README.md', 'readme.txt', 'LICENSE', 'CHANGELOG.md', 'notes.md', 'TODO.md', 'index.md']) {
      expect(META_NAME.test(n), n).toBe(true);
    }
  });

  it('does NOT swallow real work whose name merely starts similarly', () => {
    // "notebook" begins with "note" and is not a note; the pattern is word-bounded for this reason.
    for (const n of ['notebook-entry.md', 'readmemoir.md', 'index-fund-analysis.md']) {
      expect(META_NAME.test(n), n).toBe(false);
    }
  });
});
