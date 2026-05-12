import { describe, it, expect } from 'vitest';
import { slugify, padRandom, channelToken, initials, PARTICLES, dmToken, fallbackInitials, mpimToken, selfDmToken } from '../src/token.js';

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

describe('initials', () => {
  it('takes 2 letters from a hyphenated first name', () => {
    expect(initials('Marie-Claire Dubois')).toBe('mc');
  });
  it('skips French particles', () => {
    expect(initials('Jean de Bonnefoy')).toBe('jb');
  });
  it('skips Dutch/German particles', () => {
    expect(initials('Olga van der Berg')).toBe('ob');
  });
  it('handles simple Latin names', () => {
    expect(initials('Aïcha Benali')).toBe('ab');
    expect(initials('Kwame Mensah')).toBe('km');
    expect(initials('Yuki Tanaka')).toBe('yt');
    expect(initials('Diego Vázquez')).toBe('dv');
  });
  it('duplicates the first letter for mononyms', () => {
    expect(initials('Yuki')).toBe('yy');
  });
  it('returns empty string for non-Latin scripts', () => {
    expect(initials('田中')).toBe('');
    expect(initials('Анна')).toBe('');
  });
});

describe('PARTICLES', () => {
  it('contains common European particles', () => {
    expect(PARTICLES.has('de')).toBe(true);
    expect(PARTICLES.has('van')).toBe(true);
    expect(PARTICLES.has('der')).toBe(true);
    expect(PARTICLES.has('la')).toBe(true);
  });
});

describe('dmToken', () => {
  it('places the inviter first', () => {
    expect(dmToken(
      { name: 'Aïcha Benali', userId: 'U1' },
      { name: 'Yuki Tanaka', userId: 'U2' },
    )).toBe('abyt');
  });
  it('handles particles', () => {
    expect(dmToken(
      { name: 'Olga van der Berg', userId: 'U1' },
      { name: 'Diego Vázquez', userId: 'U2' },
    )).toBe('obdv');
  });
  it('handles hyphenated first names', () => {
    expect(dmToken(
      { name: 'Marie-Claire Dubois', userId: 'U1' },
      { name: 'Henri Renard', userId: 'U2' },
    )).toBe('mchr');
  });
  it('falls back to user_id hash when name is non-Latin', () => {
    const t = dmToken(
      { name: '田中', userId: 'UABC' },
      { name: 'Yuki Tanaka', userId: 'U2' },
    );
    expect(t).toMatch(/^[a-f0-9]{2}yt$/);
    expect(t).toBe(dmToken(
      { name: '田中', userId: 'UABC' },
      { name: 'Yuki Tanaka', userId: 'U2' },
    ));
  });
});

describe('fallbackInitials', () => {
  it('is deterministic for the same user_id', () => {
    expect(fallbackInitials('UABC')).toBe(fallbackInitials('UABC'));
  });
  it('returns exactly 2 hex chars', () => {
    expect(fallbackInitials('UABC')).toMatch(/^[a-f0-9]{2}$/);
  });
});

describe('mpimToken', () => {
  it('places inviter first then others alphabetical', () => {
    const t = mpimToken(
      { name: 'Kwame Mensah', userId: 'U1' },
      [
        { name: 'Aïcha Benali', userId: 'U2' },
        { name: 'Yuki Tanaka', userId: 'U3' },
      ],
    );
    expect(t).toMatch(/^kay[a-z0-9]$/);
  });
  it('returns 4 chars without padding when 4 people', () => {
    expect(mpimToken(
      { name: 'Marie-Claire Dubois', userId: 'U1' },
      [
        { name: 'Aïcha Benali', userId: 'U2' },
        { name: 'Kwame Mensah', userId: 'U3' },
        { name: 'Yuki Tanaka', userId: 'U4' },
      ],
    )).toBe('maky');
  });
  it('truncates to 4 chars for 5+ people', () => {
    const t = mpimToken(
      { name: 'Henri Renard', userId: 'U1' },
      [
        { name: 'Anna Lemaire', userId: 'U2' },
        { name: 'Léa Garnier', userId: 'U3' },
        { name: 'Sophie Vidal', userId: 'U4' },
        { name: 'Zoé Martin', userId: 'U5' },
      ],
    );
    expect(t).toBe('hals');
  });
});

describe('selfDmToken', () => {
  it('returns 4 random chars', () => {
    expect(selfDmToken()).toMatch(/^[a-z0-9]{4}$/);
  });
});
