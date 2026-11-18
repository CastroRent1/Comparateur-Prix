import { categorize } from '../../src/core/categories.ts';
import type { Offer } from '../../src/core/types.ts';

/**
 * Contrôle qualité avant publication : un prix douteux n'est JAMAIS montré.
 * Le produit est écarté du catalogue (recherche, rayons, comparaisons)
 * jusqu'au prochain relevé correct, et listé dans le rapport.
 *
 * 1. Format incohérent : le prix affiché ÷ notre format ne retombe pas sur
 *    le prix au kilo / litre affiché par l'enseigne (écart > 6 %).
 *    Ex. : pack 6 × 1 l à 8,09 € enregistré comme « 1 l » → 8,09 €/l calculé
 *    contre 1,35 €/l affiché.
 * 2. Prix aberrant : prix au kilo / litre plus de 4 fois AU-DESSUS de la
 *    médiane des produits du même type (« lait demi-écrémé »), toutes
 *    enseignes confondues, quand le type compte au moins 6 produits.
 *    Jamais vers le bas : un premier prix très bon marché (cola à 0,38 €/l)
 *    est exactement ce que l'utilisateur cherche ; l'erreur typique (un pack
 *    compté comme une seule unité) rend le prix au litre trop CHER.
 */

export const FORMAT_TOLERANCE = 0.06;
export const OUTLIER_FACTOR = 4;
export const OUTLIER_MIN_GROUP = 6;

export type RejectReason = 'format-incoherent' | 'prix-aberrant';

export interface Rejected {
  chainId: string;
  productKey: string;
  name: string;
  sourceUrl: string;
  reason: RejectReason;
  detail: string;
}

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Prix affiché le jour du relevé (le prix au kilo affiché correspond à celui-ci). */
function shownPrice(o: Offer): number | undefined {
  const day = o.observedAt.slice(0, 10);
  if (o.promo && o.promo.validFrom <= day && o.promo.validTo >= day) return o.promo.price;
  return o.price;
}

export function formatProblem(o: Offer): string | undefined {
  const shown = shownPrice(o);
  const u = o.shownUnitPrice;
  if (!u || !o.size || o.size.unit !== u.unit || !shown || o.size.amount <= 0 || u.value <= 0) return undefined;
  const computed = shown / o.size.amount;
  if (Math.abs(computed - u.value) / u.value <= FORMAT_TOLERANCE) return undefined;
  return `${eur(shown)} pour ${o.size.amount} ${u.unit} = ${eur(computed)}/${u.unit}, mais l'enseigne affiche ${eur(u.value)}/${u.unit}`;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function qualityCheck(offers: Offer[]): { kept: Offer[]; rejected: Rejected[] } {
  const rejected: Rejected[] = [];
  const reject = (o: Offer, reason: RejectReason, detail: string) =>
    rejected.push({ chainId: o.chainId, productKey: o.productKey, name: o.name, sourceUrl: o.sourceUrl, reason, detail });

  // 1. Cohérence du format
  const afterFormat: Offer[] = [];
  for (const o of offers) {
    const problem = formatProblem(o);
    if (problem) reject(o, 'format-incoherent', problem);
    else afterFormat.push(o);
  }

  // 2. Prix aberrants dans un même type de produit
  const groups = new Map<string, Array<{ o: Offer; unit: number }>>();
  for (const o of afterFormat) {
    const { category, type } = categorize(o);
    if (!category || !type || !o.size || o.size.amount <= 0 || !o.price) continue;
    const key = `${category}/${type}/${o.size.unit}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push({ o, unit: o.price / o.size.amount });
  }
  const outliers = new Set<Offer>();
  for (const [key, g] of groups) {
    if (g.length < OUTLIER_MIN_GROUP) continue;
    const med = median(g.map((x) => x.unit));
    for (const { o, unit } of g) {
      if (unit > med * OUTLIER_FACTOR) {
        outliers.add(o);
        reject(o, 'prix-aberrant', `${eur(unit)}/${o.size!.unit} contre une médiane de ${eur(med)}/${o.size!.unit} (${key})`);
      }
    }
  }
  return { kept: afterFormat.filter((o) => !outliers.has(o)), rejected };
}
