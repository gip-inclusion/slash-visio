import { App, AwsLambdaReceiver } from '@slack/bolt';
import { makeUrl } from './slug.js';
import { formatMessage } from './format.js';
import { createHash } from 'node:crypto';

const signingSecret = process.env.SLACK_SIGNING_SECRET;
const botToken = process.env.SLACK_BOT_TOKEN;
if (!signingSecret) throw new Error('SLACK_SIGNING_SECRET missing');
if (!botToken) throw new Error('SLACK_BOT_TOKEN missing');

export const receiver = new AwsLambdaReceiver({ signingSecret });

export const app = new App({
  token: botToken,
  receiver,
});

app.command('/visio', async ({ command, ack }) => {
  const t0 = Date.now();

  const subject = command.text?.trim();
  const url = resolveUrl(command.channel_name);

  const slug = url.substring(url.lastIndexOf('/') + 1);
  const userIdHash = createHash('sha256').update(command.user_id).digest('hex').substring(0, 8);
  console.log({
    ts: new Date().toISOString(),
    channel_id: command.channel_id,
    user_id_hash: userIdHash,
    slug,
    latency_ms: Date.now() - t0,
  });

  await ack({
    response_type: 'in_channel',
    text: formatMessage({ url, subject }),
  });
});

// No Slack API calls: anything we can't read from the payload alone -> random.
// Channel/private channel names yield a context token; DMs/mpims get 4 random.
function resolveUrl(channelName: string): string {
  if (
    channelName === 'directmessage' ||
    channelName === 'group_dm' ||
    channelName.startsWith('mpdm-')
  ) {
    return makeUrl({ type: 'self' });
  }
  return makeUrl({ type: 'channel', channelName });
}
