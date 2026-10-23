// THE FORM OF THE WORK IS READ FROM THE EXAMPLES, NOT OFF THE NAME. "code review" matched the word pattern for replies
// and a skill of sectioned review documents was served a chat assistant's voice. Here: code decides where every
// example is sectioned; a model's answer counts only where its quotes are in the pieces and a majority of the pieces
// were read; with nothing to go on, the name is the floor, said as the floor.
import { describe, it, expect } from 'vitest';
import { WORK_FORM, headingCount, type WorkFormInput } from '../core/observers/work-form.js';
import { readContext } from '../core/inference/reading.js';
import type { InferenceClient } from '../core/inference/client.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const review = (v: string): string => `## Summary\nThe change adds a cache.\n\n## Must fix\nNone.\n\n## Verdict\n${v}\n`;
const answer = (t: string): string => `Thanks for the details. ${t} Let me know if the error text differs.`;
const input = (workType: string, texts: string[], requests: (string | null)[] = []): WorkFormInput =>
  ({ workType, examples: texts.map((text, i) => ({ text, request: requests[i] ?? null })), method: null });
const scripted = (answers: unknown[]): InferenceClient & { calls: number } => {
  const c = { calls: 0, complete: async () => { const a = answers[c.calls] ?? answers[answers.length - 1]; c.calls += 1; if (a instanceof Error) throw a; return { json: a, text: JSON.stringify(a), cost: { usd: 0 } } as never; } };
  return c;
};
const budget = () => ({ spentUsd: 0, capUsd: 1, maxCalls: 5 });

describe('headings are counted outside code', () => {
  it('counts ATX headings and skips fenced code', () => {
    expect(headingCount('# A\n\ntext\n\n## B\n```\n# not a heading\n```\n### C')).toBe(3);
    expect(headingCount('plain text\nno headings')).toBe(0);
  });
});

describe('code decides where every example is sectioned', () => {
  it('two or more headings in every example is a document, whatever the work is called, and no model is asked', async () => {
    const client = scripted([{ examples: [], form: 'REPLY' }]);
    const d = await readContext(WORK_FORM, input('code review', [review('Approve'), review('Comment'), review('Request changes')]), client, 'm', budget());
    expect(d).toMatchObject({ value: 'DOCUMENT', by: 'code', reader: 'work-form-3' });
    expect(client.calls).toBe(0);
  });
  it('one sectioned piece is enough; one unsectioned piece among them, or no piece, is not decisive', () => {
    expect(WORK_FORM.decide(input('code review', [review('Approve')]))).toBe('DOCUMENT');
    expect(WORK_FORM.decide(input('code review', [review('Approve'), answer('Restart it.')]))).toBeNull();
    expect(WORK_FORM.decide(input('code review', []))).toBeNull();
  });
});

describe('the model reads, code grounds', () => {
  const texts = [answer('Restart the worker.'), answer('The port is taken.'), answer('Clear the cache.'), answer('Pin the version.')];
  it('a majority of grounded quotes decides, and an ungrounded quote drops its finding', async () => {
    const raw = { examples: [
      { example: 1, answers: 'PERSON_WHO_ASKED', quote: 'Thanks for the details.' },
      { example: 2, answers: 'PERSON_WHO_ASKED', quote: 'Let me know if the error text differs.' },
      { example: 3, answers: 'PERSON_WHO_ASKED', quote: 'Thanks for the details.' },
      { example: 4, answers: 'PERSON_WHO_ASKED', quote: 'this quote is in no piece' } ], form: 'DOCUMENT' };
    const d = await readContext(WORK_FORM, input('posts', texts), scripted([raw]), 'm', budget());
    expect(d).toMatchObject({ value: 'REPLY', by: 'model', reader: 'work-form-3:m' });
  });
  it('fewer than half the pieces grounded, or a tie, is no reading: the floor decides and says so', async () => {
    const one = { examples: [{ example: 1, answers: 'PERSON_WHO_ASKED', quote: 'Thanks for the details.' }], form: 'REPLY' };
    const d = await readContext(WORK_FORM, input('posts', texts), scripted([one]), 'm', budget());
    expect(d).toMatchObject({ value: 'DOCUMENT', by: 'floor' });
    expect(d.why).toMatch(/could not be grounded/);
    const tie = { examples: [1, 2, 3, 4].map((n) => ({ example: n, answers: n % 2 ? 'PERSON_WHO_ASKED' : 'NONE', quote: n % 2 ? 'Thanks for the details.' : null })), form: 'REPLY' };
    expect((await readContext(WORK_FORM, input('posts', texts), scripted([tie]), 'm', budget())).by).toBe('floor');
  });
  it('a quote may come from the request the piece answered', async () => {
    const raw = { examples: [{ example: 1, answers: 'PERSON_WHO_ASKED', quote: 'why does my worker hang' }, { example: 2, answers: 'PERSON_WHO_ASKED', quote: 'Thanks for the details.' }], form: 'REPLY' };
    const d = await readContext(WORK_FORM, input('posts', texts.slice(0, 2), ['why does my worker hang?', null]), scripted([raw]), 'm', budget());
    expect(d.value).toBe('REPLY');
  });
  it('with no examples the reader judges the description, and the top-level form is taken', async () => {
    const d = await readContext(WORK_FORM, { workType: 'code review', examples: [], method: 'Open with a Summary section.' }, scripted([{ examples: [], form: 'DOCUMENT' }]), 'm', budget());
    expect(d).toMatchObject({ value: 'DOCUMENT', by: 'model' });
  });
});

