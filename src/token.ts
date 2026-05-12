import { createHash, randomBytes } from 'node:crypto';

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const RAND_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function padRandom(n: number): string {
  if (n <= 0) return '';
  const buf = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) {
    out += RAND_ALPHABET[buf[i]! % RAND_ALPHABET.length];
  }
  return out;
}

export function channelToken(name: string): string {
  const slug = slugify(name);
  if (!slug) return padRandom(4);
  const parts = slug.split('-').filter(Boolean);
  const remaining = parts.length >= 2 ? parts.slice(1) : parts;
  const concat = remaining.join('').slice(0, 4);
  if (concat.length >= 4) return concat;
  return concat + padRandom(4 - concat.length);
}

export const PARTICLES = new Set([
  'de', 'du', 'des', 'le', 'la',
  'van', 'von', 'der', 'den',
  'di', 'da',
]);

export function initials(displayName: string): string {
  const words = displayName
    .trim()
    .split(/\s+/)
    .map(slugify)
    .filter(Boolean);

  if (words.length === 0) return '';

  const first = words[0]!;

  if (first.includes('-')) {
    const components = first.split('-').filter(Boolean);
    const a = components[0]?.[0] ?? '';
    const b = components[1]?.[0] ?? a;
    return a + b;
  }

  const a = first[0]!;
  for (let i = 1; i < words.length; i++) {
    const head = words[i]!.split('-')[0]!;
    if (!PARTICLES.has(head)) {
      return a + head[0]!;
    }
  }
  return a + a;
}

export type Person = { name: string; userId: string };

export function fallbackInitials(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 2);
}

function personInitials(p: Person): string {
  return initials(p.name) || fallbackInitials(p.userId);
}

export function dmToken(inviter: Person, other: Person): string {
  return (personInitials(inviter) + personInitials(other)).slice(0, 4);
}

function firstInitial(p: Person): string {
  const ini = initials(p.name);
  if (ini) return ini[0]!;
  return fallbackInitials(p.userId)[0]!;
}

export function mpimToken(inviter: Person, others: Person[]): string {
  const sorted = [...others].sort((a, b) => a.name.localeCompare(b.name));
  const letters = firstInitial(inviter) + sorted.map(firstInitial).join('');
  const trimmed = letters.slice(0, 4);
  if (trimmed.length >= 4) return trimmed;
  return trimmed + padRandom(4 - trimmed.length);
}

export function selfDmToken(): string {
  return padRandom(4);
}
