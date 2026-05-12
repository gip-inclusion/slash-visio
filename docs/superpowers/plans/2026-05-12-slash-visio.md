# slash-visio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Slack `/visio` slash command that posts a `https://visio.numerique.gouv.fr/pdi-XXXX-YYY` link to the current channel/DM, with the contextual `XXXX` token derived from the channel name or DM participants.

**Architecture:** Single TypeScript Scaleway Serverless Function. `@slack/bolt` HTTP receiver verifies signatures and dispatches the slash command. No DB, no state. The only Slack API calls (`users.info`, `conversations.members`) happen for DMs and are cached in-memory per warm instance.

**Tech Stack:** Node.js 20, TypeScript, `@slack/bolt`, `vitest`, `esbuild`, Scaleway Serverless Functions.

---

## File map

| File | Responsibility |
|---|---|
| `src/token.ts` | Pure: `slugify`, `padRandom`, `PARTICLES`, `channelToken`, `initials`, `dmToken`, `mpimToken`, `fallbackInitials` |
| `src/slug.ts` | Pure: `makeSlug({type, …})` — composes the final `pdi-XXXX-YYY` URL path |
| `src/format.ts` | Pure: `formatMessage({url, subject})` |
| `src/slack.ts` | I/O: cached wrappers around `users.info` and `conversations.members` |
| `src/app.ts` | `@slack/bolt` setup, `/visio` handler |
| `src/handler.ts` | Scaleway entry point (exports a Lambda-compatible handler) |
| `tests/token.test.ts` | Unit tests for `token.ts` |
| `tests/slug.test.ts` | Unit tests for `slug.ts` |
| `tests/format.test.ts` | Unit tests for `format.ts` |
| `tests/slack.test.ts` | Tests for `slack.ts` (mocked WebClient) |
| `manifest.yml` | Slack app manifest (versioned) |
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `README.md` | Project config |

---

