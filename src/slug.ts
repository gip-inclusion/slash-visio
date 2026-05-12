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
