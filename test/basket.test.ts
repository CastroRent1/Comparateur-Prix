import { describe, expect, it } from 'vitest';
import { computeBasket, effectivePrice, type BasketLine } from '../src/core/basket.ts';
import type { Chain, Offer, Store } from '../src/core/types.ts';

const now = new Date('2026-11-17T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

const chains: Chain[] = [
  { id: 'aldi', name: 'Aldi', domain: 'aldi.be', coverage: 'full', priceScope: 'national', coverageNote: '' },
  { id: 'colruyt', name: 'Colruyt', domain: 'colruyt.be', coverage: 'full', priceScope: 'store', coverageNote: '' },
  { id: 'lidl', name: 'Lidl', domain: 'lidl.be', coverage: 'promos', priceScope: 'national', coverageNote: '' },
  { id: 'jumbo', name: 'Jumbo', domain: 'jumbo.com', coverage: 'none', priceScope: 'national', coverageNote: '' },
];

const stores: Store[] = [
  { id: 'aldi-1', chainId: 'aldi', name: 'Aldi 1', lat: 50.83, lon: 4.35 },
  { id: 'col-1', chainId: 'colruyt', name: 'Colruyt 1', lat: 50.83, lon: 4.34, priceRef: 'ref-a' },
  { id: 'col-2', chainId: 'colruyt', name: 'Colruyt 2', lat: 50.84, lon: 4.36, priceRef: 'ref-b' },
  { id: 'lidl-1', chainId: 'lidl', name: 'Lidl 1', lat: 50.83, lon: 4.35 },
  { id: 'jumbo-1', chainId: 'jumbo', name: 'Jumbo 1', lat: 50.83, lon: 4.35 },
  { id: 'aldi-loin', chainId: 'aldi', name: 'Aldi Liège', lat: 50.63, lon: 5.57 },
];

const offer = (chainId: string, price: number | undefined, extra: Partial<Offer> = {}): Offer => ({
  chainId,
  productKey: `${chainId}-${price}-${extra.priceRef ?? ''}`,
  name: 'Produit',
  price,
  observedAt: ago(2),
  sourceUrl: 'https://example.invalid',
  ...extra,
});

describe('effectivePrice', () => {
  const opts = { now };
  it('prend la promo active si elle est moins chère', () => {
    const e = effectivePrice(offer('aldi', 2, { promo: { price: 1.5, validFrom: '2026-11-16', validTo: '2026-11-22' } }), opts);
    expect(e).toEqual({ cents: 150, isPromo: true, freshness: 'fresh' });
  });
  it('ignore une promo expirée même si le relevé est récent', () => {
    const e = effectivePrice(offer('aldi', 2, { promo: { price: 1.5, validFrom: '2026-11-01', validTo: '2026-11-08' } }), opts);
    expect(e?.isPromo).toBe(false);
  });
  it('ignore les promos carte sauf option', () => {
    const o = offer('aldi', 2, { promo: { price: 1, validFrom: '2026-11-16', validTo: '2026-11-22', requiresCard: true } });
    expect(effectivePrice(o, opts)?.cents).toBe(200);
    expect(effectivePrice(o, { now, includeCardPromos: true })?.cents).toBe(100);
  });
  it('un prix de plus de 72 h est inutilisable', () => {
    expect(effectivePrice(offer('aldi', 2, { observedAt: ago(80) }), opts)).toBeUndefined();
  });
  it('une promo valide reste utilisable même si le relevé est vieux', () => {
    const o = offer('aldi', 2, { observedAt: ago(100), promo: { price: 1.2, validFrom: '2026-11-16', validTo: '2026-11-22' } });
    expect(effectivePrice(o, opts)).toEqual({ cents: 120, isPromo: true, freshness: 'fresh' });
  });
});

describe('computeBasket', () => {
  const lines: BasketLine[] = [
    {
      id: 'lait',
      label: 'Lait',
      quantity: 3,
      offers: [
        offer('aldi', 1.05),
        offer('colruyt', 1.1, { priceRef: 'ref-a' }),
        offer('colruyt', 0.99, { priceRef: 'ref-b' }),
        offer('lidl', undefined, { promo: { price: 0.8, validFrom: '2026-11-17', validTo: '2026-11-22' } }),
      ],
    },
    {
      id: 'pain',
      label: 'Pain',
      quantity: 1,
      offers: [offer('aldi', 1.49, { observedAt: ago(60) }), offer('colruyt', 1.6, { priceRef: 'ref-a' })],
    },
  ];
  const origin = { lat: 50.8272, lon: 4.3466 };
  const res = computeBasket(lines, stores, chains, { now, origin, maxDistanceKm: 10 });

  it('exclut les enseignes non couvertes et les magasins trop loin', () => {
    const ids = res.stores.map((s) => s.store.id);
    expect(ids).not.toContain('jumbo-1');
    expect(ids).not.toContain('aldi-loin');
    expect(ids).not.toContain('lidl-1');
  });

  it('applique le prix du magasin de référence (Colruyt)', () => {
    const col1 = res.stores.find((s) => s.store.id === 'col-1')!;
    const col2 = res.stores.find((s) => s.store.id === 'col-2')!;
    expect(col1.priced.find((p) => p.lineId === 'lait')!.unitPrice).toBe(1.1);
    expect(col2.priced.find((p) => p.lineId === 'lait')!.unitPrice).toBe(0.99);
    expect(col2.complete).toBe(false);
    expect(col2.missing).toEqual([{ lineId: 'pain', label: 'Pain' }]);
  });

  it('calcule en centimes, sans erreur d’arrondi', () => {
    const aldi = res.stores.find((s) => s.store.id === 'aldi-1')!;
    expect(aldi.total).toBe(4.64); // 3 × 1,05 + 1,49
    expect(aldi.staleCount).toBe(1);
  });

  it('classe les paniers complets d’abord, par total', () => {
    expect(res.stores.map((s) => s.store.id)).toEqual(['aldi-1', 'col-1', 'col-2']);
  });

  it('Lidl apparaît seulement dans « promos seulement »', () => {
    expect(res.promosOnly).toHaveLength(1);
    expect(res.promosOnly[0]!.promoPrice).toBe(0.8);
    expect(res.promosOnly[0]!.store.id).toBe('lidl-1');
  });

  it('inclut l’avertissement', () => {
    expect(res.disclaimer).toMatch(/fait foi/);
  });
});

describe('ramené au même format', () => {
  it('compte un 500 g au prorata pour un panier en 1 kg', async () => {
    const { scaleFactor } = await import('../src/core/basket.ts');
    expect(scaleFactor({ amount: 1, unit: 'kg' }, { amount: 0.5, unit: 'kg' })).toBe(2);
    expect(scaleFactor({ amount: 1, unit: 'kg' }, { amount: 0.99, unit: 'kg' })).toBe(1);
    expect(scaleFactor({ amount: 1, unit: 'kg' }, { amount: 1, unit: 'l' })).toBe(1);
    const res = computeBasket(
      [
        {
          id: 'riz',
          label: 'Riz 1 kg',
          quantity: 1,
          targetSize: { amount: 1, unit: 'kg' },
          offers: [offer('aldi', 1.2, { size: { amount: 0.5, unit: 'kg' } })],
        },
      ],
      [stores[0]!],
      chains,
      { now },
    );
    expect(res.stores[0]!.total).toBe(2.4);
    expect(res.stores[0]!.priced[0]!.scale).toBe(2);
  });
});
