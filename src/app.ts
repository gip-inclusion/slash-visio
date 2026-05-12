import { App, AwsLambdaReceiver } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { createSlackClient } from './slack.js';
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

const web = new WebClient(botToken);
const slack = createSlackClient(web);

app.command('/visio', async ({ command, ack, respond }) => {
  const t0 = Date.now();
  await ack();

  const subject = command.text?.trim();
  const url = await resolveUrl({
    channelId: command.channel_id,
    channelName: command.channel_name,
    userId: command.user_id,
  });

  const slug = url.substring(url.lastIndexOf('/') + 1);
  const userIdHash = createHash('sha256').update(command.user_id).digest('hex').substring(0, 8);
  console.log({
    ts: new Date().toISOString(),
    channel_id: command.channel_id,
    user_id_hash: userIdHash,
    slug,
    latency_ms: Date.now() - t0,
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
