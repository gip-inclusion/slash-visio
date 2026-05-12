import { randomBytes } from 'node:crypto';

export const VISIO_BASE = 'https://visio.numerique.gouv.fr';

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function padRandom(n: number): string {
  if (n <= 0) return '';
  const buf = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[buf[i]! % ALPHABET.length];
  return out;
}

export function channelToken(name: string): string {
  const slug = slugify(name);
  if (!slug) return padRandom(4);
  const parts = slug.split('-').filter(Boolean);
  const remaining = parts.length >= 2 ? parts.slice(1) : parts;
  const concat = remaining.join('').slice(0, 4);
  return concat.length >= 4 ? concat : concat + padRandom(4 - concat.length);
}

function isDirectMessage(channelName: string): boolean {
  return (
    channelName === 'directmessage' ||
    channelName === 'group_dm' ||
    channelName.startsWith('mpdm-')
  );
}

export function roomSlug(channelName: string): string {
  const token = isDirectMessage(channelName) ? padRandom(4) : channelToken(channelName);
  return `pdi-${token}-${padRandom(3)}`;
}

export function roomUrl(channelName: string): string {
  return `${VISIO_BASE}/${roomSlug(channelName)}`;
}

export function formatRoomMessage({ url, subject }: { url: string; subject?: string | null }): string {
  const trimmed = subject?.trim();
  return trimmed ? `*${trimmed}*\n${url}` : url;
}
