import { describe, it, expect } from 'vitest';
import { slugify, padRandom } from '../src/token.js';

describe('slugify', () => {
  it('lowercases', () => {
    expect(slugify('NOVA')).toBe('nova');
  });
  it('strips accents', () => {
    expect(slugify('équipe')).toBe('equipe');
    expect(slugify('Aïcha')).toBe('aicha');
    expect(slugify('Vázquez')).toBe('vazquez');
  });
  it('replaces non-alphanum with dash', () => {
    expect(slugify('foo_bar baz')).toBe('foo-bar-baz');
  });
  it('collapses dashes and trims', () => {
    expect(slugify('--foo--bar--')).toBe('foo-bar');
  });
  it('preserves existing hyphens', () => {
    expect(slugify('marie-claire')).toBe('marie-claire');
  });
});

describe('padRandom', () => {
  it('returns exactly n chars', () => {
    expect(padRandom(3)).toHaveLength(3);
    expect(padRandom(0)).toHaveLength(0);
  });
  it('uses [a-z0-9] alphabet', () => {
    const s = padRandom(100);
    expect(s).toMatch(/^[a-z0-9]+$/);
  });
});