## Task 1: Project bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `README.md`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "slash-visio",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "esbuild src/handler.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/handler.js --external:aws-sdk",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint 'src/**/*.ts' 'tests/**/*.ts'",
    "typecheck": "tsc --noEmit",
    "smoke": "scripts/smoke.sh"
  },
  "dependencies": {
    "@slack/bolt": "^4.0.0",
    "@slack/web-api": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "esbuild": "^0.21.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
.scw/
```

- [ ] **Step 5: Create `.env.example`**

```
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
```

- [ ] **Step 6: Create minimal `README.md`**

```markdown
# slash-visio

Slack `/visio` slash command that posts a https://visio.numerique.gouv.fr/ link with channel/DM-aware slug.

See `docs/superpowers/specs/2026-05-12-slash-visio-design.md` for the design.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in values
3. `npm run dev` (local) or `npm run build && scw function deploy …` (production)

## Test

`npm test`
```

- [ ] **Step 7: Install deps and verify**

Run: `npm install`
Expected: succeeds, creates `package-lock.json`.

Run: `npm run typecheck`
Expected: succeeds (no source files yet, exits cleanly).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example README.md
git commit -m "bootstrap slash-visio project"
```

---

## Task 2: `slugify` + `padRandom` utilities

**Files:**
- Create: `src/token.ts`
- Create: `tests/token.test.ts`

- [ ] **Step 1: Write failing test for `slugify`**

Create `tests/token.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugify, padRandom } from '../src/token.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/token.js'`.

- [ ] **Step 3: Implement `src/token.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — both `describe` blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/token.ts tests/token.test.ts
git commit -m "add slugify and padRandom utilities"
```

---

## Task 3: `channelToken`

**Files:**
- Modify: `src/token.ts`
- Modify: `tests/token.test.ts`

- [ ] **Step 1: Append failing tests to `tests/token.test.ts`**

Append after the existing `describe` blocks:

```ts
import { channelToken } from '../src/token.js';

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
```

Update the import at top of file to include `channelToken`:

```ts
import { slugify, padRandom, channelToken } from '../src/token.js';
```

(Replace the existing partial import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `channelToken is not a function`.

- [ ] **Step 3: Add `channelToken` to `src/token.ts`**

Append:

```ts
export function channelToken(name: string): string {
  const slug = slugify(name);
  if (!slug) return padRandom(4);
  const parts = slug.split('-').filter(Boolean);
  const remaining = parts.length >= 2 ? parts.slice(1) : parts;
  const concat = remaining.join('').slice(0, 4);
  if (concat.length >= 4) return concat;
  return concat + padRandom(4 - concat.length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `channelToken` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/token.ts tests/token.test.ts
git commit -m "add channelToken"
```

---

## Task 4: `initials` helper

**Files:**
- Modify: `src/token.ts`
- Modify: `tests/token.test.ts`

- [ ] **Step 1: Append failing tests**

Update import line:

```ts
import { slugify, padRandom, channelToken, initials, PARTICLES } from '../src/token.js';
```

Append:

```ts
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
    expect(initials('Анна')).toBe(''); // Cyrillic — not transliterated
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
```

Note about Cyrillic: NFKD doesn't transliterate Cyrillic to Latin, so the result is non-`[a-z0-9-]` and gets replaced with `-`, leaving an empty slug. The test confirms this is the expected fallback trigger.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `initials is not a function`.

- [ ] **Step 3: Add `initials` and `PARTICLES` to `src/token.ts`**

Append:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `initials` and `PARTICLES` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/token.ts tests/token.test.ts
git commit -m "add initials helper and PARTICLES list"
```

---

## Task 5: `dmToken` + `fallbackInitials`

**Files:**
- Modify: `src/token.ts`
- Modify: `tests/token.test.ts`

- [ ] **Step 1: Append failing tests**

Update import:

```ts
import { slugify, padRandom, channelToken, initials, PARTICLES, dmToken, fallbackInitials } from '../src/token.js';
```

Append:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `dmToken is not a function`.

- [ ] **Step 3: Add `dmToken` and `fallbackInitials` to `src/token.ts`**

Add to imports at top of file:

```ts
import { createHash, randomBytes } from 'node:crypto';
```

(Replace the existing single `randomBytes` import.)

Append:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/token.ts tests/token.test.ts
git commit -m "add dmToken and fallbackInitials"
```

---

## Task 6: `mpimToken` + `selfDmToken`

**Files:**
- Modify: `src/token.ts`
- Modify: `tests/token.test.ts`

- [ ] **Step 1: Append failing tests**

Update import:

```ts
import { slugify, padRandom, channelToken, initials, PARTICLES, dmToken, fallbackInitials, mpimToken, selfDmToken } from '../src/token.js';
```

Append:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `mpimToken is not a function`.

- [ ] **Step 3: Add `mpimToken` and `selfDmToken` to `src/token.ts`**

Append:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/token.ts tests/token.test.ts
git commit -m "add mpimToken and selfDmToken"
```

---

## Task 7: `makeSlug` assembly

**Files:**
- Create: `src/slug.ts`
- Create: `tests/slug.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/slug.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/slug.js'`.

- [ ] **Step 3: Implement `src/slug.ts`**

```ts
import { channelToken, dmToken, mpimToken, selfDmToken, padRandom, Person } from './token.js';

export type SlugInput =
  | { type: 'channel'; channelName: string }
  | { type: 'dm'; inviter: Person; other: Person }
  | { type: 'mpim'; inviter: Person; others: Person[] }
  | { type: 'self' };

export const VISIO_BASE = 'https://visio.numerique.gouv.fr';

export function makeSlug(input: SlugInput): string {
  const token = (() => {
    switch (input.type) {
      case 'channel': return channelToken(input.channelName);
      case 'dm': return dmToken(input.inviter, input.other);
      case 'mpim': return mpimToken(input.inviter, input.others);
      case 'self': return selfDmToken();
    }
  })();
  return `pdi-${token}-${padRandom(3)}`;
}

export function makeUrl(input: SlugInput): string {
  return `${VISIO_BASE}/${makeSlug(input)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/slug.ts tests/slug.test.ts
git commit -m "add makeSlug assembly"
```

---

## Task 8: `formatMessage`

**Files:**
- Create: `src/format.ts`
- Create: `tests/format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatMessage } from '../src/format.js';

describe('formatMessage', () => {
  it('returns URL alone when no subject', () => {
    expect(formatMessage({ url: 'https://visio.numerique.gouv.fr/pdi-empl-xyz' }))
      .toBe('https://visio.numerique.gouv.fr/pdi-empl-xyz');
  });
  it('treats empty string subject as no subject', () => {
    expect(formatMessage({ url: 'https://x/y', subject: '' }))
      .toBe('https://x/y');
    expect(formatMessage({ url: 'https://x/y', subject: '   ' }))
      .toBe('https://x/y');
  });
  it('bolds the subject above the URL', () => {
    expect(formatMessage({ url: 'https://x/y', subject: 'Rétro sprint' }))
      .toBe('*Rétro sprint*\nhttps://x/y');
  });
  it('trims the subject', () => {
    expect(formatMessage({ url: 'https://x/y', subject: '  Hello  ' }))
      .toBe('*Hello*\nhttps://x/y');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/format.js'`.

- [ ] **Step 3: Implement `src/format.ts`**

```ts
export function formatMessage({ url, subject }: { url: string; subject?: string | null }): string {
  const trimmed = subject?.trim();
  if (!trimmed) return url;
  return `*${trimmed}*\n${url}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/format.ts tests/format.test.ts
git commit -m "add formatMessage"
```

---

## Task 9: Slack API wrapper with cache

**Files:**
- Create: `src/slack.ts`
- Create: `tests/slack.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/slack.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/slack.js'`.

- [ ] **Step 3: Implement `src/slack.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/slack.ts tests/slack.test.ts
git commit -m "add cached Slack API wrapper"
```

---

## Task 10: Bolt app with `/visio` handler

**Files:**
- Create: `src/app.ts`

This task uses `@slack/bolt`'s `AwsLambdaReceiver`, which expects the `(event, context)` shape produced by Scaleway Serverless Functions (compatible with AWS Lambda Proxy Integration). Verified compatible: `event.body`, `event.headers`, `event.isBase64Encoded`.

- [ ] **Step 1: Implement `src/app.ts`**

Create `src/app.ts`:

```ts
import { App, AwsLambdaReceiver } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { createSlackClient } from './slack.js';
import { makeUrl } from './slug.js';
import { formatMessage } from './format.js';

const signingSecret = process.env.SLACK_SIGNING_SECRET;
const botToken = process.env.SLACK_BOT_TOKEN;
if (!signingSecret) throw new Error('SLACK_SIGNING_SECRET missing');
if (!botToken) throw new Error('SLACK_BOT_TOKEN missing');

export const receiver = new AwsLambdaReceiver({ signingSecret });

export const app = new App({
  token: botToken,
  receiver,
});

const web = new WebClient(botToken);
const slack = createSlackClient(web);

app.command('/visio', async ({ command, ack, respond }) => {
  await ack();

  const subject = command.text?.trim();
  const url = await resolveUrl({
    channelId: command.channel_id,
    channelName: command.channel_name,
    userId: command.user_id,
  });

  await respond({
    response_type: 'in_channel',
    text: formatMessage({ url, subject }),
  });
});

async function resolveUrl({
  channelId,
  channelName,
  userId,
}: {
  channelId: string;
  channelName: string;
  userId: string;
}): Promise<string> {
  // Slack channel_name conventions:
  //   regular channel: "general", "ppp-emplois", etc.
  //   1↔1 DM:          "directmessage"
  //   group DM:        "mpdm-…" or "group_dm"
  //   private channel: actual name
  if (channelName === 'directmessage') {
    const members = await slack.getMembers(channelId);
    const others = members.filter((m) => m !== userId);
    if (others.length === 0) return makeUrl({ type: 'self' });
    if (others.length === 1) {
      const [inviter, other] = await Promise.all([
        slack.getUser(userId),
        slack.getUser(others[0]!),
      ]);
      return makeUrl({
        type: 'dm',
        inviter: { name: inviter.name, userId: inviter.id },
        other: { name: other.name, userId: other.id },
      });
    }
    // group DM with channel_name "directmessage" — fall through to mpim
  }

  if (channelName.startsWith('mpdm-') || channelName === 'group_dm' || channelName === 'directmessage') {
    const members = await slack.getMembers(channelId);
    const others = members.filter((m) => m !== userId);
    const [inviter, ...rest] = await Promise.all([
      slack.getUser(userId),
      ...others.map((id) => slack.getUser(id)),
    ]);
    return makeUrl({
      type: 'mpim',
      inviter: { name: inviter!.name, userId: inviter!.id },
      others: rest.map((u) => ({ name: u.name, userId: u.id })),
    });
  }

  return makeUrl({ type: 'channel', channelName });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: PASS — `app.ts` has no tests yet (covered by smoke test in Task 14).

- [ ] **Step 4: Commit**

```bash
git add src/app.ts
git commit -m "add bolt app and /visio handler"
```

---

## Task 11: Scaleway handler entry point

**Files:**
- Create: `src/handler.ts`

Scaleway Serverless Functions Node.js runtime expects either:
- `exports.handler = async (event, context) => ({statusCode, body, headers})`
- or a default ESM export with the same shape.

Bolt's `AwsLambdaReceiver` returns exactly this shape from `start()`.

- [ ] **Step 1: Implement `src/handler.ts`**

Avoid top-level await — wrap lazily so esbuild's CJS output stays portable across Node versions.

```ts
import { receiver } from './app.js';

type LambdaEvent = { httpMethod?: string; headers?: Record<string, string>; body?: string; isBase64Encoded?: boolean };
type LambdaResult = { statusCode: number; body?: string; headers?: Record<string, string> };
type LambdaHandler = (event: LambdaEvent, context: unknown) => Promise<LambdaResult>;

let cached: Promise<LambdaHandler> | null = null;
function getHandler(): Promise<LambdaHandler> {
  if (!cached) cached = receiver.start() as Promise<LambdaHandler>;
  return cached;
}

export const handler: LambdaHandler = async (event, context) => {
  const h = await getHandler();
  return h(event, context);
};

export default handler;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: produces `dist/handler.js`. No errors.

- [ ] **Step 4: Sanity-check the bundle**

Run: `ls -lh dist/handler.js && head -1 dist/handler.js`
Expected: file exists, < 2 MB.

- [ ] **Step 5: Commit**

```bash
git add src/handler.ts
git commit -m "add Scaleway handler entry point"
```

---

## Task 12: Slack app manifest

**Files:**
- Create: `manifest.yml`

This manifest matches the spec's Section 3. It is versioned so the Slack app can be recreated from source.

- [ ] **Step 1: Create `manifest.yml`**

```yaml
display_information:
  name: Visio
  description: Crée un lien visio (visio.numerique.gouv.fr) depuis Slack
  background_color: "#0066cc"

features:
  bot_user:
    display_name: Visio
    always_online: false

  slash_commands:
    - command: /visio
      description: Créer un lien visio
      usage_hint: "[sujet optionnel]"
      should_escape: false
      url: https://REPLACE-WITH-SCALEWAY-URL/

oauth_config:
  scopes:
    bot:
      - commands
      - users:read
      - im:read
      - mpim:read

settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

- [ ] **Step 2: Commit**

```bash
git add manifest.yml
git commit -m "add Slack app manifest"
```

---

## Task 13: README with deploy steps

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md` with deploy-aware content**

```markdown
# slash-visio

Slack `/visio` slash command that posts a `https://visio.numerique.gouv.fr/pdi-XXXX-YYY` link with channel/DM-aware slug.

See [`docs/superpowers/specs/2026-05-12-slash-visio-design.md`](docs/superpowers/specs/2026-05-12-slash-visio-design.md) for the design.

## Develop

```sh
npm install
cp .env.example .env  # fill SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN
npm test              # unit tests
npm run typecheck
npm run smoke         # local end-to-end smoke test (signs a fake Slack request)
```

## Slack app setup

1. Create a Slack app at https://api.slack.com/apps using `manifest.yml` (replace `REPLACE-WITH-SCALEWAY-URL` with your Scaleway function URL after deploy).
2. Install to workspace → get `Bot User OAuth Token` (xoxb-…) and `Signing Secret` (Basic Information → App Credentials).
3. Set both as Scaleway function env vars (see below).

## Deploy to Scaleway

Requires the [Scaleway CLI (`scw`)](https://www.scaleway.com/en/docs/developer-tools/scaleway-cli/) authenticated to your project.

```sh
npm run build

scw function create \
  name=slash-visio \
  runtime=node20 \
  handler=handler.handler \
  memory-limit=256 \
  min-scale=0 \
  max-scale=5 \
  region=fr-par

# Set env vars (replace values):
scw function set-env name=slash-visio key=SLACK_SIGNING_SECRET value=…
scw function set-env name=slash-visio key=SLACK_BOT_TOKEN value=…

scw function deploy name=slash-visio zip-file=./dist
```

After first deploy, copy the assigned URL (`https://<id>.functions.fnc.fr-par.scw.cloud/`) into:
- `manifest.yml` under `slash_commands[0].url`, and
- the Slack app's slash command Request URL (Slack app dashboard → Slash Commands → `/visio`)

## Layout

```
src/        TypeScript source
tests/      Vitest unit tests
manifest.yml  Slack app manifest
docs/       Spec and implementation plan
dist/       Bundled handler (build output, gitignored)
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "expand README with setup and deploy steps"
```

---

## Task 14: Local end-to-end smoke test

**Files:**
- Create: `scripts/smoke.sh`

Manually sign a Slack-style request and POST it to a locally-run bundle. Confirms the full path: signature verify → command dispatch → slug generation → response format.

- [ ] **Step 1: Create `scripts/smoke.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${SLACK_SIGNING_SECRET:?Set SLACK_SIGNING_SECRET (the one from your Slack app)}"
: "${SLACK_BOT_TOKEN:?Set SLACK_BOT_TOKEN (e.g. xoxb-fake for channel-only smoke test)}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Build
( cd "$ROOT" && npm run build )

# Write a local HTTP wrapper next to the bundle.
# CJS so it can `require` the esbuild CJS bundle directly without interop quirks.
WRAPPER="$ROOT/dist/local-server.cjs"
cat > "$WRAPPER" <<'EOF'
const http = require('node:http');
const mod = require('./handler.js');
const handler = mod.handler || mod.default || mod;

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString('utf8');
  const event = {
    httpMethod: req.method,
    headers: req.headers,
    body,
    isBase64Encoded: false,
  };
  const result = await handler(event, {});
  res.statusCode = result.statusCode || 200;
  for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, String(v));
  res.end(result.body || '');
}).listen(3000, () => console.log('listening on :3000'));
EOF

node "$WRAPPER" &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f \"$WRAPPER\"" EXIT
sleep 1

# Build a signed request mimicking Slack
TS=$(date +%s)
BODY="token=xxx&team_id=T1&channel_id=C1&channel_name=nuage&user_id=U1&user_name=test&command=%2Fvisio&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Ffake"
BASE="v0:${TS}:${BODY}"
SIG="v0=$(printf '%s' "$BASE" | openssl dgst -sha256 -hmac "$SLACK_SIGNING_SECRET" -hex | awk '{print $2}')"

echo "POSTing to local handler with signed body:"
curl -sS -X POST http://localhost:3000/ \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Slack-Request-Timestamp: $TS" \
  -H "X-Slack-Signature: $SIG" \
  --data "$BODY"
echo
```

- [ ] **Step 2: Make it executable and run**

Run: `chmod +x scripts/smoke.sh && scripts/smoke.sh`
Expected: prints a JSON response with `text` containing a URL matching `https://visio.numerique.gouv.fr/pdi-nuag-[a-z0-9]{3}`.

If the test fails because of `SLACK_BOT_TOKEN` (the channel path doesn't call Slack APIs but `app.ts` constructs a `WebClient` at module load), set `SLACK_BOT_TOKEN=xoxb-fake` for the smoke test — it's only needed for DM resolution.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke.sh
git commit -m "add local smoke test script"
```

---

## After all tasks

- All unit tests green: `npm test`
- Typecheck clean: `npm run typecheck`
- Bundle builds: `npm run build`
- Smoke test produces a valid `pdi-XXXX-YYY` URL: `scripts/smoke.sh`

Deploy follows the README. After deploy:
1. Copy the Scaleway URL into the Slack app's `/visio` Request URL.
2. Run `/visio` in a Slack channel — expect a public message with the URL.
3. Run `/visio Rétro sprint` — expect `*Rétro sprint*\n<URL>`.
4. Run `/visio` in a DM with another person — verify the slug contains both initials.
