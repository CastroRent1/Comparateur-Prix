import { describe, expect, it } from 'vitest';
import { Catalog, type CatalogFile } from '../src/web/catalog.ts';
import { compare, defaultPick, planLines } from '../src/web/plan.ts';

const now = new Date('2026-11-17T12:00:00Z');
const obs = '2026-11-17T06:00:00Z';

const file: CatalogFile = {
  version: 1,
  generatedAt: obs,
  chains: [
    { id: 'aldi', name: 'Aldi', domain: 'aldi.be', coverage: 'full', priceScope: 'national', coverageNote: '' },
    { id: 'delhaize', name: 'Delhaize', domain: 'delhaize.be', coverage: 'full', priceScope: 'national', coverageNote: '' },
    { id: 'colruyt', name: 'Colruyt', domain: 'colruyt.be', coverage: 'none', priceScope: 'store', coverageNote: '' },
  ],
  products: [
    { c: 0, k: '1', n: 'Lait demi-écrémé', b: 'MILSANI', s: [1, 'l'], p: 0.99, o: obs, u: 'https://www.aldi.be/1', e: [[2, 80], [3, 60]] },
    { c: 0, k: '2', n: 'Riz basmati', s: [1, 'kg'], p: 2.49, o: obs, u: 'https://www.aldi.be/2', e: [[4, 75]] },
    { c: 1, k: 'D1', n: 'Lait demi-écrémé', b: 'Delhaize', s: [1, 'l'], p: 1.15, o: obs, u: 'https://www.delhaize.be/D1', e: [[0, 80]] },
    { c: 1, k: 'D2', n: 'Lait demi-écrémé bio', b: 'Delhaize', s: [1, 'l'], p: 1.45, o: obs, u: 'https://www.delhaize.be/D2' },
    { c: 1, k: 'D3', n: 'Riz basmati', b: 'Delhaize', s: [0.5, 'kg'], p: 1.6, o: obs, u: 'https://www.delhaize.be/D3', e: [[1, 75]] },
  ],
  stores: [
    { id: 'a-pres', chainId: 'aldi', name: 'Aldi Près', lat: 50.83, lon: 4.345 },
    { id: 'a-loin', chainId: 'aldi', name: 'Aldi Loin', lat: 50.85, lon: 4.36 },
    { id: 'd-1', chainId: 'delhaize', name: 'Delhaize 1', lat: 50.832, lon: 4.35 },
    { id: 'c-1', chainId: 'colruyt', name: 'Colruyt 1', lat: 50.83, lon: 4.346 },
  ],
  postcodes: [
    ['1060', 'Saint-Gilles', 50.8268, 4.3456],
    ['1050', 'Ixelles', 50.8333, 4.3667],
  ],
  attributions: [],
};
const cat = new Catalog(file);
const place = { lat: 50.8268, lon: 4.3456, label: '1060 Saint-Gilles' };

describe('Catalog', () => {
  it('recherche par début de mot, sans accents', () => {
    const hits = cat.search('lait ecre');
    expect(hits.map((i) => cat.keyOf(i))).toEqual(expect.arrayContaining(['aldi:1', 'delhaize:D1', 'delhaize:D2']));
    expect(cat.search('riz').length).toBe(2);
    expect(cat.search('x')).toEqual([]);
  });
  it('localités par code ou par nom', () => {
    expect(cat.findPlaces('106').map((p) => p[1])).toEqual(['Saint-Gilles']);
    expect(cat.findPlaces('ixel').map((p) => p[0])).toEqual(['1050']);
  });
});

describe('planLines', () => {
  it('choisit le meilleur équivalent, sauf choix contraire ou « aucun »', () => {
    const auto = planLines(cat, [{ key: 'aldi:1', qty: 2 }]);
    expect(auto.lines[0]!.offers.map((o) => o.productKey)).toEqual(['1', 'D1']);
    const picked = planLines(cat, [{ key: 'aldi:1', qty: 1, picks: { delhaize: 'delhaize:D2' } }]);
    expect(picked.lines[0]!.offers.map((o) => o.productKey)).toEqual(['1', 'D2']);
    const none = planLines(cat, [{ key: 'aldi:1', qty: 1, picks: { delhaize: null } }]);
    expect(none.lines[0]!.offers.map((o) => o.productKey)).toEqual(['1']);
  });
  it('par défaut : le moins cher au litre parmi les équivalents proches, pas forcément le plus ressemblant', () => {
    const c = new Catalog({
      ...file,
      products: [
        { c: 0, k: 'A', n: 'Lait entier', s: [1, 'l'], p: 0.89, o: obs, u: 'https://www.aldi.be/A', e: [[1, 90], [2, 80], [3, 60]] },
        { c: 1, k: 'B', n: 'Lait entier', b: 'Marque', s: [1, 'l'], p: 2.65, o: obs, u: 'https://www.delhaize.be/B' },
        { c: 1, k: 'C', n: 'Lait entier', b: 'Delhaize', s: [1, 'l'], p: 1.09, o: obs, u: 'https://www.delhaize.be/C' },
        { c: 1, k: 'D', n: 'Lait', b: 'Delhaize', s: [1, 'l'], p: 0.5, o: obs, u: 'https://www.delhaize.be/D' },
      ],
    });
    const list = c.equivalentsByChain(0).get('delhaize')!;
    expect(list.map((o) => o.score)).toEqual([0.9, 0.8, 0.6]);
    expect(c.products[defaultPick(c, list)!]!.k).toBe('C'); // D est moins cher mais trop peu ressemblant
    expect(planLines(c, [{ key: 'aldi:A', qty: 1 }]).lines[0]!.offers.map((o) => o.productKey)).toEqual(['A', 'C']);
  });
  it('signale les produits disparus du catalogue', () => {
    expect(planLines(cat, [{ key: 'aldi:999', qty: 1 }]).unknown).toHaveLength(1);
  });
});

describe('compare', () => {
  const items = [
    { key: 'aldi:1', qty: 2 },
    { key: 'aldi:2', qty: 1 },
  ];

  it('magasins proches : le plus proche par enseigne, enseignes non couvertes exclues', () => {
    const cmp = compare(cat, items, place, 5, now);
    expect(cmp.mode).toBe('nearby');
    expect(cmp.result.stores.map((s) => s.store.id)).toEqual(['a-pres', 'd-1']);
    // Aldi : 2 × 0,99 + 2,49 ; Delhaize : 2 × 1,15 + riz 500 g ramené à 1 kg (2 × 1,60)
    expect(cmp.result.stores[0]!.total).toBe(4.47);
    expect(cmp.result.stores[1]!.total).toBe(5.5);
    expect(cmp.result.stores[1]!.priced.find((p) => p.lineId === 'aldi:2')!.scale).toBe(2);
  });

  it('rayon trop petit : enseigne signalée', () => {
    const cmp = compare(cat, items, place, 0.1, now);
    expect(cmp.result.stores).toHaveLength(0);
    expect(cmp.noStoreInRadius).toEqual(['Aldi', 'Delhaize']);
  });

  it('sans localisation : une ligne par enseigne couverte', () => {
    const cmp = compare(cat, items, null, 5, now);
    expect(cmp.mode).toBe('chains');
    expect(cmp.result.stores.map((s) => s.chain.id)).toEqual(['aldi', 'delhaize']);
  });
});
