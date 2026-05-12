# slash-visio — Design

**Status**: draft
**Date**: 2026-05-12
**Author**: Louis-Jean Teitelbaum
**Project**: `slash-visio` — Slack slash command that posts a `https://visio.numerique.gouv.fr/` link

## Context

We want a `/visio` slash command in Slack that posts a ready-to-use video meeting link to the current channel/DM. The link points to [La Suite Numérique Meet](https://visio.numerique.gouv.fr/) — open-source video conferencing operated by the French government.

### Why not the official Meet External API?

[`suitenumerique/meet`](https://github.com/suitenumerique/meet) exposes an OAuth2 External API (`docs/resource_server.yaml`) to create rooms programmatically. It requires application credentials, an OAuth `client_credentials` flow with the delegated user's email passed as `scope`, and the user's email to match a ProConnect account.

We don't need any of that. Tchap (the French government's Matrix-based messenger) solves the same problem trivially:

```kotlin
// tchapgouv/tchap-android: MessageComposerViewModel.kt
private const val LASUITE_VISIO_URL = "https://visio.numerique.gouv.fr/"
fun generateVisioUrl() = "$LASUITE_VISIO_URL${segment(3)}-${segment(4)}-${segment(3)}"
```

Meet creates a room on first visit to any slug-shaped URL. No API call needed. Same model as `meet.jit.si/<any-slug>`. We adopt the Tchap pattern and customize the slug format to carry channel/DM context.

Trade-off accepted: rooms are not pre-registered with `access_level: trusted`, no telephony PIN, no audit trail on the Meet side. Sufficient for our use case (team-internal meetings).

## URL format

All URLs follow:

```
https://visio.numerique.gouv.fr/pdi-XXXX-YYY
```

Strict `3-4-3` format (compatible with Tchap and Meet's expectations).

- `pdi` — constant prefix (Plateforme de l'Inclusion)
- `XXXX` — 4-char contextual token (derived from channel name or DM participants)
- `YYY` — 3-char random suffix, `[a-z0-9]`, generated via `crypto.randomBytes`

## Contextual token rules (`XXXX`)

### Slugify spec (used everywhere)

Reference algorithm (TypeScript):

```ts
const slugify = (s: string) =>
  s.normalize('NFKD')
   .replace(/\p{Diacritic}/gu, '')  // strip combining diacriticals (NFKD splits them out)
   .toLowerCase()
   .replace(/[^a-z0-9-]+/g, '-')    // non-alphanum → dash
   .replace(/-+/g, '-')             // collapse dashes
   .replace(/^-|-$/g, '');          // trim leading/trailing dashes
```

Applies to channel names and display names alike.

### Channel (`/visio` in a public or private channel)

Slack payload provides `channel_name`. Algorithm:

1. Slugify (see above)
2. Split on `-`
3. If 2+ segments: drop the first segment (always, regardless of length)
4. Concatenate remaining segments (no separator), take first 4 chars
5. If result < 4 chars: pad with random `[a-z0-9]`

| Channel name | Token | Reason |
|---|---|---|
| `abc-projets` | `proj` | 2 segments → drop `abc` → `projets` → `proj` |
| `nuage` | `nuag` | 1 segment, kept as-is |
| `qa-poc-galaxie` | `pocg` | 3 segments → drop `qa` → `pocgalaxie` → `pocg` |
| `direction-marketing` | `mark` | 2 segments → drop `direction` → `marketing` → `mark` |
| `équipe-rouge` | `roug` | Slugify → 2 segments → drop `equipe` → `rouge` → `roug` |
| `ai` | `ai??` | 1 segment, 2 chars → pad with 2 random |

### DM 1↔1

Slack payload provides `user_id` (invoker) and `channel_id` (IM). We call `conversations.members(channel_id)` to find the other participant, then `users.info` for each display name.

Algorithm:

1. Invoker first, other second
2. For each: compute 2 initials (see below)
3. Concatenate: `<inviter:2><other:2>` → 4 chars total

**Initials rule** (applied to one person's display name):

1. Slugify the display name (see slugify spec below). Split on whitespace into words.
2. If the **first word** is hyphenated, take the first letter of each hyphen-separated component → first 2 letters. Done.
3. Otherwise: take first letter of the first word, plus first letter of the **first non-particle word that follows**. If no non-particle word remains (e.g., mononym), repeat the first letter.

Particle list (configurable constant): `de`, `du`, `des`, `le`, `la`, `van`, `von`, `der`, `den`, `di`, `da`

Examples:
- `Marie-Claire Dubois` → first word `marie-claire` is hyphenated → `mc`
- `Jean de Bonnefoy` → `j` (Jean) + first non-particle after = `b` (Bonnefoy, skipping `de`) → `jb`
- `Olga van der Berg` → `o` (Olga) + first non-particle after = `b` (Berg, skipping `van`, `der`) → `ob`
- `Aïcha Benali` → `a` + `b` → `ab`
- `Yuki` (mononym) → `y` + `y` (repeat) → `yy`

| Display name | Initials |
|---|---|
| `Marie-Claire Dubois` | `mc` |
| `Jean de Bonnefoy` | `jb` |
| `Olga van der Berg` | `ob` |
| `Aïcha Benali` | `ab` |
| `Kwame Mensah` | `km` |
| `Yuki Tanaka` | `yt` |
| `Diego Vázquez` | `dv` |

| DM scenario | Token |
|---|---|
| Aïcha Benali (inv) ↔ Yuki Tanaka | `abyt` |
| Olga van der Berg (inv) ↔ Diego Vázquez | `obdv` |
| Marie-Claire Dubois (inv) ↔ Henri Renard | `mchr` |

### mpim (group DM, 3+ people)

Algorithm:

1. Invoker first, others sorted alphabetically by display name
2. 1 initial per person (first letter of first name only, or first letter of first component for hyphenated)
3. Concatenate, take first 4 chars
4. If < 4: pad with random `[a-z0-9]`

| mpim scenario | Token |
|---|---|
| Kwame Mensah (inv) + Aïcha Benali + Yuki Tanaka | `kay?` (1 random pad) |
| Marie-Claire Dubois (inv) + Aïcha Benali + Kwame Mensah + Yuki Tanaka | `maky` |
| Inviter + 4 others (5 total) | First 4 alphabetically (after invoker first) |

### Edge cases

- **DM with self**: 4 random chars `[a-z0-9]`
- **Display name in non-Latin script** (CJK, Arabic, Cyrillic without transliteration): slugify yields empty. Fallback: 2 deterministic chars from a hash of the user's Slack `user_id` (`crypto.createHash('sha256')` first 2 hex chars).
- **Missing context** (no `channel_name`, no `members`): 4 random chars

## Slack integration

### App configuration

Slack app created at https://api.slack.com/apps. Manifest checked in to repo (`manifest.yml`) so the app config is reproducible.

**Bot scopes**:

| Scope | Reason |
|---|---|
| `commands` | Receive `/visio` |
| `users:read` | `users.info` to resolve display names (DMs only) |
| `im:read` | `conversations.members` on IMs |
| `mpim:read` | `conversations.members` on group DMs |

### Slash command

- Command: `/visio`
- Request URL: Scaleway function URL (set after deploy)
- Short description: "Créer un lien visio"
- Usage hint: `[sujet optionnel]`
- Response type: `in_channel` (public)

### Signature verification

`@slack/bolt`'s HTTP receiver verifies `X-Slack-Signature` and timestamp (±5 min tolerance) using `SLACK_SIGNING_SECRET`. No bypass.

### Environment variables

| Var | Purpose |
|---|---|
| `SLACK_SIGNING_SECRET` | HMAC verification |
| `SLACK_BOT_TOKEN` | `xoxb-…` for `users.info` and `conversations.members` |

Set in Scaleway console, never in repo.

### Message format

- With subject (`/visio Rétro sprint`): `*Rétro sprint*\n<URL>`
- Without subject: `<URL>` alone (Slack unfurls automatically)

Slack natively attributes the slash command response to the invoker in the UI, so we don't add a "créé par @user" line. Re-evaluate after first deploy if attribution isn't visible.

## Architecture

Single Scaleway Serverless Function. No state, no DB.

```
Slack ─POST x-www-form-urlencoded─> Function
                                       │
                                       ├─ verify signature (bolt)
                                       ├─ if DM: conversations.members + users.info
                                       ├─ compute token (channel | dm | mpim | random)
                                       ├─ generate slug (pdi-XXXX-YYY)
                                       └─ respond in_channel with formatted message
```

**In-memory cache** (Map with 5-min TTL) for `users.info` and `conversations.members`. Helps on warm instances. Optional — can be disabled with a flag.

## Deployment

| Setting | Value |
|---|---|
| Resource type | Scaleway Serverless Function (not Container) |
| Runtime | Node.js 20 |
| Memory | 256 MB |
| Timeout | 10 s |
| Min instances | 0 (scale-to-zero) |
| Region | `fr-par` |

**Build**: `esbuild src/handler.ts --bundle --platform=node --target=node20 --outfile=dist/handler.js`. Bundle includes `@slack/bolt`. Target size <2 MB zipped.

**Initial deploy**: `scw function deploy` from local machine using the Scaleway CLI.

**CI/CD (later)**: GitHub Action on push to `main` runs build + `scw function deploy`. Not required for MVP.

**Slash command URL**: Scaleway assigns `https://<id>.functions.fnc.fr-par.scw.cloud/`. Paste this into the Slack app's slash command configuration.

**Logs**: structured JSON to stdout via `console.log({ts, channel_id, user_id_hash, slug, latency_ms})`. Visible in Scaleway Cockpit. No PII (no display names, only Slack IDs, and `user_id` is hashed).

## Project layout

```
slash-visio/
├── src/
│   ├── handler.ts          # Scaleway entry point (exports handler)
│   ├── app.ts              # @slack/bolt setup (HTTP receiver)
│   ├── slug.ts             # makeSlug({type, channelName, members, inviter}) -> string
│   ├── token.ts            # channelToken, dmToken, mpimToken, padRandom, particles[]
│   ├── slack.ts            # cached users.info / conversations.members
│   └── format.ts           # formatMessage({url, subject}) -> string
├── tests/
│   ├── token.test.ts
│   ├── slug.test.ts
│   └── format.test.ts
├── manifest.yml            # Slack app manifest (versioned)
├── package.json
├── tsconfig.json
├── .gitignore              # node_modules, dist, .env
├── .env.example
└── README.md
```

**Separation**: `slug.ts`, `token.ts`, `format.ts` are pure (no I/O). `slack.ts` isolates Slack API calls. `handler.ts`/`app.ts` are glue.

### npm scripts

| Script | Purpose |
|---|---|
| `dev` | `tsx watch src/handler.ts` (local) |
| `build` | `esbuild …` |
| `test` | `vitest run` |
| `lint` | `eslint` |
| `deploy` | `scw function deploy …` |

## Tests

Vitest. Tests written before implementation (TDD).

### `token.test.ts`

Channels (deterministic):
- `channelToken('abc-projets')` → `proj`
- `channelToken('nuage')` → `nuag`
- `channelToken('qa-poc-galaxie')` → `pocg`
- `channelToken('direction-marketing')` → `mark`
- `channelToken('équipe-rouge')` → `roug`
- `channelToken('ai')` matches `/^ai[a-z0-9]{2}$/` (padding is random — assert shape, not value)

DM (deterministic):
- `dmToken({inviter: 'Aïcha Benali', other: 'Yuki Tanaka'})` → `abyt`
- `dmToken({inviter: 'Olga van der Berg', other: 'Diego Vázquez'})` → `obdv`
- `dmToken({inviter: 'Marie-Claire Dubois', other: 'Henri Renard'})` → `mchr`
- `dmToken({inviter: 'Jean de Bonnefoy', other: 'Sophie Vidal'})` → `jbsv`

mpim (deterministic prefix, random pad if any):
- 3 people (Kwame inv + Aïcha + Yuki) → matches `/^kay[a-z0-9]$/`
- 4 people (Marie-Claire inv + Aïcha + Kwame + Yuki) → `maky`

Edge cases:
- Non-Latin display name (e.g., `田中`) → falls back to deterministic 2-char hash of user_id; assert determinism across calls
- Self-DM → matches `/^[a-z0-9]{4}$/`

### `slug.test.ts`

Assembly:
- Every output starts with `pdi-`
- Every output matches `/^pdi-[a-z0-9]{4}-[a-z0-9]{3}$/`
- Random suffix differs across consecutive calls (entropy check)

### `format.test.ts`

- Without subject: `formatMessage({url: 'https://…/pdi-…', subject: null})` → `'https://…/pdi-…'`
- With subject: `formatMessage({url: '…', subject: 'Rétro sprint'})` → `'*Rétro sprint*\nhttps://…'`

### No integration tests for `@slack/bolt`

The framework is well-tested upstream. If smoke-testing locally is needed, use `ExpressReceiver` + a POSTed fixture.

## Known limitations

1. **Collisions** are possible (3-char random space ≈ 46k per channel-token). Accepted as negligible for our usage. If a collision occurs, two meetings share a room. No server-side check.
2. **Public-by-URL**: anyone with the URL can join. Same as Tchap's existing pattern, same as `meet.jit.si`. If `access_level: trusted` is needed in the future, migrate to the External API path.
3. **Non-Latin display names** fall back to a `user_id`-based hash. Token loses human meaning but stays deterministic.
4. **Group DMs with 5+ people**: only the first 4 (invoker + 3 alphabetical) appear in the token. Token still works as a Meet slug; just doesn't represent everyone.

## Out of scope (for now)

- OAuth integration with Meet External API (no `trusted` rooms, no telephony PIN)
- Multi-workspace install / distribution (this is a single-workspace internal bot)
- Persistent room registry / "/visio list my recent rooms"
- Calendar integration
- Custom slug ("create a room I can reuse named `pdi-empl-team`")
