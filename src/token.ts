import { randomBytes } from 'node:crypto';

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
