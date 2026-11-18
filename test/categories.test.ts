import { describe, expect, it } from 'vitest';
import { categorize, delhaizePath, isBio } from '../src/core/categories.ts';
import { Catalog, type CatalogFile } from '../src/web/catalog.ts';
import { browse, categoryFacets } from '../src/web/browse.ts';

const dz = (path: string) => `https://www.delhaize.be/fr/shop/${path}/Nom-du-produit/p/S2006091800000200000`;

describe('categorize', () => {
  it('Aldi : catégorie de l’enseigne + type d’après le nom', () => {
    expect(categorize({ chainId: 'aldi', name: 'Lait demi-écrémé, 6 pcs', sourceUrl: 'u', category: 'melk' })).toEqual({ category: 'lait', type: 'demi' });
    expect(categorize({ chainId: 'aldi', name: 'Lait écrémé', sourceUrl: 'u', category: 'melk' })).toEqual({ category: 'lait', type: 'ecreme' });
    expect(categorize({ chainId: 'aldi', name: 'Lait demi-écrémé sans lactose', sourceUrl: 'u', category: 'melk' }).type).toBe('sans-lactose');
    expect(categorize({ chainId: 'aldi', name: 'Lait chocolaté entier', sourceUrl: 'u', category: 'melk' }).type).toBe('aromatise');
    expect(categorize({ chainId: 'aldi', name: 'Milkshake fraise ou banane', sourceUrl: 'u', category: 'melk' }).type).toBe('aromatise');
    expect(categorize({ chainId: 'aldi', name: "Boisson à l'avoine barista", sourceUrl: 'u', category: 'melk' }).type).toBe('vegetal');
  });

  it('Delhaize : chemin de rayon de l’URL, préfixe le plus long', () => {
    expect(delhaizePath(dz('Cremerie-fromage-et-alternatives-vegetales/Lait/Entier'))).toBe('Cremerie-fromage-et-alternatives-vegetales/Lait/Entier');
    expect(categorize({ chainId: 'delhaize', name: 'Lait Entier', sourceUrl: dz('Cremerie-fromage-et-alternatives-vegetales/Lait/Entier') })).toEqual({ category: 'lait', type: 'entier' });
    expect(categorize({ chainId: 'delhaize', name: 'Lait Frais 1.5 MG', sourceUrl: dz('Cremerie-fromage-et-alternatives-vegetales/Lait/Frais') }).type).toBe('demi');
    expect(categorize({ chainId: 'delhaize', name: 'Thon au naturel', sourceUrl: dz('Conserves/Poissons-en-conserve/Thon') }).category).toBe('poisson');
    expect(categorize({ chainId: 'delhaize', name: 'Haricots verts', sourceUrl: dz('Conserves/Legumes-en-conserve/Haricots') }).category).toBe('conserves');
  });

  it('sans catégorie d’enseigne : repli sur le nom, non alimentaire d’abord', () => {
    expect(categorize({ chainId: 'aldi', name: 'Œufs de poules élevées en plein air', sourceUrl: 'u' })).toEqual({ category: 'oeufs', type: 'plein-air' });
    expect(categorize({ chainId: 'aldi', name: 'Coca-Cola zero, 6 pcs', sourceUrl: 'u' })).toEqual({ category: 'sodas', type: 'cola' });
    expect(categorize({ chainId: 'aldi', name: 'Aliment pour chats au poulet', sourceUrl: 'u' }).category).toBe('animaux');
    expect(categorize({ chainId: 'aldi', name: 'Carte PlayStation 20 euros', sourceUrl: 'u' })).toEqual({});
    expect(isBio('Lait demi-écrémé Bio')).toBe(true);
    expect(isBio('Biscuits')).toBe(false);
  });
});

