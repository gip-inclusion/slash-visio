# slash-visio

Slack `/visio` slash command that posts a `https://visio.numerique.gouv.fr/pdi-XXXX-YYY` link with a channel-aware slug.

## Develop

```sh
npm install
cp .env.example .env  # fill SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN
npm test
npm run typecheck
npm run smoke         # local end-to-end smoke test (signs a fake Slack request)
```

## Slack app setup

1. Create a Slack app at https://api.slack.com/apps (manifest kept locally, gitignored).
2. Install to workspace → grab the **Bot User OAuth Token** (xoxb-…) and **Signing Secret** (Basic Information → App Credentials).
3. Add a `/visio` slash command with the Scaleway function URL as Request URL.
4. Set the secrets as Scaleway function env vars.

## Deploy to Scaleway

```sh
npm run build

scw function function create \
  name=slash-visio \
  namespace-id=<NS_ID> \
  runtime=node20 \
  handler=handler.handler \
  memory-limit=128 \
  min-scale=1 \
  max-scale=5 \
  privacy=public \
  http-option=enabled \
  secret-environment-variables.0.key=SLACK_SIGNING_SECRET \
  secret-environment-variables.0.value=… \
  secret-environment-variables.1.key=SLACK_BOT_TOKEN \
  secret-environment-variables.1.value=…

# upload zip via get-upload-url + PUT, then:
scw function function deploy <function-id>
```

After deploy, paste the assigned `https://<id>.functions.fnc.fr-par.scw.cloud/` URL as the Slack app's slash command Request URL.

## Usage stats

`scripts/visio-count-24h.sh` prints how many `/visio` invocations happened in the last 24h, with an hourly sparkline. It pulls from Scaleway Cockpit logs (Loki).

One-time setup:

```sh
scw cockpit token create name=visio-stats token-scopes.0=read_only_logs
# Drop the returned secret_key into .env as SCW_COCKPIT_LOG_TOKEN=… (shown once).
```

Then:

```sh
./scripts/visio-count-24h.sh           # count + sparkline
./scripts/visio-count-24h.sh -v        # also list each room (time + slug)
```

## Layout

```
src/room.ts      pure: slug generation + message formatting
src/handler.ts   Scaleway entry: signature verify + dispatch
tests/           Vitest unit tests
```
