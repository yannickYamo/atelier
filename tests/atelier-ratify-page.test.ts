// THE ROUND TRIP IS THE CONTRACT.
//
// The page's output is not a convenient format a person then adapts — it is `--decisions` input,
// character for character. A page that emitted something "close enough" would put a transcription
// step between the expert's judgment and their standard, which is the one place in this system that
// must not have one. So these tests parse what the page emits and feed it back through the shape the
// command accepts.
import { describe, it, expect } from 'vitest';
import { renderRatifyPage } from '../renderers/ratify-page/render.js';
import { aRequirement } from './fixtures.js';

const meta = { corpusHash: 'c0ffee', workType: 'writing', itemCount: 7, heldOutChecked: true };

const props = [
  aRequirement({ requirementId: 'p1', statement: 'Ground claims in a named project', appliesWhen: 'GENERAL',
    evidence: 'Scrap rates above 5% were burning $M', evidenceItemId: 'essay-one.md' }),
  aRequirement({ requirementId: 'p2', statement: 'Restate the thesis as an aphorism', kind: 'BOUNDARY',
    appliesWhen: 'At section boundaries', evidence: 'They want legible driving.', evidenceItemId: 'essay-two.md' }),
];

describe('every proposal reaches the page, with the evidence it was derived from', () => {
  const html = renderRatifyPage(props, meta);

  it('carries every proposal, its statement and its source', () => {
    for (const p of props) {
      expect(html).toContain(`card-${p.requirementId}`);
      expect(html).toContain(p.statement);
      expect(html).toContain(p.evidenceItemId!);
    }
  });

  it('offers all five materialities plus the refusal on every proposal', () => {
    for (const p of props) {
      for (const v of ['REQUIRED', 'PREFERRED', 'EXEMPLAR_ONLY', 'TOLERATED', 'INCIDENTAL', 'REJECT']) {
        expect(html).toContain(`data-r="${p.requirementId}" data-v="${v}"`);
      }
    }
  });

  it('marks GENERAL scope and shows a condition only where there is one', () => {
    expect(html).toContain('GENERAL SCOPE');
    expect(html).toContain('At section boundaries');
    // A general rule must not be annotated with a condition it does not have.
    expect(html).not.toContain('applies when</span> GENERAL');
  });

  it('states the caveat when discovery never checked against unread work', () => {
    expect(renderRatifyPage(props, { ...meta, heldOutChecked: false }))
      .toContain('proposals, not findings');
    expect(html).not.toContain('proposals, not findings');
  });
});

describe('the emitted JSON is exactly what --decisions parses', () => {
  it('APPROVE carries a materiality; REJECT carries none', () => {
    // Reproduces the page's own template literal. If the shape here and the shape in the script
    // ever diverge, one of them is wrong and the expert's rulings do not survive the trip.
    const emit = (id: string, v: string): string =>
      `{"id":"${id}","decision":${v === 'REJECT' ? '"REJECT"' : `"APPROVE","materiality":"${v}"`}}`;
    const text = `[\n  ${emit('p1', 'PREFERRED')},\n  ${emit('p2', 'REJECT')}\n]`;
    const parsed = JSON.parse(text) as { id: string; decision: string; materiality?: string }[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ id: 'p1', decision: 'APPROVE', materiality: 'PREFERRED' });
    expect(parsed[1]).toEqual({ id: 'p2', decision: 'REJECT' });
    expect(parsed[1]).not.toHaveProperty('materiality');
  });

  it('the page builds that exact shape, not an approximation', () => {
    const html = renderRatifyPage(props, meta);
    expect(html).toContain(`'  {"id":"'+id+'","decision":'`);
    expect(html).toContain(`'"APPROVE","materiality":"'+marks[id]+'"'`);
    expect(html).toContain(`'"REJECT"'`);
  });
});

describe('content cannot break the page or smuggle markup', () => {
  it('escapes quotes and angle brackets in a statement', () => {
    const nasty = renderRatifyPage(
      [aRequirement({ requirementId: 'x1', statement: 'I say "no" & <script>alert(1)</script> often' })], meta);
    expect(nasty).not.toContain('<script>alert(1)</script>');
    expect(nasty).toContain('&lt;script&gt;');
    expect(nasty).toContain('&quot;no&quot;');
  });

  it('survives a proposal with no evidence at all', () => {
    const bare = renderRatifyPage(
      [aRequirement({ requirementId: 'x2', statement: 'a rule', evidence: '', evidenceItemId: null })], meta);
    expect(bare).toContain('card-x2');
    expect(bare).not.toContain('<blockquote');
  });
});

describe('the page holds in both themes and stores nothing off-device', () => {
  const html = renderRatifyPage(props, meta);
  it('defines the palette on bare :root and redefines it for dark, both ways', () => {
    expect(html).toMatch(/:root\{--ground:/);
    expect(html).toMatch(/prefers-color-scheme:dark\)\{:root:not\(\[data-theme="light"\]\)/);
    expect(html).toMatch(/:root\[data-theme="dark"\]\{/);
  });
  it('guards storage, which throws outright in some contexts', () => {
    expect(html).toMatch(/try\{marks=JSON\.parse\(localStorage/);
    expect(html).toMatch(/try\{localStorage\.setItem/);
  });
  it('says plainly that nothing leaves the browser', () => {
    expect(html).toContain('Nothing is sent anywhere');
  });
});
