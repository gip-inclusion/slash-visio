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
