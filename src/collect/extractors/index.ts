import { normalizeEan } from '../../core/matching.ts';
import { parseQuantity } from '../../core/units.ts';
import type { Offer } from '../../core/types.ts';
import { extractProducts } from '../jsonld.ts';
import { extractAldi } from './aldi.ts';
import { extractDelhaize } from './delhaize.ts';

export type Extractor = (html: string, url: string, now: Date, chainId: string) => Offer[];

/** Extracteur générique schema.org (pour une enseigne qui publie un JSON-LD complet). */
export const extractJsonLd: Extractor = (html, url, now, chainId) =>
  extractProducts(html, url)
    .filter((p) => p.price !== undefined && (!p.currency || p.currency === 'EUR'))
    .map((p) => {
      const ean = normalizeEan(p.gtin);
      return {
        chainId,
        productKey: p.sku ?? ean ?? url,
        name: p.name,
        brand: p.brand,
        ean,
        size: parseQuantity(p.sizeText) ?? parseQuantity(p.name),
        sizeText: p.sizeText,
        price: p.price,
        observedAt: now.toISOString(),
        sourceUrl: url,
      };
    });

export const EXTRACTORS = {
  jsonld: extractJsonLd,
  aldi: (html, url, now) => extractAldi(html, url, now),
  delhaize: (html, url, now) => extractDelhaize(html, url, now),
} satisfies Record<string, Extractor>;

export type ExtractorName = keyof typeof EXTRACTORS;
