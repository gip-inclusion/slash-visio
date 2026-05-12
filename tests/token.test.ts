import { describe, it, expect } from 'vitest';
import { slugify, padRandom, channelToken } from '../src/token.js';

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

describe('channelToken', () => {
  it('drops the first segment when 2+ segments', () => {
    expect(channelToken('abc-projets')).toBe('proj');
    expect(channelToken('direction-marketing')).toBe('mark');
  });
  it('drops the first segment when 3+ segments', () => {
    expect(channelToken('qa-poc-galaxie')).toBe('pocg');
  });
  it('keeps the only segment when 1 segment', () => {
    expect(channelToken('nuage')).toBe('nuag');
  });
  it('strips accents before splitting', () => {
    expect(channelToken('équipe-rouge')).toBe('roug');
  });
  it('pads with random chars when result is shorter than 4', () => {
    expect(channelToken('ai')).toMatch(/^ai[a-z0-9]{2}$/);
  });
  it('falls back to 4 random when slug is empty', () => {
    expect(channelToken('!!!')).toMatch(/^[a-z0-9]{4}$/);
  });
});
