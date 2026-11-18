import { describe, expect, it } from 'vitest';
import { Catalog, searchTokens, type CatalogFile } from '../src/web/catalog.ts';

const obs = '2026-11-18T06:00:00Z';
const p = (k: string, n: string, extra: object = {}) => ({ c: 0, k, n, p: 1, o: obs, u: 'u', ...extra });
const file: CatalogFile = {
  version: 1,
  generatedAt: obs,
  chains: [{ id: 'aldi', name: 'Aldi', domain: 'aldi.be', coverage: 'full', priceScope: 'national', coverageNote: '' }],
  products: [
    p('1', 'Spaghetti carbonara', { g: 'plats' }),
    p('2', 'Spaghettis', { g: 'pates-riz', e: [[9, 80]] }),
    p('3', 'Œufs plein air', { g: 'oeufs' }),
    p('4', 'Pâté de campagne', { g: 'charcuterie' }),
    p('5', 'Pâtes penne', { g: 'pates-riz' }),
    p('6', 'Eau buccale', { g: 'hygiene' }),
    p('7', 'Eau minérale', { g: 'eau', e: [[9, 90]] }),
  ],
  stores: [],
  postcodes: [],
  attributions: [],
};
const cat = new Catalog(file);
const first = (q: string) => cat.products[cat.search(q)[0]!]!.n;

describe('recherche', () => {
  it('œ = oe, singulier = pluriel', () => {
    expect(searchTokens('Œufs')).toEqual(['oeuf']);
    expect(first('oeuf')).toBe('Œufs plein air');
    expect(first('oeufs')).toBe('Œufs plein air');
  });
  it('produits de base avant plats préparés et non alimentaire', () => {
    expect(first('spaghetti')).toBe('Spaghettis');
    expect(first('eau')).toBe('Eau minérale');
  });
  it('« pates » trouve les pâtes, pas le pâté', () => {
    expect(first('pates')).toBe('Pâtes penne');
    expect(first('pâté')).toBe('Pâté de campagne');
  });
});
