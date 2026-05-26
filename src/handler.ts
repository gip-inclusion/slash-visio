import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { roomUrl, formatRoomMessage } from './room.js';

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
if (!SIGNING_SECRET) throw new Error('SLACK_SIGNING_SECRET missing');
if (!BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN missing');

const FIVE_MIN = 5 * 60;

type LambdaEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
};

type LambdaResult = {
  statusCode: number;
  body?: string;
  headers?: Record<string, string>;
};

function lowercaseHeaders(h: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of Object.keys(h)) out[k.toLowerCase()] = h[k];
  return out;
}

function verifySignature(headers: Record<string, string | undefined>, body: string): boolean {
  const ts = headers['x-slack-request-timestamp'];
  const sig = headers['x-slack-signature'];
  if (!ts || !sig) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > FIVE_MIN) return false;
  const mac = createHmac('sha256', SIGNING_SECRET!).update(`v0:${ts}:${body}`).digest('hex');
  const expected = Buffer.from(`v0=${mac}`);
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const handler = async (event: LambdaEvent): Promise<LambdaResult> => {
  const t0 = Date.now();
  const headers = lowercaseHeaders(event.headers);
  const raw = event.body ?? '';
  const body = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;

  if (!verifySignature(headers, body)) {
    return { statusCode: 401, body: 'invalid signature' };
  }

  const params = new URLSearchParams(body);
  const channelId = params.get('channel_id') ?? '';
  const channelName = params.get('channel_name') ?? '';
  const userId = params.get('user_id') ?? '';
  const subject = params.get('text')?.trim() ?? '';

  const url = roomUrl(channelName);
  const slug = url.substring(url.lastIndexOf('/') + 1);
  const userIdHash = createHash('sha256').update(userId).digest('hex').substring(0, 8);
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    channel_id: channelId,
    user_id_hash: userIdHash,
    slug,
    latency_ms: Date.now() - t0,
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      response_type: 'in_channel',
      text: formatRoomMessage({ url, subject }),
    }),
  };
};

export default handler;
