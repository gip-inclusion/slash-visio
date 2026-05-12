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
