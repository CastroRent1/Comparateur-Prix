import type { BaseUnit, Quantity } from './types.ts';

/**
 * Lecture des formats affichés par les enseignes (« 500 g », « 6 x 33 cl »,
 * « 1,5 L », « 12 pièces ») et calcul du prix à l'unité de base.
 */

interface UnitDef {
  unit: BaseUnit;
  factor: number;
}

// Ordre important : les unités les plus longues d'abord pour l'alternance regex.
const UNITS: Array<[string, UnitDef]> = [
  ['kilogrammes', { unit: 'kg', factor: 1 }],
  ['kilogramme', { unit: 'kg', factor: 1 }],
  ['kilos', { unit: 'kg', factor: 1 }],
  ['kilo', { unit: 'kg', factor: 1 }],
  ['kg', { unit: 'kg', factor: 1 }],
  ['grammes', { unit: 'kg', factor: 0.001 }],
  ['gramme', { unit: 'kg', factor: 0.001 }],
  ['gram', { unit: 'kg', factor: 0.001 }],
  ['gr', { unit: 'kg', factor: 0.001 }],
  ['g', { unit: 'kg', factor: 0.001 }],
  ['litres', { unit: 'l', factor: 1 }],
  ['litre', { unit: 'l', factor: 1 }],
  ['liter', { unit: 'l', factor: 1 }],
  ['ltr', { unit: 'l', factor: 1 }],
  ['cl', { unit: 'l', factor: 0.01 }],
  ['dl', { unit: 'l', factor: 0.1 }],
  ['ml', { unit: 'l', factor: 0.001 }],
  ['l', { unit: 'l', factor: 1 }],
];

const UNIT_MAP = new Map(UNITS);
const UNIT_ALT = UNITS.map(([u]) => u).join('|');
const NUM = String.raw`\d+(?:\.\d+)?`;

const MULTIPACK_RE = new RegExp(String.raw`(\d+)\s*[x×*]\s*(${NUM})\s*(${UNIT_ALT})(?![a-z])`);
const SIMPLE_RE = new RegExp(String.raw`(${NUM})\s*(${UNIT_ALT})(?![a-z])`);
const PIECES_RE = /(\d+)\s*(?:pieces?|pcs?|pc|st(?:uks?)?|unites?|oeufs?|rouleaux|sachets?)(?![a-z])/;

/** Minuscules, sans accents, virgule décimale → point. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2');
}

/**
 * Extrait une quantité normalisée d'un texte libre. Renvoie `undefined` si
 * aucun format reconnaissable n'est trouvé (mieux vaut « inconnu » que faux).
 */
export function parseQuantity(text: string | undefined | null): Quantity | undefined {
  if (!text) return undefined;
  const t = normalize(text);

  const multi = MULTIPACK_RE.exec(t);
  if (multi) {
    const def = UNIT_MAP.get(multi[3]!)!;
    const amount = Number(multi[1]) * Number(multi[2]) * def.factor;
    return amount > 0 ? { amount: round(amount), unit: def.unit } : undefined;
  }

  const simple = SIMPLE_RE.exec(t);
  if (simple) {
    const def = UNIT_MAP.get(simple[2]!)!;
    const amount = Number(simple[1]) * def.factor;
    return amount > 0 ? { amount: round(amount), unit: def.unit } : undefined;
  }

  const pieces = PIECES_RE.exec(t);
  if (pieces) {
    const amount = Number(pieces[1]);
    return amount > 0 ? { amount, unit: 'piece' } : undefined;
  }

  return undefined;
}

/** Prix par kg, par litre ou par pièce, arrondi au centime. */
export function unitPrice(price: number, size: Quantity | undefined): number | undefined {
  if (!size || size.amount <= 0) return undefined;
  return Math.round((price / size.amount) * 100) / 100;
}

export function formatUnitPrice(value: number, unit: BaseUnit): string {
  const label = unit === 'piece' ? 'pièce' : unit;
  return `${formatEuro(value)}/${label}`;
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(value);
}

/** Deux formats sont-ils comparables (même unité, écart relatif ≤ tolérance) ? */
export function sizesCompatible(a: Quantity, b: Quantity, tolerance = 0.1): boolean {
  if (a.unit !== b.unit) return false;
  const max = Math.max(a.amount, b.amount);
  return max === 0 ? true : Math.abs(a.amount - b.amount) / max <= tolerance;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
