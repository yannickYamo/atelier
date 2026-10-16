// tests/atelier-shape-steer-edges.test.ts — A HASHTAG THAT IS A WORD KEEPS ITS WORD; A LENGTH AIM STAYS IN THE AUTHOR'S BAND.
// Expected values are read off the sentences and the bands, never off the code under test.
import { describe, it, expect } from 'vitest';
import { removeShapeExtras, shapeLengthAim, LENGTH_TOLERANCE } from '../core/loop/shape-steer.js';

describe('a hashtag is removed whole only where it is a tag', () => {
  it('a hashtag at the end of a sentence is a word of it: its # goes, the word stays', () => {
    expect(removeShapeExtras('We shipped after #approval.', 'hashtags', 0)).toBe('We shipped after approval.');
    expect(removeShapeExtras('We shipped after #approval', 'hashtags', 0)).toBe('We shipped after approval');
    expect(removeShapeExtras('Ask the #platform team, then the #security team!', 'hashtags', 0)).toBe('Ask the platform team, then the security team!');
    expect(removeShapeExtras('#Python is still the glue.', 'hashtags', 0)).toBe('Python is still the glue.');
  });
  it('tags after the sentence ends, or on a line of their own, go whole', () => {
    expect(removeShapeExtras('Shipped the rebuild. #devops #database', 'hashtags', 0)).toBe('Shipped the rebuild.');
    expect(removeShapeExtras('Shipped the rebuild.\n\n#devops #database', 'hashtags', 0)).toBe('Shipped the rebuild.');
    expect(removeShapeExtras('Shipped the rebuild! 🚀 #devops', 'hashtags', 0)).toBe('Shipped the rebuild! 🚀');
  });
  it('what is not a hashtag is left alone', () => {
    expect(removeShapeExtras('Rewrote it in C# and F#.', 'hashtags', 0)).toBe('Rewrote it in C# and F#.');
    expect(removeShapeExtras('See issue #42 for the trace.', 'hashtags', 0)).toBe('See issue #42 for the trace.');
  });
});

describe('a length aim stays inside the author\'s band', () => {
  it('the tolerance is 15%', () => { expect(LENGTH_TOLERANCE).toBe(0.15); });
  it('a draft far past the ceiling is aimed at the band itself, never under its floor', () => {
    // band 150 to 155 characters, draft 385: the aim names the band, not a number under 150
    const a = shapeLengthAim(385, 150, 155, 'characters');
    expect(a.aim).toBe('aim for 150 to 155 characters');
    expect(a.move).toBe('about 230 characters shorter');
  });
  it('a draft within 15% of the band is left as it is', () => {
    expect(shapeLengthAim(178, 117, 155, 'characters').aim).toBeUndefined();   // 155 * 1.15 = 178.25
    expect(shapeLengthAim(179, 117, 155, 'characters').aim).toBe('aim for 117 to 155 characters');
    expect(shapeLengthAim(100, 117, 155, 'characters').aim).toBeUndefined();   // 117 * 0.85 = 99.45: within
  });
});

describe('a learned length past its ceiling is steered only beyond the tolerance', () => {
  const band = { observer: 'SHAPE' as const, params: { shape: ['characters'], min: 117, max: 155 } };
  it('178 characters against a 155 ceiling is left as it is; 179 is steered', async () => {
    const { steersMiss } = await import('../core/loop/shape-steer.js');
    expect(steersMiss(band, 0.5, 178)).toBe(false);
    expect(steersMiss(band, 0.5, 179)).toBe(true);
    expect(steersMiss({ observer: 'SHAPE', params: { shape: ['hashtags'], max: 0 } }, 1, 1)).toBe(true);   // a count is exact
  });
});
