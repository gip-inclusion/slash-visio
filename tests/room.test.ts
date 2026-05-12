import { describe, it, expect } from 'vitest';
import {
  slugify, padRandom, channelToken, roomSlug, roomUrl, formatRoomMessage, VISIO_BASE,
} from '../src/room.js';

describe('slugify', () => {
  it('lowercases', () => expect(slugify('NOVA')).toBe('nova'));
  it('strips accents', () => {
    expect(slugify('équipe')).toBe('equipe');
    expect(slugify('Aïcha')).toBe('aicha');
    expect(slugify('Vázquez')).toBe('vazquez');
  });
  it('replaces non-alphanum with dash', () => expect(slugify('foo_bar baz')).toBe('foo-bar-baz'));
  it('collapses dashes and trims', () => expect(slugify('--foo--bar--')).toBe('foo-bar'));
  it('preserves hyphens', () => expect(slugify('marie-claire')).toBe('marie-claire'));
});

describe('padRandom', () => {
  it('returns exactly n chars', () => {
    expect(padRandom(3)).toHaveLength(3);
    expect(padRandom(0)).toHaveLength(0);
  });
  it('uses [a-z0-9]', () => expect(padRandom(100)).toMatch(/^[a-z0-9]+$/));
});

describe('channelToken', () => {
  it('drops first segment when 2+', () => {
    expect(channelToken('abc-projets')).toBe('proj');
    expect(channelToken('direction-marketing')).toBe('mark');
    expect(channelToken('qa-poc-galaxie')).toBe('pocg');
  });
  it('keeps single segment', () => expect(channelToken('nuage')).toBe('nuag'));
  it('strips accents before splitting', () => expect(channelToken('équipe-rouge')).toBe('roug'));
  it('pads when short', () => expect(channelToken('ai')).toMatch(/^ai[a-z0-9]{2}$/));
  it('falls back to random when slug is empty', () => expect(channelToken('!!!')).toMatch(/^[a-z0-9]{4}$/));
});

describe('roomSlug', () => {
  it('matches the pdi-XXXX-YYY shape for channels', () => {
    expect(roomSlug('nuage')).toMatch(/^pdi-[a-z0-9]{4}-[a-z0-9]{3}$/);
    expect(roomSlug('abc-projets')).toMatch(/^pdi-proj-[a-z0-9]{3}$/);
  });
  it('uses random token for 1↔1 DMs', () => {
    expect(roomSlug('directmessage')).toMatch(/^pdi-[a-z0-9]{4}-[a-z0-9]{3}$/);
  });
  it('uses random token for mpim DMs', () => {
    expect(roomSlug('mpdm-foo-bar-baz')).toMatch(/^pdi-[a-z0-9]{4}-[a-z0-9]{3}$/);
    expect(roomSlug('group_dm')).toMatch(/^pdi-[a-z0-9]{4}-[a-z0-9]{3}$/);
  });
  it('generates a different suffix each call', () => {
    const a = roomSlug('nuage');
    const b = roomSlug('nuage');
    expect(a).not.toBe(b);
  });
});

describe('roomUrl', () => {
  it('prepends the visio base', () => {
    expect(roomUrl('nuage').startsWith(`${VISIO_BASE}/pdi-`)).toBe(true);
  });
});

describe('formatRoomMessage', () => {
  it('returns URL alone without subject', () => {
    expect(formatRoomMessage({ url: 'https://x/y' })).toBe('https://x/y');
  });
  it('treats empty/whitespace as no subject', () => {
    expect(formatRoomMessage({ url: 'https://x/y', subject: '' })).toBe('https://x/y');
    expect(formatRoomMessage({ url: 'https://x/y', subject: '   ' })).toBe('https://x/y');
  });
  it('bolds the subject above the URL', () => {
    expect(formatRoomMessage({ url: 'https://x/y', subject: 'Rétro' })).toBe('*Rétro*\nhttps://x/y');
  });
  it('trims the subject', () => {
    expect(formatRoomMessage({ url: 'https://x/y', subject: '  Hello  ' })).toBe('*Hello*\nhttps://x/y');
  });
});
