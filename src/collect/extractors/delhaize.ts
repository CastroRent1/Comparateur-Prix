import { brusselsDate } from '../../core/freshness.ts';
import { packCount, parseQuantity } from '../../core/units.ts';
import type { Offer, Promo, Quantity } from '../../core/types.ts';
import { extractProducts } from '../jsonld.ts';

/**
 * Fiches produit delhaize.be.
 *
 * - Nom, marque, rayon : JSON-LD schema.org Product.
 * - PRIX : lus dans le bloc prix affiché (attributs aria-label), qui fait foi.
 *   Le prix du JSON-LD peut différer du prix affiché (constaté le 17/11/2026 :
 *   1,16 € en JSON-LD contre 1,18 € affiché) : il ne sert qu'en dernier recours.
 *     data-testid="product-block-price"          « Prix: 2 euros et 29 centimes »
 *                                                « Nouveau prix: 0 euro et 59 centimes » (promo)
 *     data-testid="product-block-old-price"      « Ancien prix: 1 euro et 18 centimes »
 *     data-testid="product-block-price-per-unit» « Prix par unité: 13 euros et 09 centimes par kg »
 * - Format : « Contenu net » publié (par unité : un lot de N est détecté via
 *   prix ÷ prix unitaire) ; à défaut prix ÷ prix unitaire affiché.
 * - Promo : Delhaize n'affiche pas sa date de fin → validité limitée au jour du
 *   relevé (prudent : on ne montre jamais une promo peut-être terminée).
 *   « Commandable à partir du … » → promo ignorée (statut incertain).
 */

function attrOf(html: string, testId: string): string | undefined {
  const tag = new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0];
  return tag ? /aria-label="([^"]*)"/.exec(tag)?.[1] : undefined;
}

/** « 2 euros et 29 centimes » → 2.29 ; « 3 euros » → 3 ; « 0 euro et 59 centimes » → 0.59. */
export function parseSpokenEuros(label: string | undefined): number | undefined {
  if (!label) return undefined;
  const m = /(\d+)\s*euros?(?:\s*et\s*(\d{1,2})\s*centimes?)?/i.exec(label);
  if (!m) return undefined;
  const value = Number(m[1]) + Number(m[2] ?? 0) / 100;
  return value > 0 ? Math.round(value * 100) / 100 : undefined;
}

export function parseSpokenUnit(label: string | undefined): 'kg' | 'l' | 'piece' | undefined {
  if (!label) return undefined;
  const m = /par\s+(kg|kilo|l|litre|pi[eè]ce|pc|st)\b/i.exec(label);
  if (!m) return undefined;
  const u = m[1]!.toLowerCase();
  return u === 'kg' || u === 'kilo' ? 'kg' : u === 'l' || u === 'litre' ? 'l' : 'piece';
}

const NET_CONTENT_RE = /Contenu net[\s\S]{0,400}?>\s*([\d.,]+\s*(?:x\s*[\d.,]+\s*)?(?:kg|g|gr|l|cl|ml)\b)/i;

/** « Jeunes pousses | Roquette | Maxi P » → « Jeunes pousses Roquette Maxi P ». */
export function cleanDelhaizeName(name: string): string {
  return name.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function productCodeFromUrl(url: string): string | undefined {
  return /\/p\/([A-Z0-9]+)(?:[?#]|$)/.exec(url)?.[1];
}

export function extractDelhaize(html: string, url: string, now: Date): Offer[] {
  const ld = extractProducts(html, url)[0];
  if (!ld) return [];

  const shownLabel = attrOf(html, 'product-block-price');
  const shown = parseSpokenEuros(shownLabel);
  const old = parseSpokenEuros(attrOf(html, 'product-block-old-price'));
  const unitLabel = attrOf(html, 'product-block-price-per-unit');
  const unitValue = parseSpokenEuros(unitLabel);
  const unit = parseSpokenUnit(unitLabel);

  const notYetOrderable = /Commandable à partir du/i.test(html);
  const isPromo = shown !== undefined && old !== undefined && shown < old;

  const regular = isPromo ? old : (shown ?? ld.price);
  if (regular === undefined) return [];

  let promo: Promo | undefined;
  if (isPromo && !notYetOrderable) {
    const today = brusselsDate(now);
    promo = { price: shown!, label: 'Promo', validFrom: today, validTo: today };
  }

  // Format : le « Contenu net » publié fait foi. À défaut, prix ÷ prix
  // unitaire affiché (même paire, promo comprise) ; à défaut, le nom.
  // (Constaté : un prix unitaire de multi-achat peut fausser le calcul.)
  // Attention : pour un lot, le contenu net est celui d'UNE unité (« 1 l »
  // pour 6 × 1 l à 8,09 €) : si prix ÷ prix unitaire donne un multiple exact
  // du contenu net, c'est un lot de N unités.
  let sizeText = NET_CONTENT_RE.exec(html)?.[1]?.trim();
  const net = parseQuantity(sizeText);
  let computed: Quantity | undefined;
  if (shown && unitValue && unit && unit !== 'piece') {
    const amount = Math.round((shown / unitValue) * 1000) / 1000;
    if (amount > 0) computed = { amount, unit };
  }
  let size: Quantity | undefined = net ?? computed;
  const n = net && computed ? packCount(computed, net) : undefined;
  if (n && net) {
    size = { amount: Math.round(net.amount * n * 1000) / 1000, unit: net.unit };
    sizeText = `${n} x ${sizeText}`;
  }
  size ??= parseQuantity(ld.name);

  const categoryMatch = /"category"\s*:\s*"([^"]+)"/.exec(html);
  return [
    {
      chainId: 'delhaize',
      productKey: productCodeFromUrl(url) ?? ld.sku ?? url,
      name: cleanDelhaizeName(ld.name),
      brand: ld.brand,
      size,
      sizeText,
      price: regular,
      promo,
      shownUnitPrice: unitValue && unit && unit !== 'piece' ? { value: unitValue, unit } : undefined,
      observedAt: now.toISOString(),
      sourceUrl: url.split('?')[0]!,
      category: categoryMatch?.[1],
    },
  ];
}
