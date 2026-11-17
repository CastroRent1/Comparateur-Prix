import { normalizeEan } from '../../core/matching.ts';
import { parseQuantity } from '../../core/units.ts';
import type { Offer } from '../../core/types.ts';
import type { ChainConfig } from '../../config.ts';
import { BlockedError, DisallowedError, type PoliteFetcher } from '../http.ts';
import { extractProducts } from '../jsonld.ts';
import { collectSitemapUrls } from '../sitemap.ts';

/**
 * Collecteur générique : sitemaps publics → pages produit → JSON-LD schema.org.
 * Convient aux enseignes à prix national qui publient leurs fiches produit
 * (Aldi en premier). Pour Colruyt/Delhaize/AH/Carrefour, des collecteurs
 * dédiés seront écrits en phase 1, après feu vert juridique.
 */

export interface RunStats {
  urlsFound: number;
  pagesFetched: number;
  productsFound: number;
  skippedNoPrice: number;
  skippedDisallowed: number;
  errors: number;
  blocked: boolean;
  complete: boolean;
}

export interface CollectOptions {
  maxPages: number;
  now?: () => Date;
  log?: (msg: string) => void;
}

export async function discoverSitemaps(fetcher: PoliteFetcher, chain: ChainConfig): Promise<string[]> {
  const c = chain.collect!;
  if (c.sitemaps.length) return c.sitemaps;
  const rules = await fetcher.rulesFor(c.origin);
  return rules.sitemaps.length ? rules.sitemaps : [`${c.origin}/sitemap.xml`];
}

export async function collectSitemapJsonLd(
  fetcher: PoliteFetcher,
  chain: ChainConfig,
  opts: CollectOptions,
): Promise<{ offers: Offer[]; stats: RunStats }> {
  const c = chain.collect;
  if (!c) throw new Error(`${chain.id} : pas de bloc "collect" dans config/chains.json`);
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());

  const stats: RunStats = {
    urlsFound: 0,
    pagesFetched: 0,
    productsFound: 0,
    skippedNoPrice: 0,
    skippedDisallowed: 0,
    errors: 0,
    blocked: false,
    complete: false,
  };
  const offers = new Map<string, Offer>();

  try {
    const roots = await discoverSitemaps(fetcher, chain);
    log(`sitemaps racines : ${roots.join(', ')}`);
    const urls = await collectSitemapUrls(fetcher, roots, {
      urlFilter: new RegExp(c.productUrlPattern),
      sitemapFilter: c.sitemapPattern ? new RegExp(c.sitemapPattern, 'i') : undefined,
      limit: opts.maxPages,
      log,
    });
    stats.urlsFound = urls.length;
    log(`${urls.length} URL produit retenues (limite ${opts.maxPages})`);

    for (const url of urls) {
      try {
        const res = await fetcher.getText(url);
        stats.pagesFetched++;
        if (res.status !== 200) {
          stats.errors++;
          continue;
        }
        const observedAt = now().toISOString();
        for (const p of extractProducts(res.text, url)) {
          if (p.price === undefined || (p.currency && p.currency !== 'EUR')) {
            stats.skippedNoPrice++;
            continue;
          }
          const ean = normalizeEan(p.gtin);
          const offer: Offer = {
            chainId: chain.id,
            productKey: p.sku ?? ean ?? url,
            name: p.name,
            brand: p.brand,
            ean,
            size: parseQuantity(p.sizeText) ?? parseQuantity(p.name),
            sizeText: p.sizeText,
            price: p.price,
            observedAt,
            sourceUrl: url,
          };
          offers.set(offer.productKey, offer);
          stats.productsFound++;
        }
      } catch (err) {
        if (err instanceof BlockedError) throw err;
        if (err instanceof DisallowedError) {
          stats.skippedDisallowed++;
          continue;
        }
        stats.errors++;
        log(`erreur sur ${url} : ${(err as Error).message}`);
      }
      if (stats.pagesFetched % 50 === 0 && stats.pagesFetched > 0) {
        log(`… ${stats.pagesFetched}/${urls.length} pages, ${stats.productsFound} produits`);
      }
    }
    stats.complete = true;
  } catch (err) {
    if (err instanceof BlockedError) {
      stats.blocked = true;
      log(err.message);
    } else if (err instanceof DisallowedError) {
      // Sitemap interdit par robots.txt (ou robots.txt injoignable → tout interdit par prudence).
      log(`${err.message} — collecte abandonnée, rien n'a été contourné.`);
    } else {
      throw err;
    }
  }

  return { offers: [...offers.values()], stats };
}