const obs = '2026-11-18T06:00:00Z';
const now = new Date('2026-11-18T12:00:00Z');
const file: CatalogFile = {
  version: 1,
  generatedAt: obs,
  chains: [
    { id: 'aldi', name: 'Aldi', domain: 'aldi.be', coverage: 'full', priceScope: 'national', coverageNote: '' },
    { id: 'delhaize', name: 'Delhaize', domain: 'delhaize.be', coverage: 'full', priceScope: 'national', coverageNote: '' },
  ],
  products: [
    { c: 0, k: 'a1', n: 'Lait entier', s: [1, 'l'], p: 0.89, o: obs, u: 'u', g: 'lait', t: 'entier' },
    { c: 1, k: 'd1', n: 'Lait Entier Belge', b: 'Delhaize', s: [6, 'l'], st: '6 x 1l', p: 8.09, o: obs, u: 'u', g: 'lait', t: 'entier' },
    { c: 1, k: 'd2', n: 'Lait Entier', b: 'Inza', s: [1, 'l'], p: 2.65, o: obs, u: 'u', g: 'lait', t: 'entier', pr: { p: 0.99, l: 'Promo', f: '2026-11-18', t: '2026-11-18' } },
    { c: 1, k: 'd3', n: 'Lait Demi-écrémé Bio', s: [1, 'l'], p: 1.39, o: obs, u: 'u', g: 'lait', t: 'demi' },
    { c: 1, k: 'd4', n: 'Lait concentré', s: [0.4, 'kg'], p: 2.0, o: obs, u: 'u', g: 'lait', t: 'cafe' },
    { c: 1, k: 'd5', n: 'Lait vitaminé', p: 1.1, o: obs, u: 'u', g: 'lait' },
    { c: 0, k: 'a2', n: 'Lait ancien', s: [1, 'l'], p: 0.5, o: '2026-11-10T06:00:00Z', u: 'u', g: 'lait', t: 'entier' },
    { c: 0, k: 'a3', n: 'Riz basmati', s: [1, 'kg'], p: 1.79, o: obs, u: 'u', g: 'pates-riz', t: 'riz' },
  ],
  stores: [],
  postcodes: [],
  attributions: [],
};
const cat = new Catalog(file);
const keys = (r: ReturnType<typeof browse>) => r.rows.map((x) => cat.products[x.index]!.k);

describe('browse', () => {
  it('tout le rayon, toutes marques : prix au litre croissant, promo du jour comprise, prix périmés exclus', () => {
    const r = browse(cat, { category: 'lait' }, now);
    expect(keys(r)).toEqual(['a1', 'd2', 'd1', 'd3', 'd4', 'd5']); // litres d'abord, puis kg, puis format inconnu
    expect(r.rows[1]).toMatchObject({ price: 0.99, isPromo: true, unitPrice: 0.99, unit: 'l' });
    expect(r.rows[2]!.unitPrice).toBeCloseTo(1.348, 3); // 8,09 € / 6 l
    expect(r.mainUnit).toBe('l');
    expect(r.label).toBe('Lait et boissons végétales');
  });

  it('filtres type, enseigne et bio ; chaque compteur tient compte des autres filtres', () => {
    const r = browse(cat, { category: 'lait', type: 'entier' }, now);
    expect(keys(r)).toEqual(['a1', 'd2', 'd1']);
    expect(r.chains).toEqual([{ id: 'aldi', label: 'Aldi', count: 1 }, { id: 'delhaize', label: 'Delhaize', count: 2 }]);
    expect(r.types.map((t) => `${t.id}:${t.count}`)).toEqual(['entier:3', 'demi:1', 'cafe:1', 'autres:1']);
    expect(keys(browse(cat, { category: 'lait', chain: 'aldi' }, now))).toEqual(['a1']);
    expect(keys(browse(cat, { category: 'lait', bio: true }, now))).toEqual(['d3']);
  });

  it('liste des rayons non vides', () => {
    expect(categoryFacets(cat).map((f) => `${f.id}:${f.count}`)).toEqual(['lait:7', 'pates-riz:1']);
  });
});
