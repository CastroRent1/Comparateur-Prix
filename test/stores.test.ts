import { describe, expect, it } from 'vitest';
import { classifyChain, osmToStore } from '../scripts/lib/stores.ts';

describe('classifyChain', () => {
  it.each([
    [{ brand: 'Aldi', name: 'Aldi' }, { chainId: 'aldi' }],
    [{ brand: 'ALDI' }, { chainId: 'aldi' }],
    [{ brand: 'Delhaize', name: 'Delhaize Saint-Gilles' }, { chainId: 'delhaize', format: 'delhaize' }],
    [{ brand: 'AD Delhaize', name: 'AD Delhaize Forest' }, { chainId: 'delhaize', format: 'ad' }],
    [{ brand: 'Carrefour Market' }, { chainId: 'carrefour', format: 'market' }],
    [{ brand: 'Carrefour', name: 'Carrefour Hyper Anderlecht' }, { chainId: 'carrefour', format: 'hyper' }],
    [{ brand: 'Colruyt' }, { chainId: 'colruyt' }],
  ])('%o', (tags, expected) => {
    expect(classifyChain(tags)).toEqual(expected);
  });

  it.each<Record<string, string>>([{ brand: 'Proxy Delhaize' }, { brand: "Shop'n Go" }, { brand: 'Carrefour Express' }, { brand: 'Spar' }, {}])(
    'exclut %o',
    (tags) => {
      expect(classifyChain(tags)).toBeUndefined();
    },
  );
});

describe('osmToStore', () => {
  it('nœud avec adresse', () => {
    expect(
      osmToStore({
        type: 'node',
        id: 42,
        lat: 50.8301234567,
        lon: 4.3456789,
        tags: { brand: 'Aldi', 'addr:city': 'Saint-Gilles', 'addr:street': 'Chaussée de Forest', 'addr:housenumber': '1', 'addr:postcode': '1060' },
      }),
    ).toEqual({
      id: 'osm-n42',
      chainId: 'aldi',
      name: 'Aldi Saint-Gilles',
      city: 'Chaussée de Forest 1, 1060, Saint-Gilles',
      lat: 50.830123,
      lon: 4.345679,
      priceRef: undefined,
      format: undefined,
    });
  });
  it('bâtiment (way) : utilise le centre ; Carrefour : référence = format', () => {
    const s = osmToStore({ type: 'way', id: 7, center: { lat: 50.5, lon: 4.5 }, tags: { brand: 'Carrefour Market' } });
    expect(s?.priceRef).toBe('market');
    expect(s?.lat).toBe(50.5);
  });
  it('hors Belgique → écarté', () => {
    expect(osmToStore({ type: 'node', id: 1, lat: 48.85, lon: 2.35, tags: { brand: 'Aldi' } })).toBeUndefined();
  });
});
