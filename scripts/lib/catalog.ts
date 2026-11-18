import { categorize } from '../../src/core/categories.ts';
import { packCount, parseQuantity } from '../../src/core/units.ts';
import type { EquivalenceIndex, IndexedProduct } from '../../src/core/matching.ts';
import type { Chain, Offer, Store } from '../../src/core/types.ts';

/**
 * Format compact du catalogue chargé par l'appli (clés courtes, une ligne
 * par produit). Doit rester synchronisé avec src/web/catalog.ts.
 */
export interface CatalogProduct {
  /** index de l'enseigne dans `chains` */
  c: number;
  k: string;
  n: string;
  b?: string;
  /** format [quantité, unité] */
  s?: [number, 'kg' | 'l' | 'piece'];
  st?: string;
  p?: number;
  pr?: { p: number; l?: string; f: string; t: string; card?: boolean };
  /** relevé : ISO */
  o: string;
  u: string;
  /** rayon commun (src/core/categories.ts) */
  g?: string;
  /** type dans le rayon (« entier », « demi »…) */
  t?: string;
  /** équivalents : [index produit, score ×100] */
  e?: Array<[number, number]>;
}

export interface CatalogFile {
  version: 1;
  generatedAt: string;
  chains: Chain[];
  products: CatalogProduct[];
  stores: Array<Pick<Store, 'id' | 'chainId' | 'name' | 'city' | 'lat' | 'lon' | 'priceRef'>>;
  postcodes: Array<[string, string, number, number]>;
  attributions: string[];
}

export interface BuildInput {
  now: Date;
  chains: Chain[];
  offers: Offer[];
  stores: Store[];
  storesAttribution?: string;
  postcodes: Array<[string, string, number, number]>;
  postcodesAttribution?: string;
  makeIndex: (products: IndexedProduct[]) => EquivalenceIndex;
}

export function buildCatalog(input: BuildInput): CatalogFile {
  const chains = input.chains.map(({ id, name, domain, coverage, priceScope, coverageNote }) => ({
    id,
    name,
    domain,
    coverage,
    priceScope,
    coverageNote,
  }));
  const chainIdx = new Map(chains.map((c, i) => [c.id, i]));

  const offers = input.offers
    .filter((o) => chainIdx.has(o.chainId))
    .sort((a, b) => a.chainId.localeCompare(b.chainId) || a.name.localeCompare(b.name, 'fr'));

  const indexed: IndexedProduct[] = offers.map((o, id) => ({
    id,
    chainId: o.chainId,
    name: o.name,
    brand: o.brand,
    size: o.size,
    sizeText: o.sizeText,
  }));
  const index = input.makeIndex(indexed);

  const products: CatalogProduct[] = offers.map((o, id) => {
    const eq: Array<[number, number]> = [];
    for (const list of index.equivalents(id).values()) for (const e of list) eq.push([e.id, Math.round(e.score * 100)]);
    const p: CatalogProduct = {
      c: chainIdx.get(o.chainId)!,
      k: o.productKey,
      n: o.name,
      o: o.observedAt,
      u: o.sourceUrl,
    };
    if (o.brand) p.b = o.brand;
    if (o.size) p.s = [o.size.amount, o.size.unit];
    if (o.sizeText) {
      // Lot relevé avant la détection des lots : « 1l » pour 6 × 1 l.
      const unit = parseQuantity(o.sizeText);
      const n = o.size && unit && !/\dx|\d\s+x\s/i.test(o.sizeText) ? packCount(o.size, unit) : undefined;
      p.st = n ? `${n} x ${o.sizeText}` : o.sizeText;
    }
    if (o.price !== undefined) p.p = o.price;
    if (o.promo) p.pr = { p: o.promo.price, l: o.promo.label, f: o.promo.validFrom, t: o.promo.validTo, card: o.promo.requiresCard };
    const { category, type } = categorize(o);
    if (category) p.g = category;
    if (type) p.t = type;
    if (eq.length) p.e = eq;
    return p;
  });

  return {
    version: 1,
    generatedAt: input.now.toISOString(),
    chains,
    products,
    stores: input.stores.map(({ id, chainId, name, city, lat, lon, priceRef }) => ({ id, chainId, name, city, lat, lon, priceRef })),
    postcodes: input.postcodes,
    attributions: [input.storesAttribution, input.postcodesAttribution].filter((a): a is string => !!a),
  };
}
