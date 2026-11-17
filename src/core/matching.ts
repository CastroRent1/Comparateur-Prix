import { parseQuantity, sizesCompatible } from './units.ts';
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
