import { effectivePrice } from '../core/basket.ts';
import { CATEGORIES, categoryById, isBio } from '../core/categories.ts';
import type { Freshness } from '../core/freshness.ts';
import type { Catalog } from './catalog.ts';

/**
 * Parcours par rayon : tous les produits d'un rayon (« Lait »), toutes
 * marques et enseignes confondues, du moins cher au plus cher AU LITRE /
 * KILO / PIÈCE, avec le prix utilisable aujourd'hui (promo en cours comprise,
 * hors promos réservées aux cartes de fidélité).
 */

export interface BrowseFilter {
  category: string;
  type?: string;
  chain?: string;
  bio?: boolean;
}

export interface BrowseRow {
  index: number;
  /** Prix du produit aujourd'hui (€). */
  price: number;
  isPromo: boolean;
  freshness: Freshness;
  /** Prix au kilo / litre / pièce (€), si le format est connu. */
  unitPrice?: number;
  unit?: 'kg' | 'l' | 'piece';
}

export interface Facet {
  id: string;
  label: string;
  count: number;
}

export interface BrowseResult {
  label: string;
  rows: BrowseRow[];
  /** Types du rayon (filtres enseigne et bio appliqués), « Autres » en dernier. */
  types: Facet[];
  chains: Facet[];
  bioCount: number;
  /** Unité de comparaison principale du rayon. */
  mainUnit?: 'kg' | 'l' | 'piece';
}

export const OTHER_TYPE = 'autres';

/** Rayons ayant au moins un produit, dans l'ordre de CATEGORIES. */
export function categoryFacets(cat: Catalog): Facet[] {
  const counts = new Map<string, number>();
  for (const p of cat.products) if (p.g) counts.set(p.g, (counts.get(p.g) ?? 0) + 1);
  return CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({ id: c.id, label: c.label, count: counts.get(c.id)! }));
}

export function browse(cat: Catalog, f: BrowseFilter, now: Date): BrowseResult {
  const def = categoryById(f.category);
  const all: BrowseRow[] = [];
  const typeCounts = new Map<string, number>();
  const chainCounts = new Map<string, number>();
  let bioCount = 0;

  cat.products.forEach((p, index) => {
    if (p.g !== f.category) return;
    const offer = cat.toOffer(index);
    const eff = effectivePrice(offer, { now });
    if (!eff) return; // prix trop ancien ou absent : on ne l'affiche pas
    const chainId = cat.chainOf(index).id;
    const bio = isBio(p.n);
    const type = p.t ?? OTHER_TYPE;

    // Compteurs : chaque facette compte avec les AUTRES filtres appliqués.
    const okChain = !f.chain || f.chain === chainId;
    const okBio = !f.bio || bio;
    const okType = !f.type || f.type === type;
    if (okChain && okBio) typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    if (okBio && okType) chainCounts.set(chainId, (chainCounts.get(chainId) ?? 0) + 1);
    if (okChain && okType && bio) bioCount++;
    if (!(okChain && okBio && okType)) return;

    const price = eff.cents / 100;
    const row: BrowseRow = { index, price, isPromo: eff.isPromo, freshness: eff.freshness };
    if (p.s && p.s[0] > 0) {
      row.unitPrice = price / p.s[0];
      row.unit = p.s[1];
    }
    all.push(row);
  });

  // Unité principale (la plus fréquente) d'abord, puis les autres unités,
  // puis les formats inconnus ; dans chaque groupe, prix unitaire croissant.
  const unitCounts = new Map<string, number>();
  for (const r of all) if (r.unit) unitCounts.set(r.unit, (unitCounts.get(r.unit) ?? 0) + 1);
  const unitOrder = [...unitCounts.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
  const rank = (r: BrowseRow) => (r.unit ? unitOrder.indexOf(r.unit) : unitOrder.length);
  all.sort((a, b) => rank(a) - rank(b) || (a.unitPrice ?? a.price) - (b.unitPrice ?? b.price) || a.price - b.price);

  const order = def?.typeOrder ?? [];
  const pos = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const types: Facet[] = [...(def?.types ?? [])]
    .sort((a, b) => pos(a.id) - pos(b.id))
    .filter((t) => typeCounts.has(t.id))
    .map((t) => ({ id: t.id, label: t.label, count: typeCounts.get(t.id)! }));
  if (typeCounts.has(OTHER_TYPE) && types.length) types.push({ id: OTHER_TYPE, label: 'Autres', count: typeCounts.get(OTHER_TYPE)! });

  const chains: Facet[] = cat.chains
    .filter((c) => chainCounts.has(c.id))
    .map((c) => ({ id: c.id, label: c.name, count: chainCounts.get(c.id)! }));

  return {
    label: def?.label ?? f.category,
    rows: all,
    types,
    chains,
    bioCount,
    mainUnit: unitOrder[0] as BrowseResult['mainUnit'],
  };
}