describe('a closed choice with NONE allowed (round 4, item 2): posts to followers answer nobody', () => {
  // The case-shaped fixture: one essay and four short posts by an invented author. Read as "replies in a conversation" by
  // the forced choice between a reply and a document; asked instead whom each piece answers, with NONE allowed, every
  // piece answers nobody in particular, and the skill builds as documents with no flag.
  const FX = resolve('tests/fixtures/reaction-case/voice');
  const pieces = readdirSync(FX).sort().map((f) => readFileSync(join(FX, f), 'utf8'));
  it('five pieces read NONE: documents, by the reader', async () => {
    const raw = { examples: pieces.map((_, i) => ({ example: i + 1, answers: 'NONE', quote: null })), form: 'NONE' };
    const d = await readContext(WORK_FORM, input('long posts on X', pieces), scripted([raw]), 'm', budget());
    expect(d).toMatchObject({ value: 'DOCUMENT', by: 'model' });
  });
  it('a reply claimed with no quote in the piece is no finding; NONE carries the rest', async () => {
    const raw = { examples: pieces.map((_, i) => ({ example: i + 1, answers: i < 3 ? 'PERSON_WHO_ASKED' : 'NONE', quote: i < 3 ? 'thanks for asking about the barges' : null })), form: 'REPLY' };
    const d = await readContext(WORK_FORM, input('long posts on X', pieces), scripted([raw]), 'm', budget());
    expect(d.value).toBe('DOCUMENT');
  });
  it('the reader is offered NONE, and told a post to followers answers nobody', () => {
    expect(JSON.stringify(WORK_FORM.schema)).toContain('"NONE"');
    expect(WORK_FORM.system).toContain('A post on a social network written to whoever reads it answers nobody in particular');
  });
});

describe('the floor reads no words, and is said to be the floor', () => {
  it('no model: a document, whatever the work is called', async () => {
    const d = await readContext(WORK_FORM, input('code review', [answer('a'), answer('b')]), null, null, budget());
    expect(d).toMatchObject({ value: 'DOCUMENT', by: 'floor', why: 'no model set up' });
    expect((await readContext(WORK_FORM, input('support replies', [answer('a')]), null, null, budget())).value).toBe('DOCUMENT');
    expect((await readContext(WORK_FORM, input('blog posts', [answer('a')]), null, null, budget())).value).toBe('DOCUMENT');
  });
  it('a reader that fails is a floor decision with the reason, never an exception', async () => {
    const d = await readContext(WORK_FORM, input('support replies', [answer('a'), answer('b')]), scripted([new Error('HTTP 529 overloaded')]), 'm', budget());
    expect(d).toMatchObject({ value: 'DOCUMENT', by: 'floor' });
    expect(d.why).toMatch(/could not be asked: HTTP 529/);
  });
});
