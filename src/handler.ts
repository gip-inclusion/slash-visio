import { receiver } from './app.js';

type LambdaEvent = { httpMethod?: string; headers?: Record<string, string>; body?: string; isBase64Encoded?: boolean };
type LambdaResult = { statusCode: number; body?: string; headers?: Record<string, string | number | boolean> };
type LambdaHandler = (event: LambdaEvent, context: unknown) => Promise<LambdaResult>;

type AwsHandler = Awaited<ReturnType<typeof receiver.start>>;

let cached: Promise<AwsHandler> | null = null;
function getHandler(): Promise<AwsHandler> {
  if (!cached) cached = receiver.start();
  return cached;
}

export const handler: LambdaHandler = async (event, context) => {
  const h = await getHandler();
  // Scaleway events are compatible with AwsEventV1; cast to satisfy the type.
  // The receiver does not use the callback — Scaleway resolves via the returned Promise.
  return h(event as Parameters<AwsHandler>[0], context, () => {});
};

export default handler;
