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
  it('uses dmToken for 1↔1 DMs', () => {
    const slug = makeSlug({
      type: 'dm',
      inviter: { name: 'Aïcha Benali', userId: 'U1' },
      other: { name: 'Yuki Tanaka', userId: 'U2' },
    });
    expect(slug).toMatch(/^pdi-abyt-[a-z0-9]{3}$/);
  });
  it('uses mpimToken for group DMs', () => {
    const slug = makeSlug({
      type: 'mpim',
      inviter: { name: 'Marie-Claire Dubois', userId: 'U1' },
      others: [
        { name: 'Aïcha Benali', userId: 'U2' },
        { name: 'Kwame Mensah', userId: 'U3' },
        { name: 'Yuki Tanaka', userId: 'U4' },
      ],
    });
    expect(slug).toMatch(/^pdi-maky-[a-z0-9]{3}$/);
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
