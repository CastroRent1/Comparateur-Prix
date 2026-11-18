import { normalizeText } from '../core/matching.ts';
import type { Chain, Offer, Store } from '../core/types.ts';
import type { CatalogFile, CatalogProduct } from '../../scripts/lib/catalog.ts';

export type { CatalogFile, CatalogProduct };

/** Rayons relégués en recherche (plats préparés, non alimentaire). */
const SEARCH_DEMOTED = new Set(['plats', 'hygiene', 'entretien', 'animaux']);

/** Singulier / pluriel confondus : « spaghettis », « bananes », « oeufs » → sans s/x final. */
// « pates » (pâtes) ne doit pas devenir « pate » (pâté).
const NO_STEM = new Set(['pates']);

function stem(t: string): string {
  return t.length > 3 && /[sx]$/.test(t) && !NO_STEM.has(t) ? t.slice(0, -1) : t;
}

export function searchTokens(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter(Boolean)
    .map(stem);
}

/** Catalogue chargé et indexé pour la recherche. */
export class Catalog {
  readonly chains: Chain[];
  readonly products: CatalogProduct[];
  readonly stores: CatalogFile['stores'];
  readonly postcodes: CatalogFile['postcodes'];
  readonly attributions: string[];
  readonly generatedAt: string;
  private readonly searchTokens: string[][];
  private readonly byKey = new Map<string, number>();

  constructor(file: CatalogFile) {
    this.chains = file.chains;
    this.products = file.products;
    this.stores = file.stores;
    this.postcodes = file.postcodes;
    this.attributions = file.attributions;
    this.generatedAt = file.generatedAt;
    this.searchTokens = file.products.map((p) => searchTokens(`${p.n} ${p.b ?? ''}`));
    file.products.forEach((p, i) => this.byKey.set(this.keyOf(i), i));
  }

  chainOf(i: number): Chain {
    return this.chains[this.products[i]!.c]!;
  }

  /** Clé stable d'un produit d'une version du catalogue à l'autre. */
  keyOf(i: number): string {
    const p = this.products[i]!;
    return `${this.chains[p.c]!.id}:${p.k}`;
  }

  indexOf(key: string): number | undefined {
    return this.byKey.get(key);
  }

  toOffer(i: number): Offer {
    const p = this.products[i]!;
    return {
      chainId: this.chains[p.c]!.id,
      productKey: p.k,
      name: p.n,
      brand: p.b,
      size: p.s ? { amount: p.s[0], unit: p.s[1] } : undefined,
      sizeText: p.st,
      price: p.p,
      promo: p.pr ? { price: p.pr.p, label: p.pr.l, validFrom: p.pr.f, validTo: p.pr.t, requiresCard: p.pr.card } : undefined,
      observedAt: p.o,
      sourceUrl: p.u,
    };
  }

  /** Équivalents d'un produit, groupés par enseigne, meilleurs d'abord. */
  /** Équivalents par enseigne, score de 0 à 1, du plus ressemblant au moins ressemblant. */
  equivalentsByChain(i: number): Map<string, Array<{ index: number; score: number }>> {
    const out = new Map<string, Array<{ index: number; score: number }>>();
    for (const [index, score] of this.products[i]!.e ?? []) {
      const chainId = this.chainOf(index).id;
      let list = out.get(chainId);
      if (!list) out.set(chainId, (list = []));
      list.push({ index, score: score / 100 }); // stocké ×100 dans le catalogue
    }
    for (const list of out.values()) list.sort((a, b) => b.score - a.score);
    return out;
  }

  /**
   * Recherche : chaque mot tapé doit être le début d'un mot du produit.
   * Classement : mots du nom en tête, puis noms courts (plus génériques).
   */
  search(query: string, limit = 40): number[] {
    const q = searchTokens(query);
    if (q.length === 0) return [];
    const scored: Array<[number, number]> = [];
    this.searchTokens.forEach((toks, i) => {
      let score = 0;
      for (const qt of q) {
        const pos = toks.findIndex((t) => t.startsWith(qt));
        if (pos < 0) return;
        score += (pos === 0 ? 3 : 1) + (toks[pos] === qt ? 1 : 0);
      }
      const p = this.products[i]!;
      score -= toks.length * 0.1; // noms courts = produits de base
      if (p.e?.length) score += 0.3; // vendu aussi ailleurs : produit courant, comparable
      if (p.g && SEARCH_DEMOTED.has(p.g)) score -= 0.6; // « spaghetti » : les pâtes avant les plats préparés
      scored.push([i, score]);
    });
    return scored
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([i]) => i);
  }

  /** Recherche de localité par code postal ou nom. */
  findPlaces(query: string, limit = 8): CatalogFile['postcodes'] {
    const q = normalizeText(query);
    if (!q) return [];
    if (/^\d+$/.test(q)) return this.postcodes.filter((p) => p[0].startsWith(q)).slice(0, limit);
    return this.postcodes.filter((p) => normalizeText(p[1]).startsWith(q)).slice(0, limit);
  }

  storesAsCore(): Store[] {
    return this.stores.map((s) => ({ ...s }));
  }
}

export async function loadCatalog(url = 'data/catalog.json'): Promise<Catalog> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Catalogue introuvable (HTTP ${res.status})`);
  return new Catalog((await res.json()) as CatalogFile);
}
