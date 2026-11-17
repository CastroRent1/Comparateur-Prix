import { classifyFreshness, DISCLAIMER, isPromoActive, type Freshness } from './freshness.ts';
import { distanceKm } from './geo.ts';
import type { Chain, GeoPoint, Offer, Store } from './types.ts';

/**
 * Calcul du « panier le moins cher près de chez moi », magasin par magasin.
 *
 * - Les enseignes « promos seulement » ne sont JAMAIS classées dans le panier
 *   complet : elles alimentent une section séparée `promosOnly`.
 * - Les prix d'une enseigne à prix local (Colruyt) ou par format (Carrefour)
 *   ne s'appliquent qu'aux magasins rattachés à la même référence de prix.
 * - Les montants sont calculés en centimes entiers pour éviter les erreurs
 *   d'arrondi des flottants.
 */

/** Une ligne de la liste de courses, avec les offres jugées équivalentes chez chaque enseigne. */
export interface BasketLine {
  id: string;
  label: string;
  quantity: number;
  offers: Offer[];
}

export interface BasketOptions {
  now: Date;
  origin?: GeoPoint;
  /** Ignorer les magasins plus loin que cette distance (km). */
  maxDistanceKm?: number;
  /** Compter les promos réservées aux cartes de fidélité (défaut : non). */
  includeCardPromos?: boolean;
}

export interface PricedLine {
  lineId: string;
  label: string;
  quantity: number;
  offer: Offer;
  unitPrice: number;
  lineTotal: number;
  isPromo: boolean;
  /** Fraîcheur du prix utilisé. Une promo en cours de validité est toujours « fresh ». */
  freshness: Freshness;
}

export interface StoreBasket {
  store: Store;
  chain: Chain;
  distanceKm?: number;
  total: number;
  priced: PricedLine[];
  missing: Array<{ lineId: string; label: string }>;
  staleCount: number;
  complete: boolean;
}

export interface PromoHit {
  store: Store;
  chain: Chain;
  distanceKm?: number;
  lineId: string;
  label: string;
  offer: Offer;
  promoPrice: number;
}

export interface BasketResult {
  stores: StoreBasket[];
  promosOnly: PromoHit[];
  generatedAt: string;
  disclaimer: string;
}

const toCents = (euros: number) => Math.round(euros * 100);

export function storePriceRef(store: Store): string {
  return store.priceRef ?? store.id;
}

/** L'offre s'applique-t-elle à ce magasin, vu la politique de prix de l'enseigne ? */
export function offerAppliesToStore(offer: Offer, chain: Chain, store: Store): boolean {
  if (offer.chainId !== chain.id || store.chainId !== chain.id) return false;
  if (chain.priceScope === 'national') return true;
  return offer.priceRef === storePriceRef(store);
}

interface Effective {
  cents: number;
  isPromo: boolean;
  freshness: Freshness;
}

/** Prix effectivement utilisable aujourd'hui pour une offre, ou `undefined`. */
export function effectivePrice(offer: Offer, opts: BasketOptions): Effective | undefined {
  const regularFreshness = classifyFreshness(offer.observedAt, opts.now);
  const regular =
    offer.price !== undefined && offer.price > 0 && regularFreshness !== 'expired'
      ? { cents: toCents(offer.price), isPromo: false, freshness: regularFreshness }
      : undefined;

  const promoUsable =
    offer.promo !== undefined &&
    offer.promo.price > 0 &&
    isPromoActive(offer.promo, opts.now) &&
    (!offer.promo.requiresCard || opts.includeCardPromos === true);
  const promo = promoUsable
    ? { cents: toCents(offer.promo!.price), isPromo: true, freshness: 'fresh' as const }
    : undefined;

  if (regular && promo) return promo.cents <= regular.cents ? promo : regular;
  return promo ?? regular;
}

export function computeBasket(
  lines: BasketLine[],
  stores: Store[],
  chains: Chain[],
  opts: BasketOptions,
): BasketResult {
  const chainById = new Map(chains.map((c) => [c.id, c]));
  const results: StoreBasket[] = [];
  const promosOnly: PromoHit[] = [];

  for (const store of stores) {
    const chain = chainById.get(store.chainId);
    if (!chain || chain.coverage === 'none') continue;

    const dist = opts.origin ? distanceKm(opts.origin, store) : undefined;
    if (dist !== undefined && opts.maxDistanceKm !== undefined && dist > opts.maxDistanceKm) continue;

    if (chain.coverage === 'promos') {
      for (const line of lines) {
        for (const offer of line.offers) {
          if (!offerAppliesToStore(offer, chain, store)) continue;
          const eff = effectivePrice(offer, opts);
          if (eff?.isPromo) {
            promosOnly.push({
              store,
              chain,
              distanceKm: dist,
              lineId: line.id,
              label: line.label,
              offer,
              promoPrice: eff.cents / 100,
            });
          }
        }
      }
      continue;
    }

    let totalCents = 0;
    let staleCount = 0;
    const priced: PricedLine[] = [];
    const missing: StoreBasket['missing'] = [];

    for (const line of lines) {
      let best: { offer: Offer; eff: Effective } | undefined;
      for (const offer of line.offers) {
        if (!offerAppliesToStore(offer, chain, store)) continue;
        const eff = effectivePrice(offer, opts);
        if (eff && (!best || eff.cents < best.eff.cents)) best = { offer, eff };
      }
      if (!best) {
        missing.push({ lineId: line.id, label: line.label });
        continue;
      }
      const lineCents = best.eff.cents * line.quantity;
      totalCents += lineCents;
      if (best.eff.freshness === 'stale') staleCount++;
      priced.push({
        lineId: line.id,
        label: line.label,
        quantity: line.quantity,
        offer: best.offer,
        unitPrice: best.eff.cents / 100,
        lineTotal: lineCents / 100,
        isPromo: best.eff.isPromo,
        freshness: best.eff.freshness,
      });
    }

    results.push({
      store,
      chain,
      distanceKm: dist,
      total: totalCents / 100,
      priced,
      missing,
      staleCount,
      complete: missing.length === 0 && lines.length > 0,
    });
  }

  results.sort(compareStoreBaskets);
  promosOnly.sort((a, b) => a.promoPrice - b.promoPrice || (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  return { stores: results, promosOnly, generatedAt: opts.now.toISOString(), disclaimer: DISCLAIMER };
}

/**
 * Paniers complets d'abord (par total puis distance), puis les incomplets
 * (moins de manquants d'abord). Comparer le total d'un panier incomplet à un
 * panier complet serait trompeur : l'interface doit afficher les manquants.
 */
function compareStoreBaskets(a: StoreBasket, b: StoreBasket): number {
  if (a.complete !== b.complete) return a.complete ? -1 : 1;
  if (!a.complete && a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
  if (a.total !== b.total) return a.total - b.total;
  return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
}
