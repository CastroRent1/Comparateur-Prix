import { brusselsDate } from '../../core/freshness.ts';
import { parseQuantity } from '../../core/units.ts';
import type { Offer, Promo, Quantity } from '../../core/types.ts';

/**
 * Fiches produit aldi.be (Next.js). Les données sont dans
 * <script id="__NEXT_DATA__"> → … → "apiData" (chaîne JSON) →
 * ["PRODUCT_DETAIL_GET", { res: { products: [ … ] } }].
 *
 * Champs utilisés (faits seulement) : objectID, name, brandName, salesUnit,
 * mainCategoryID, currentPrice, promotionPrices. Ignorés : assets (photos),
 * shortDescription / longDescription (textes).
 *
 * Règles (observées sur le site le 17/11/2026) :
 * - validUntil ≠ 0 sans prix barré = article temporaire (souvent non
 *   alimentaire, « jusqu'à épuisement ») → exclu, non comparable ;
 * - validFrom dans le futur sans prix barré = pas encore en vente → exclu ;
 * - prix barré (strikePrice) = prix régulier ; priceValue = prix promo ;
 * - validUntil est un instant exclusif (minuit) : dernier jour inclus = la veille.
 */

interface AldiBasePrice {
  basePriceValue?: number;
  basePriceScale?: string;
}

interface AldiPrice {
  priceValue?: number;
  strikePrice?: { strikePriceValue?: number };
  basePrice?: AldiBasePrice[];
  priceTagLabels?: { promoText1?: string };
  validFrom?: number;
  validUntil?: number;
}

export interface AldiProduct {
  objectID: string;
  name: string;
  brandName?: string | null;
  salesUnit?: string;
  mainCategoryID?: string;
  currentPrice: AldiPrice;
  promotionPrices?: AldiPrice[];
}

function walk(node: unknown, out: AldiProduct[], depth = 0): void {
  if (depth > 40 || node === null || node === undefined) return;
  if (typeof node === 'string') {
    if (node.includes('PRODUCT_DETAIL_GET')) {
      try {
        walk(JSON.parse(node), out, depth + 1);
      } catch {
        // chaîne qui mentionne la clé sans être du JSON : ignorée
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.objectID === 'string' && typeof o.name === 'string' && o.currentPrice && typeof o.currentPrice === 'object') {
      out.push(o as unknown as AldiProduct);
      return;
    }
    for (const v of Object.values(o)) walk(v, out, depth + 1);
  }
}

export function findAldiProducts(html: string): AldiProduct[] {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return [];
  let data: unknown;
  try {
    data = JSON.parse(m[1]!);
  } catch {
    return [];
  }
  const out: AldiProduct[] = [];
  walk(data, out);
  // dédoublonnage (la même fiche peut apparaître deux fois)
  return [...new Map(out.map((p) => [p.objectID, p])).values()];
}

/** « par kg » → kg, « par l » → l. */
function scaleUnit(scale: string | undefined): 'kg' | 'l' | undefined {
  const s = (scale ?? '').toLowerCase();
  if (/\bkg\b/.test(s)) return 'kg';
  if (/\bl\b|litre/.test(s)) return 'l';
  return undefined;
}

/**
 * Le format se déduit de façon fiable du prix et du prix au kilo/litre
 * (« 2 x (6 x 33 cl) » est mal lu par un parseur de texte).
 */
export function sizeFromBasePrice(price: AldiPrice): Quantity | undefined {
  const bp = price.basePrice?.[0];
  const unit = scaleUnit(bp?.basePriceScale);
  if (!unit || !price.priceValue || !bp?.basePriceValue) return undefined;
  const amount = Math.round((price.priceValue / bp.basePriceValue) * 1000) / 1000;
  return amount > 0 ? { amount, unit } : undefined;
}

const dayOf = (epochSec: number) => brusselsDate(new Date(epochSec * 1000));
/** Dernier jour inclus pour une fin exclusive à minuit. */
const lastDayOf = (epochSec: number) => brusselsDate(new Date(epochSec * 1000 - 1000));

export function cleanBrand(brand: string | null | undefined): string | undefined {
  const b = (brand ?? '').replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim();
  return b || undefined;
}

export function aldiToOffer(p: AldiProduct, url: string, now: Date): Offer | undefined {
  const nowSec = now.getTime() / 1000;
  const cp = p.currentPrice;
  const strike = cp.strikePrice?.strikePriceValue;
  const hasStrike = typeof strike === 'number' && strike > 0;

  if (!cp.priceValue || cp.priceValue <= 0) return undefined;
  if (!hasStrike && cp.validUntil && cp.validUntil !== 0) return undefined; // article temporaire
  if (!hasStrike && cp.validFrom && cp.validFrom > nowSec) return undefined; // pas encore en vente

  const regular = hasStrike ? strike : cp.priceValue;

  // Promo : celle en cours, sinon la prochaine.
  let promo: Promo | undefined;
  const candidates = (p.promotionPrices?.length ? p.promotionPrices : hasStrike ? [cp] : [])
    .filter((pp) => pp.priceValue && pp.strikePrice?.strikePriceValue && pp.priceValue < pp.strikePrice.strikePriceValue)
    .filter((pp) => !pp.validUntil || pp.validUntil > nowSec)
    .sort((a, b) => (a.validFrom ?? 0) - (b.validFrom ?? 0));
  const chosen = candidates.find((pp) => (pp.validFrom ?? 0) <= nowSec) ?? candidates[0];
  if (chosen && chosen.validFrom && chosen.validUntil) {
    promo = {
      price: chosen.priceValue!,
      label: chosen.priceTagLabels?.promoText1,
      validFrom: dayOf(chosen.validFrom),
      validTo: lastDayOf(chosen.validUntil),
    };
  }

  const size = sizeFromBasePrice(cp) ?? parseQuantity(p.salesUnit) ?? parseQuantity(p.name);
  return {
    chainId: 'aldi',
    productKey: p.objectID,
    name: p.name.trim(),
    brand: cleanBrand(p.brandName),
    size,
    sizeText: p.salesUnit,
    price: regular,
    promo,
    observedAt: now.toISOString(),
    sourceUrl: url,
    category: p.mainCategoryID,
  };
}

export function extractAldi(html: string, url: string, now: Date): Offer[] {
  return findAldiProducts(html)
    .map((p) => aldiToOffer(p, url, now))
    .filter((o): o is Offer => o !== undefined);
}
