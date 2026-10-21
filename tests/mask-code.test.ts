import { describe, it, expect } from 'vitest';
import { maskCode } from '../core/observers/text.js';
import { removeShapeExtras } from '../core/loop/shape-steer.js';
import { shapeOf } from '../core/observers/shape.js';

const PKCE = 'Send the request:\n\n```\nGET https://auth.example.com/authorize\n  &redirect_uri=https://app.example.com/callback\n```\n\nThen call `https://auth.example.com/token` and read https://oauth.net/2/pkce/ for more.';

describe('code is not prose', () => {
  it('blanks fenced blocks and inline spans, keeping offsets and newlines', () => {
    const m = maskCode(PKCE);
    expect(m.length).toBe(PKCE.length);
    expect(m.split('\n').length).toBe(PKCE.split('\n').length);
    expect(m).not.toContain('auth.example.com');
    expect(m).toContain('https://oauth.net/2/pkce/');
  });
  it('a learned "no links" never deletes a URL inside code', () => {
    const out = removeShapeExtras(PKCE, 'links', 0);
    expect(out).toContain('GET https://auth.example.com/authorize');
    expect(out).toContain('redirect_uri=https://app.example.com/callback');
    expect(out).toContain('`https://auth.example.com/token`');
    // a link that is a word of its sentence stays (no "See for the spec."); one on its own line goes
    expect(out).toContain('read https://oauth.net/2/pkce/ for more.');
    expect(removeShapeExtras(`${PKCE}\n\nhttps://oauth.net/2/pkce/`, 'links', 0)).not.toMatch(/\n\nhttps:\/\/oauth\.net/);
  });
  it('counts only the links of the prose', () => {
    expect(shapeOf(PKCE).links).toBe(1);
  });
  it('an unclosed fence blanks to the end; a backtick alone is text', () => {
    expect(maskCode('a `b\n```\nhttps://x.io')).toBe(`a \`b\n   \n${' '.repeat(12)}`);
  });
});

describe('fences close as markdown closes them', () => {
  it('a fence line with an info string inside an open block is text, and the block runs to its bare close', () => {
    const t = '```\nsome text\n```js\nhttps://in.code/x\n```\nhttps://prose.io';
    const m = maskCode(t);
    expect(m).not.toContain('in.code');
    expect(m).toContain('https://prose.io');
  });
});
