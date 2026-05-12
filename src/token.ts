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
