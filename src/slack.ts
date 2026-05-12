import type { WebClient } from '@slack/web-api';

const TTL_MS = 5 * 60 * 1000;

type Entry<T> = { value: T; expiresAt: number };

function makeCache<T>() {
  const store = new Map<string, Entry<T>>();
  return {
    get(key: string): T | undefined {
      const e = store.get(key);
      if (!e) return undefined;
      if (e.expiresAt < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key: string, value: T) {
      store.set(key, { value, expiresAt: Date.now() + TTL_MS });
    },
  };
}

export type SlackClient = {
  getMembers(channelId: string): Promise<string[]>;
  getUser(userId: string): Promise<{ id: string; name: string }>;
  getUserName(userId: string): Promise<string>;
};

export function createSlackClient(web: WebClient): SlackClient {
  const membersCache = makeCache<string[]>();
  const usersCache = makeCache<{ id: string; name: string }>();

  async function getMembers(channelId: string): Promise<string[]> {
    const hit = membersCache.get(channelId);
    if (hit) return hit;
    const res = await web.conversations.members({ channel: channelId });
    const members = (res.members ?? []) as string[];
    membersCache.set(channelId, members);
    return members;
  }

  async function getUser(userId: string) {
    const hit = usersCache.get(userId);
    if (hit) return hit;
    const res = await web.users.info({ user: userId });
    const profile = res.user?.profile;
    const name = (profile?.display_name && profile.display_name.trim())
      || (profile?.real_name ?? '');
    const value = { id: userId, name };
    usersCache.set(userId, value);
    return value;
  }

  async function getUserName(userId: string) {
    return (await getUser(userId)).name;
  }

  return { getMembers, getUser, getUserName };
}
