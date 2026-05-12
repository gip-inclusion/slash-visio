import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSlackClient } from '../src/slack.js';

function fakeWeb({ members, users }: { members: string[]; users: Record<string, string> }) {
  return {
    conversations: {
      members: vi.fn().mockResolvedValue({ members }),
    },
    users: {
      info: vi.fn().mockImplementation(async ({ user }: { user: string }) => ({
        user: { id: user, profile: { display_name: users[user] ?? '', real_name: users[user] ?? '' } },
      })),
    },
  };
}

describe('createSlackClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns conversation members', async () => {
    const web = fakeWeb({ members: ['U1', 'U2'], users: { U1: 'Aïcha Benali', U2: 'Yuki Tanaka' } });
    const client = createSlackClient(web as any);
    const ids = await client.getMembers('C1');
    expect(ids).toEqual(['U1', 'U2']);
    expect(web.conversations.members).toHaveBeenCalledTimes(1);
  });

  it('caches conversations.members within TTL', async () => {
    const web = fakeWeb({ members: ['U1', 'U2'], users: {} });
    const client = createSlackClient(web as any);
    await client.getMembers('C1');
    await client.getMembers('C1');
    expect(web.conversations.members).toHaveBeenCalledTimes(1);
  });

  it('caches users.info within TTL', async () => {
    const web = fakeWeb({ members: [], users: { U1: 'Aïcha Benali' } });
    const client = createSlackClient(web as any);
    await client.getUser('U1');
    await client.getUser('U1');
    expect(web.users.info).toHaveBeenCalledTimes(1);
  });

  it('re-fetches users.info after TTL expires', async () => {
    const web = fakeWeb({ members: [], users: { U1: 'Aïcha Benali' } });
    const client = createSlackClient(web as any);
    await client.getUser('U1');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await client.getUser('U1');
    expect(web.users.info).toHaveBeenCalledTimes(2);
  });

  it('prefers display_name over real_name', async () => {
    const web = {
      conversations: { members: vi.fn() },
      users: {
        info: vi.fn().mockResolvedValue({
          user: { id: 'U1', profile: { display_name: 'AB', real_name: 'Aïcha Benali' } },
        }),
      },
    };
    const client = createSlackClient(web as any);
    const name = await client.getUserName('U1');
    expect(name).toBe('AB');
  });

  it('falls back to real_name when display_name is empty', async () => {
    const web = {
      conversations: { members: vi.fn() },
      users: {
        info: vi.fn().mockResolvedValue({
          user: { id: 'U1', profile: { display_name: '', real_name: 'Aïcha Benali' } },
        }),
      },
    };
    const client = createSlackClient(web as any);
    const name = await client.getUserName('U1');
    expect(name).toBe('Aïcha Benali');
  });
});
