import { createHash } from 'node:crypto';
import type { Offer } from '../../core/types.ts';
import type { ChainConfig } from '../../config.ts';
import { EXTRACTORS } from '../extractors/index.ts';
import { BlockedError, DisallowedError, type PoliteFetcher } from '../http.ts';
import { collectSitemapUrls } from '../sitemap.ts';

/**
 * Collecteur générique : sitemaps publics → pages produit → extracteur propre
 * à l'enseigne (config/chains.json, collect.extractor).
 *
 * - Ordre mélangé de façon déterministe : une collecte interrompue reste un
 *   échantillon représentatif de tous les rayons.
 * - Tranches (`shard`) : l'assortiment est découpé en N parts stables
 *   (hachage de l'URL) relevées à tour de rôle, pour rester sous la limite
 *   de durée d'un job tout en gardant une requête à la fois.
 */

export interface RunStats {
  urlsFound: number;
  pagesFetched: number;
  productsFound: number;
  pagesWithoutProduct: number;
  skippedDisallowed: number;
  errors: number;
  blocked: boolean;
  complete: boolean;
  shard?: string;
}

export interface Shard {
  index: number;
  count: number;
}

export interface CollectOptions {
  maxPages: number;
  shard?: Shard;
  now?: () => Date;
  log?: (msg: string) => void;
  /** Appelé tous les `checkpointEvery` produits avec les offres déjà relevées. */
  onCheckpoint?: (offers: Offer[], stats: RunStats) => void;
  checkpointEvery?: number;
}

const hash = (s: string) => createHash('sha1').update(s).digest();

export function inShard(url: string, shard: Shard | undefined): boolean {
  if (!shard || shard.count <= 1) return true;
  return hash(url).readUInt32BE(0) % shard.count === shard.index;
}

/** Mélange déterministe (même ordre d'un jour à l'autre pour une même liste). */
export function stableShuffle(urls: string[]): string[] {
  return [...urls]
    .map((u) => ({ u, k: hash(`ordre:${u}`).readUInt32BE(0) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.u);
}

export async function discoverSitemaps(fetcher: PoliteFetcher, chain: ChainConfig): Promise<string[]> {
  const c = chain.collect!;
  if (c.sitemaps.length) return c.sitemaps;
  const rules = await fetcher.rulesFor(c.origin);
  return rules.sitemaps.length ? rules.sitemaps : [`${c.origin}/sitemap.xml`];
}

export async function collectSitemapPages(
  fetcher: PoliteFetcher,
  chain: ChainConfig,
  opts: CollectOptions,
): Promise<{ offers: Offer[]; stats: RunStats }> {
  const c = chain.collect;
  if (!c) throw new Error(`${chain.id} : pas de bloc "collect" dans config/chains.json`);
  const extract = EXTRACTORS[c.extractor];
  const log = opts.log ?? (() => {});
  const now = opts.now ?? (() => new Date());

  const stats: RunStats = {
    urlsFound: 0,
    pagesFetched: 0,
    productsFound: 0,
    pagesWithoutProduct: 0,
    skippedDisallowed: 0,
    errors: 0,
    blocked: false,
    complete: false,
    shard: opts.shard ? `${opts.shard.index}/${opts.shard.count}` : undefined,
  };
  const offers = new Map<string, Offer>();

  try {
    const roots = await discoverSitemaps(fetcher, chain);
    log(`sitemaps racines : ${roots.join(', ')}`);
    const all = await collectSitemapUrls(fetcher, roots, {
      urlFilter: new RegExp(c.productUrlPattern),
      sitemapFilter: c.sitemapPattern ? new RegExp(c.sitemapPattern, 'i') : undefined,
      limit: 200_000,
      log,
    });
    const urls = stableShuffle(all.filter((u) => inShard(u, opts.shard))).slice(0, opts.maxPages);
    stats.urlsFound = all.length;
    log(`${all.length} URL produit dans les sitemaps ; ${urls.length} à relever (tranche ${stats.shard ?? 'unique'}, limite ${opts.maxPages})`);

    for (const url of urls) {
      try {
        const res = await fetcher.getText(url);
        stats.pagesFetched++;
        if (res.status !== 200) {
          stats.errors++;
        } else {
          const found = extract(res.text, url, now(), chain.id);
          if (found.length === 0) stats.pagesWithoutProduct++;
          for (const o of found) {
            offers.set(o.productKey, o);
            stats.productsFound++;
            if (opts.onCheckpoint && stats.productsFound % (opts.checkpointEvery ?? 100) === 0) {
              opts.onCheckpoint([...offers.values()], stats);
            }
          }
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
      if (stats.pagesFetched > 0 && stats.pagesFetched % 100 === 0) {
        log(`… ${stats.pagesFetched}/${urls.length} pages, ${stats.productsFound} produits, ${stats.errors} erreurs`);
      }
    }
    stats.complete = true;
  } catch (err) {
    if (err instanceof BlockedError) {
      stats.blocked = true;
      log(err.message);
    } else if (err instanceof DisallowedError) {
      log(`${err.message} — collecte abandonnée, rien n'a été contourné.`);
    } else {
      throw err;
    }
  }

  return { offers: [...offers.values()], stats };
}
