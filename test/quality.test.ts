import { describe, expect, it } from 'vitest';
import { formatProblem, qualityCheck } from '../scripts/lib/quality.ts';
import type { Offer } from '../src/core/types.ts';

const obs = '2026-11-18T09:00:00Z';
const lait = (key: string, price: number, amount: number, extra: Partial<Offer> = {}): Offer => ({
  chainId: 'delhaize',
  productKey: key,
  name: 'Lait Demi-écrémé',
  size: { amount, unit: 'l' },
  price,
  observedAt: obs,
  sourceUrl: `https://www.delhaize.be/fr/shop/Cremerie-fromage-et-alternatives-vegetales/Lait/Demi-ecreme/Lait/p/${key}`,
  ...extra,
});

describe('contrôle qualité', () => {
  it('format incohérent : pack 6 × 1 l à 8,09 € enregistré comme 1 l', () => {
    const bad = lait('A', 8.09, 1, { shownUnitPrice: { value: 1.35, unit: 'l' } });
    expect(formatProblem(bad)).toMatch(/8,09 €\/l, mais l'enseigne affiche 1,35 €\/l/);
    expect(formatProblem(lait('B', 8.09, 6, { shownUnitPrice: { value: 1.35, unit: 'l' } }))).toBeUndefined();
  });

  it('format : le prix au litre affiché correspond au prix promo du jour', () => {
    const promo = lait('C', 2.0, 1, {
      shownUnitPrice: { value: 1.0, unit: 'l' },
      promo: { price: 1.0, label: 'Promo', validFrom: '2026-11-18', validTo: '2026-11-18' },
    });
    expect(formatProblem(promo)).toBeUndefined();
  });

  it('prix aberrant : seulement vers le haut, et seulement dans un type assez fourni', () => {
    const normal = ['1', '2', '3', '4', '5'].map((k, i) => lait(k, 1.2 + i * 0.1, 1));
    const tropCher = lait('X', 10.19, 1);
    const tresBonMarche = lait('Y', 0.25, 1);
    const { kept, rejected } = qualityCheck([...normal, tropCher, tresBonMarche]);
    expect(rejected.map((r) => [r.productKey, r.reason])).toEqual([['X', 'prix-aberrant']]);
    expect(kept.map((o) => o.productKey)).toContain('Y');
    // Moins de 6 produits du même type : pas de jugement
    expect(qualityCheck([lait('1', 1.3, 1), lait('X', 10.19, 1)]).rejected).toEqual([]);
  });
});
