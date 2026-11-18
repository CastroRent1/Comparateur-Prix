import { describe, expect, it } from 'vitest';
import { EquivalenceIndex, findMatches, matchScore, normalizeEan, tokenize, variantPenalty } from '../src/core/matching.ts';

describe('tokenize', () => {
  it('retire accents, mots vides et quantités', () => {
    expect(tokenize("Café moulu Douwe Egberts l'Or 250 g")).toEqual(['cafe', 'moulu', 'douwe', 'egberts', 'or']);
  });
});

describe('normalizeEan', () => {
  it('GTIN-14 avec zéros de tête = EAN-13', () => {
    expect(normalizeEan('05400141183553')).toBe(normalizeEan('5400141183553'));
  });
  it('rejette les codes trop courts', () => {
    expect(normalizeEan('0012')).toBeUndefined();
  });
});

describe('matchScore', () => {
  it('EAN identique → 1', () => {
    expect(matchScore({ name: 'A', ean: '5400141183553' }, { name: 'B', ean: '05400141183553' })).toEqual({ score: 1, reason: 'ean' });
  });
  it('EAN différents → 0', () => {
    expect(matchScore({ name: 'Lait', ean: '5400000000001' }, { name: 'Lait', ean: '5400000000002' }).score).toBe(0);
  });
  it('formats incompatibles → 0', () => {
    expect(matchScore({ name: 'Spaghetti Barilla 500 g' }, { name: 'Spaghetti Barilla 1 kg' })).toEqual({ score: 0, reason: 'size-mismatch' });
  });
  it('même produit, libellés différents → score élevé', () => {
    const r = matchScore(
      { name: 'Barilla Spaghetti n°5 500g', brand: 'Barilla' },
      { name: 'Spaghetti n° 5 - 500 g', brand: 'BARILLA' },
    );
    expect(r.score).toBeGreaterThan(0.8);
  });
});

describe('findMatches', () => {
  it('trie par score et signale les correspondances à vérifier', () => {
    const target = { name: 'Lait demi-écrémé 1 L', brand: 'Inza' };
    const res = findMatches(target, [
      { name: 'Lait entier 1 L', brand: 'Inza' },
      { name: 'Lait demi écrémé 1L', brand: 'Inza' },
      { name: 'Jus d’orange 1 L', brand: 'Inza' },
    ]);
    expect(res[0]!.product.name).toBe('Lait demi écrémé 1L');
    expect(res[0]!.needsReview).toBe(false);
    expect(res.map((r) => r.product.name)).not.toContain('Jus d’orange 1 L');
  });
});

describe('EquivalenceIndex', () => {
  const products = [
    { id: 0, chainId: 'aldi', name: 'Lait entier', brand: 'MILSANI', size: { amount: 1, unit: 'l' as const } },
    { id: 1, chainId: 'delhaize', name: 'Lait Entier', brand: 'Inza', size: { amount: 1, unit: 'l' as const } },
    { id: 2, chainId: 'delhaize', name: 'Lait Entier Chocolaté', brand: 'Delhaize', size: { amount: 1, unit: 'l' as const } },
    { id: 3, chainId: 'aldi', name: 'Café moulu dessert', size: { amount: 0.5, unit: 'kg' as const } },
    { id: 4, chainId: 'delhaize', name: 'Café Dessert Grains', size: { amount: 0.5, unit: 'kg' as const } },
    { id: 5, chainId: 'delhaize', name: 'Café Dessert Moulu', brand: 'Delhaize', size: { amount: 0.5, unit: 'kg' as const } },
    { id: 6, chainId: 'delhaize', name: 'Riz basmati', size: { amount: 1, unit: 'kg' as const } },
  ];
  const index = new EquivalenceIndex(products, new Set(['delhaize']));

  it('mot de variante d’un seul côté : pas d’équivalence (lait ≠ lait chocolaté, moulu ≠ grains)', () => {
    expect(variantPenalty(['lait', 'entier'], ['lait', 'entier', 'chocolate'])).toBeCloseTo(0.7);
    const lait = index.equivalents(0).get('delhaize')!.map((e) => e.id);
    expect(lait).toEqual([1]);
    const cafe = index.equivalents(3).get('delhaize')!.map((e) => e.id);
    expect(cafe).toEqual([5]);
  });
});

describe('isMultipack', () => {
  it('6 × 1 l face à 1 l, mais pas 1,5 l face à 1 l', async () => {
    const { isMultipack } = await import('../src/core/matching.ts');
    expect(isMultipack({ amount: 5.993, unit: 'l' }, { amount: 1, unit: 'l' })).toBe(true);
    expect(isMultipack({ amount: 1.5, unit: 'l' }, { amount: 1, unit: 'l' })).toBe(false);
    expect(isMultipack({ amount: 6, unit: 'l' }, { amount: 1, unit: 'kg' })).toBe(false);
    expect(isMultipack({ amount: 20, unit: 'l' }, { amount: 1, unit: 'l' })).toBe(false);
  });
});
