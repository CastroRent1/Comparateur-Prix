/**
 * Extraction des données produit schema.org (JSON-LD) d'une page publique.
 *
 * On ne garde volontairement QUE des faits : nom, marque, code-barres, SKU,
 * prix, devise, format. Les champs `image` et `description` sont ignorés
 * (droit d'auteur : leçon de Trolley).
 */

export interface RawProduct {
  name: string;
  brand?: string;
  gtin?: string;
  sku?: string;
  price?: number;
  currency?: string;
  priceValidUntil?: string;
  sizeText?: string;
  url: string;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type JsonObject = { [k: string]: Json };

const isObj = (v: Json | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

function asString(v: Json | undefined): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  if (isObj(v) && typeof v.name === 'string') return v.name.trim() || undefined;
  if (Array.isArray(v) && v.length) return asString(v[0]);
  return undefined;
}

/** « 1,99 », « 1.99 », 1.99, « €1.99 » → 1.99 */
export function parsePrice(v: Json | undefined): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const cleaned = v.replace(/[^\d.,]/g, '');
  if (!cleaned) return undefined;
  // « 1.234,56 » → 1234.56 ; « 1,99 » → 1.99 ; « 1.99 » → 1.99
  const normalized =
    cleaned.includes(',') && cleaned.includes('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function hasType(o: JsonObject, type: string): boolean {
  const t = o['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function flatten(node: Json, out: JsonObject[]): void {
  if (Array.isArray(node)) {
    for (const n of node) flatten(n, out);
  } else if (isObj(node)) {
    out.push(node);
    if (node['@graph']) flatten(node['@graph'], out);
  }
}

function firstOffer(offers: Json | undefined): JsonObject | undefined {
  if (Array.isArray(offers)) return offers.find(isObj);
  return isObj(offers) ? offers : undefined;
}

function sizeFromWeight(w: Json | undefined): string | undefined {
  if (!isObj(w)) return asString(w);
  const value = asString(w.value);
  const unit = asString(w.unitText) ?? asString(w.unitCode);
  if (!value) return undefined;
  const unitMap: Record<string, string> = { GRM: 'g', KGM: 'kg', LTR: 'l', MLT: 'ml', CLT: 'cl' };
  return `${value} ${unit ? (unitMap[unit] ?? unit) : ''}`.trim();
}

export function extractJsonLdBlocks(html: string): Json[] {
  const blocks: Json[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      blocks.push(JSON.parse(m[1]!.trim()) as Json);
    } catch {
      // JSON-LD mal formé : ignoré (fréquent, sans gravité).
    }
  }
  return blocks;
}

export function extractProducts(html: string, pageUrl: string): RawProduct[] {
  const nodes: JsonObject[] = [];
  for (const b of extractJsonLdBlocks(html)) flatten(b, nodes);

  const products: RawProduct[] = [];
  for (const node of nodes) {
    if (!hasType(node, 'Product')) continue;
    const name = asString(node.name);
    if (!name) continue;

    const offer = firstOffer(node.offers);
    const price = offer ? (parsePrice(offer.price) ?? parsePrice(offer.lowPrice)) : undefined;
    const spec = offer && isObj(offer.priceSpecification) ? offer.priceSpecification : undefined;

    products.push({
      name,
      brand: asString(node.brand),
      gtin:
        asString(node.gtin13) ?? asString(node.gtin) ?? asString(node.gtin14) ?? asString(node.gtin12) ?? asString(node.gtin8),
      sku: asString(node.sku) ?? asString(node.productID),
      price: price ?? (spec ? parsePrice(spec.price) : undefined),
      currency: offer ? (asString(offer.priceCurrency) ?? (spec ? asString(spec.priceCurrency) : undefined)) : undefined,
      priceValidUntil: offer ? asString(offer.priceValidUntil) : undefined,
      sizeText: sizeFromWeight(node.weight) ?? asString(node.size),
      url: (offer && asString(offer.url)) ?? asString(node.url) ?? pageUrl,
    });
  }
  return products;
}
