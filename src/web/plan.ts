import { computeBasket, storePriceRef, type BasketLine, type BasketResult, type StoreBasket } from '../core/basket.ts';
import { distanceKm } from '../core/geo.ts';
import type { GeoPoint, Store } from '../core/types.ts';
import type { Catalog } from './catalog.ts';

/** Un article de la liste de courses, tel que gardé sur l'appareil. */
export interface ListItem {
  /** Clé stable du produit choisi (« aldi:9838 »). */
  key: string;
  qty: number;
  /**
   * Équivalent choisi par enseigne : clé produit, `null` = aucun équivalent,
   * absent = le meilleur équivalent proposé automatiquement.
   */
  picks?: Record<string, string | null>;
}

export interface Place extends GeoPoint {
  label: string;
}

export interface PlannedLine {
  item: ListItem;
  baseIndex: number;
  /** Produit retenu pour chaque enseigne (base comprise). */
  chosen: Map<string, number>;
  /** Équivalents proposés pour chaque autre enseigne. */
  options: Map<string, Array<{ index: number; score: number }>>;
}

export interface Comparison {
  mode: 'nearby' | 'chains';
  lines: PlannedLine[];
  /** Produits de la liste qui ne sont plus au catalogue. */
  unknown: ListItem[];
  result: BasketResult;
  /** Enseignes couvertes sans magasin dans le rayon. */
  noStoreInRadius: string[];
}

export function planLines(cat: Catalog, items: ListItem[]): { planned: PlannedLine[]; unknown: ListItem[]; lines: BasketLine[] } {
  const planned: PlannedLine[] = [];
  const unknown: ListItem[] = [];
  const lines: BasketLine[] = [];

  for (const item of items) {
    const baseIndex = cat.indexOf(item.key);
    if (baseIndex === undefined) {
      unknown.push(item);
      continue;
    }
    const baseChain = cat.chainOf(baseIndex).id;
    const options = cat.equivalentsByChain(baseIndex);
    const chosen = new Map<string, number>([[baseChain, baseIndex]]);
    for (const [chainId, list] of options) {
      const pick = item.picks?.[chainId];
      if (pick === null) continue;
      const picked = pick !== undefined ? cat.indexOf(pick) : undefined;
      const idx = picked ?? list[0]?.index;
      if (idx !== undefined) chosen.set(chainId, idx);
    }
    const base = cat.toOffer(baseIndex);
    planned.push({ item, baseIndex, chosen, options });
    lines.push({
      id: item.key,
      label: base.name,
      quantity: Math.max(1, Math.round(item.qty)),
      targetSize: base.size,
      offers: [...chosen.values()].map((i) => cat.toOffer(i)),
    });
  }
  return { planned, unknown, lines };
}

/** Garde le magasin le plus proche pour chaque enseigne et référence de prix. */
export function nearestPerPriceGroup(stores: StoreBasket[]): StoreBasket[] {
  const seen = new Set<string>();
  const sorted = [...stores].sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  const keep = new Set<StoreBasket>();
  for (const s of sorted) {
    const group = s.chain.priceScope === 'national' ? s.chain.id : `${s.chain.id}:${storePriceRef(s.store)}`;
    if (seen.has(group)) continue;
    seen.add(group);
    keep.add(s);
  }
  return stores.filter((s) => keep.has(s));
}

export function compare(cat: Catalog, items: ListItem[], place: Place | null, radiusKm: number, now: Date): Comparison {
  const { planned, unknown, lines } = planLines(cat, items);
  const covered = cat.chains.filter((c) => c.coverage === 'full');

  if (place && cat.stores.length > 0) {
    const stores: Store[] = cat.storesAsCore().filter((s) => covered.some((c) => c.id === s.chainId));
    const result = computeBasket(lines, stores, cat.chains, { now, origin: place, maxDistanceKm: radiusKm });
    result.stores = nearestPerPriceGroup(result.stores);
    const noStoreInRadius = covered
      .filter((c) => !stores.some((s) => s.chainId === c.id && distanceKm(place, s) <= radiusKm))
      .map((c) => c.name);
    return { mode: 'nearby', lines: planned, unknown, result, noStoreInRadius };
  }

  // Sans localisation : une ligne par enseigne (prix en ligne / national).
  const virtual: Store[] = covered.map((c) => ({ id: `enseigne-${c.id}`, chainId: c.id, name: c.name, lat: 0, lon: 0 }));
  const result = computeBasket(lines, virtual, cat.chains, { now });
  return { mode: 'chains', lines: planned, unknown, result, noStoreInRadius: [] };
}
