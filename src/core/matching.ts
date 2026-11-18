import { packCount, parseQuantity, sizesCompatible } from './units.ts';
import type { Quantity } from './types.ts';

/**
 * Reconnaissance du même produit d'une enseigne à l'autre.
 *
 * 1. Code-barres EAN identique → certain.
 * 2. Sinon : similarité du nom (et de la marque) + format compatible.
 *    Les correspondances moyennes sont marquées `needsReview` : c'est là
 *    qu'interviendra plus tard une IA (ou une validation manuelle), jamais
 *    pour naviguer sur les sites.
 */

export interface ProductLike {
  name: string;
  brand?: string;
  ean?: string;
  size?: Quantity;
  sizeText?: string;
}

export type MatchReason = 'ean' | 'ean-different' | 'size-mismatch' | 'name';

export interface MatchResult {
  score: number;
  reason: MatchReason;
}

const STOPWORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'au', 'aux', 'en', 'a', 'avec', 'sans', 'pour',
  'un', 'une', 'van', 'het', 'een', 'met', 'en', 'the', 'of',
]);

// Tokens de quantité (500g, 1.5l, 6x33cl, 12pcs…) : ignorés dans le nom.
const QUANTITY_TOKEN = /^\d+(?:[.,]\d+)?(?:x\d+(?:[.,]\d+)?)?(?:kg|g|gr|l|cl|ml|dl|pcs?|st)?$/;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[''`]/g, ' ')
    .replace(/[^a-z0-9.,x ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Expressions de quantité complètes, espaces compris (« 250 g », « 6 x 33 cl », « 12 pieces »).
const QUANTITY_PHRASE =
  /\b\d+(?:[.,]\d+)?(?:\s*x\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|gr|l|cl|ml|dl|pcs?|pieces?|st|stuks?)(?![a-z])/g;

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .replace(QUANTITY_PHRASE, ' ')
    .split(' ')
    .map((t) => t.replace(/^[.,]+|[.,]+$/g, ''))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !QUANTITY_TOKEN.test(t) && t !== 'x');
}

/** Coefficient de Dice sur ensembles de tokens (0 à 1). */
export function dice(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

/** Supprime les zéros de tête : un GTIN-14 « 05400… » et un EAN-13 « 5400… » sont le même code. */
export function normalizeEan(ean: string | undefined): string | undefined {
  if (!ean) return undefined;
  const digits = ean.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= 6 ? digits : undefined;
}

function sizeOf(p: ProductLike): Quantity | undefined {
  return p.size ?? parseQuantity(p.sizeText) ?? parseQuantity(p.name);
}

export function matchScore(a: ProductLike, b: ProductLike): MatchResult {
  const ea = normalizeEan(a.ean);
  const eb = normalizeEan(b.ean);
  if (ea && eb) return ea === eb ? { score: 1, reason: 'ean' } : { score: 0, reason: 'ean-different' };

  const qa = sizeOf(a);
  const qb = sizeOf(b);
  if (qa && qb && !sizesCompatible(qa, qb)) return { score: 0, reason: 'size-mismatch' };

  const brandTokens = (p: ProductLike) => (p.brand ? tokenize(p.brand) : []);
  // La marque est souvent répétée dans le nom : on l'en retire pour ne pas la compter deux fois.
  const nameTokens = (p: ProductLike) => {
    const brand = new Set(brandTokens(p));
    return tokenize(p.name).filter((t) => !brand.has(t));
  };

  let score = dice(nameTokens(a), nameTokens(b));
  if (a.brand && b.brand) {
    const brandScore = dice(brandTokens(a), brandTokens(b));
    score = 0.7 * score + 0.3 * brandScore;
  }
  if (!qa || !qb) score *= 0.9; // format inconnu : moins confiant
  return { score: Math.round(score * 1000) / 1000, reason: 'name' };
}

export interface Candidate<T extends ProductLike> extends MatchResult {
  product: T;
  needsReview: boolean;
}

export interface MatchOptions {
  /** Score minimal pour proposer une correspondance. */
  threshold?: number;
  /** En dessous de ce score, la correspondance doit être vérifiée. */
  reviewBelow?: number;
}

export function findMatches<T extends ProductLike>(
  target: ProductLike,
  candidates: T[],
  { threshold = 0.55, reviewBelow = 0.8 }: MatchOptions = {},
): Candidate<T>[] {
  return candidates
    .map((product) => {
      const r = matchScore(target, product);
      return { ...r, product, needsReview: r.reason !== 'ean' && r.score < reviewBelow };
    })
    .filter((c) => c.score >= threshold)
    .sort((x, y) => y.score - x.score);
}

// ---------------------------------------------------------------------------
// Équivalences entre enseignes (marques de distributeur comprises)
// ---------------------------------------------------------------------------

/**
 * Lot de N unités identiques (2 à 12) : 6 × 1 l face à 1 l. Le panier ramène
 * alors le prix au format visé (prix au litre ou au kilo), donc la
 * comparaison reste juste.
 */
export function isMultipack(a: Quantity, b: Quantity): boolean {
  const [big, small] = a.amount >= b.amount ? [a, b] : [b, a];
  const n = packCount(big, small);
  return n !== undefined && n <= 12;
}

/**
 * Mots de variante : un produit qui en porte un que l'autre n'a pas n'est
 * pas le même produit (lait entier ≠ lait chocolaté, café moulu ≠ café en
 * grains, yaourt ≠ yaourt à la fraise, bio ≠ non bio).
 */
const VARIANT_ROOTS = [
  'chocol', 'cacao', 'lactose', 'light', 'allege', 'ecreme', 'demi', 'entier', 'decaf', 'grain', 'moulu',
  'capsule', 'dosette', 'pad', 'soluble', 'instant', 'vanill', 'fraise', 'framboise', 'myrtille', 'citron',
  'peche', 'abricot', 'cerise', 'mangue', 'coco', 'caramel', 'noisette', 'zero', 'vegan', 'vegeta', 'surgel',
  'epice', 'piquant', 'fume', 'complet', 'gluten',
];
const VARIANT_EXACT = new Set(['bio', 'sucre', 'sel', 'sale']);

export function isVariantToken(t: string): boolean {
  return VARIANT_EXACT.has(t) || VARIANT_ROOTS.some((r) => t.startsWith(r));
}

/** Facteur appliqué au score : ×0,7 par mot de variante présent d'un seul côté. */
export function variantPenalty(a: readonly string[], b: readonly string[]): number {
  const va = new Set(a.filter(isVariantToken));
  const vb = new Set(b.filter(isVariantToken));
  let n = 0;
  for (const t of va) if (!vb.has(t)) n++;
  for (const t of vb) if (!va.has(t)) n++;
  return 0.7 ** n;
}

export interface IndexedProduct extends ProductLike {
  id: number;
  chainId: string;
  /** Rayon commun (src/core/categories.ts), s'il est connu. */
  category?: string;
}

/** Facteur quand deux produits sont classés dans des rayons différents. */
export const OTHER_CATEGORY_FACTOR = 0.6;

/** Rayons voisins que les enseignes répartissent différemment (lardons, salami, soupes…). */
const RELATED_CATEGORIES = new Set(['charcuterie|viande', 'aperitif|charcuterie', 'conserves|epicerie', 'plats|surgeles']);

export function relatedCategories(a: string, b: string): boolean {
  return a === b || RELATED_CATEGORIES.has([a, b].sort().join('|'));
}

export interface Equivalent {
  id: number;
  score: number;
}

export interface EquivalenceOptions {
  /** Score minimal (0-1) pour proposer un équivalent. */
  threshold?: number;
  /** Écart de format toléré (0,3 = ±30 %) ; au-delà, pas d'équivalence. */
  sizeTolerance?: number;
  /** Nombre d'équivalents gardés par enseigne (5 par défaut). */
  perChain?: number;
}

/**
 * Index d'équivalence : similarité de Dice pondérée par l'IDF des mots
 * (un mot rare comme « myrtilles » compte plus qu'un mot courant comme
 * « bio »). Les marques sont ignorées dans le nom (une marque de
 * distributeur ne doit pas empêcher l'équivalence), mais deux produits de
 * même marque nationale reçoivent un bonus.
 */
export class EquivalenceIndex {
  private readonly tokens = new Map<number, string[]>();
  private readonly brands = new Map<number, string>();
  private readonly sizes = new Map<number, Quantity | undefined>();
  private readonly byToken = new Map<string, number[]>();
  private readonly idf = new Map<string, number>();
  private readonly products = new Map<number, IndexedProduct>();

  constructor(products: IndexedProduct[], private readonly privateLabels: Set<string> = new Set()) {
    for (const p of products) {
      this.products.set(p.id, p);
      const brandToks = new Set(p.brand ? tokenize(p.brand) : []);
      const toks = [...new Set(tokenize(p.name).filter((t) => !brandToks.has(t) && t.length > 1))];
      this.tokens.set(p.id, toks);
      this.brands.set(p.id, normalizeText(p.brand ?? ''));
      this.sizes.set(p.id, sizeOf(p));
      for (const t of toks) {
        let list = this.byToken.get(t);
        if (!list) this.byToken.set(t, (list = []));
        list.push(p.id);
      }
    }
    const n = products.length || 1;
    for (const [t, list] of this.byToken) this.idf.set(t, Math.log(1 + n / list.length));
  }

  private weight(toks: string[]): number {
    let w = 0;
    for (const t of toks) w += this.idf.get(t) ?? 0;
    return w;
  }

  score(a: number, b: number, sizeTolerance = 0.3): number {
    const ta = this.tokens.get(a) ?? [];
    const tb = new Set(this.tokens.get(b) ?? []);
    const qa = this.sizes.get(a);
    const qb = this.sizes.get(b);
    if (qa && qb && !sizesCompatible(qa, qb, sizeTolerance) && !isMultipack(qa, qb)) return 0;
    let common = 0;
    for (const t of ta) if (tb.has(t)) common += this.idf.get(t) ?? 0;
    const denom = this.weight(ta) + this.weight([...tb]);
    if (denom === 0) return 0;
    let s = ((2 * common) / denom) * variantPenalty(ta, [...tb]);
    const ba = this.brands.get(a);
    const bb = this.brands.get(b);
    if (ba && ba === bb && !this.privateLabels.has(ba)) s = Math.min(1, s + 0.15);
    if (!qa || !qb) s *= 0.85;
    const ca = this.products.get(a)?.category;
    const cb = this.products.get(b)?.category;
    if (ca && cb && !relatedCategories(ca, cb)) s *= OTHER_CATEGORY_FACTOR; // « lait » ≠ « chocolat au lait »
    return Math.round(s * 1000) / 1000;
  }

  /** Meilleurs équivalents de `id` dans chaque autre enseigne. */
  equivalents(id: number, opts: EquivalenceOptions = {}): Map<string, Equivalent[]> {
    const { threshold = 0.55, sizeTolerance = 0.3, perChain = 5 } = opts;
    const self = this.products.get(id);
    const result = new Map<string, Equivalent[]>();
    if (!self) return result;
    // Candidats : produits partageant au moins un mot du nom, en partant des plus rares.
    const toks = [...(this.tokens.get(id) ?? [])].sort((x, y) => (this.idf.get(y) ?? 0) - (this.idf.get(x) ?? 0));
    const candidates = new Set<number>();
    for (const t of toks.slice(0, 4)) for (const c of this.byToken.get(t) ?? []) candidates.add(c);
    for (const c of candidates) {
      const other = this.products.get(c)!;
      if (other.chainId === self.chainId) continue;
      const s = this.score(id, c, sizeTolerance);
      if (s < threshold) continue;
      let list = result.get(other.chainId);
      if (!list) result.set(other.chainId, (list = []));
      list.push({ id: c, score: s });
    }
    for (const [k, list] of result) result.set(k, list.sort((x, y) => y.score - x.score).slice(0, perChain));
    return result;
  }
}
