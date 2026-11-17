import { describe, expect, it } from 'vitest';
import {
  brusselsDate,
  classifyFreshness,
  formatHour,
  isPromoActive,
  observationLabel,
} from '../src/core/freshness.ts';
import type { Chain, Offer } from '../src/core/types.ts';

const now = new Date('2026-11-17T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

describe('classifyFreshness', () => {
  it.each([
    [0, 'fresh'],
    [47.9, 'fresh'],
    [48, 'fresh'],
    [48.1, 'stale'],
    [72, 'stale'],
    [72.1, 'expired'],
    [-0.5, 'fresh'],
    [-2, 'expired'],
  ] as const)('%s h → %s', (h, expected) => {
    expect(classifyFreshness(ago(h), now)).toBe(expected);
  });

  it('date illisible → expired', () => {
    expect(classifyFreshness('pas une date', now)).toBe('expired');
  });
});

describe('isPromoActive (heure de Bruxelles)', () => {
  const promo = { price: 1, validFrom: '2026-11-16', validTo: '2026-11-22' };
  it('bornes incluses', () => {
    expect(isPromoActive(promo, new Date('2026-11-16T00:30:00+01:00'))).toBe(true);
    expect(isPromoActive(promo, new Date('2026-11-22T23:30:00+01:00'))).toBe(true);
  });
  it('hors période → inactive, même si le relevé est récent', () => {
    expect(isPromoActive(promo, new Date('2026-11-23T00:10:00+01:00'))).toBe(false);
    expect(isPromoActive(promo, new Date('2026-11-15T23:59:00+01:00'))).toBe(false);
  });
  it('utilise la date de Bruxelles et non UTC', () => {
    // 23:30 UTC le 15 = 00:30 le 16 à Bruxelles (UTC+1 en novembre)
    expect(brusselsDate(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16');
    expect(isPromoActive(promo, new Date('2026-11-15T23:30:00Z'))).toBe(true);
  });
});

describe('libellés', () => {
  const colruyt: Chain = { id: 'colruyt', name: 'Colruyt', domain: 'colruyt.be', coverage: 'full', priceScope: 'store', coverageNote: '' };
  const aldi: Chain = { ...colruyt, id: 'aldi', name: 'Aldi', domain: 'aldi.be', priceScope: 'national' };
  const offer = (chainId: string): Offer => ({
    chainId,
    productKey: 'x',
    name: 'x',
    price: 1,
    observedAt: '2026-11-16T07:00:00Z', // 8 h à Bruxelles
    sourceUrl: 'https://example.invalid',
  });

  it('formatHour', () => {
    expect(formatHour(new Date('2026-11-16T07:00:00Z'))).toBe('8 h');
    expect(formatHour(new Date('2026-11-16T16:05:00Z'))).toBe('17 h 05');
  });

  it('prix par magasin : mentionne le magasin de référence', () => {
    expect(observationLabel(offer('colruyt'), colruyt, 'Anderlecht')).toBe(
      'Prix relevé sur colruyt.be le 16/11 à 8 h, magasin de référence : Anderlecht',
    );
  });

  it('prix national : pas de magasin de référence', () => {
    expect(observationLabel(offer('aldi'), aldi, 'peu importe')).toBe('Prix relevé sur aldi.be le 16/11 à 8 h');
  });
});
