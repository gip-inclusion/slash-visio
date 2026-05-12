import { describe, it, expect } from 'vitest';
import { makeSlug } from '../src/slug.js';

describe('makeSlug', () => {
  it('formats as pdi-XXXX-YYY', () => {
    const slug = makeSlug({ type: 'channel', channelName: 'nuage' });
    expect(slug).toMatch(/^pdi-[a-z0-9]{4}-[a-z0-9]{3}$/);
  });
  it('uses channelToken for channels', () => {
    const slug = makeSlug({ type: 'channel', channelName: 'abc-projets' });
    expect(slug).toMatch(/^pdi-proj-[a-z0-9]{3}$/);
  });
  it('uses selfDmToken for self-DM', () => {
    const slug = makeSlug({ type: 'self' });
    expect(slug).toMatch(/^pdi-[a-z0-9]{4}-[a-z0-9]{3}$/);
  });
  it('generates a different random suffix on each call', () => {
    const a = makeSlug({ type: 'channel', channelName: 'nuage' });
    const b = makeSlug({ type: 'channel', channelName: 'nuage' });
    expect(a).not.toBe(b);
  });
});
