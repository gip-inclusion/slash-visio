import { channelToken, padRandom } from './token.js';

export type SlugInput =
  | { type: 'channel'; channelName: string }
  | { type: 'self' };

export const VISIO_BASE = 'https://visio.numerique.gouv.fr';

export function makeSlug(input: SlugInput): string {
  const token = (() => {
    switch (input.type) {
      case 'channel': return channelToken(input.channelName);
      case 'self': return padRandom(4);
    }
  })();
  return `pdi-${token}-${padRandom(3)}`;
}

export function makeUrl(input: SlugInput): string {
  return `${VISIO_BASE}/${makeSlug(input)}`;
}
