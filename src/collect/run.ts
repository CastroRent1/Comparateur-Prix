/**
 * Lancement d'une collecte.
 *
 *   npm run collect -- aldi                    collecte (200 pages max par défaut)
 *   npm run collect -- aldi --max-pages 5000
 *   npm run collect -- delhaize --shard 0/2     une tranche sur deux (relevé alterné)
 *   npm run collect -- aldi --explore          affiche robots.txt + exemples d'URL des sitemaps,
 *                                              pour calibrer productUrlPattern
 *
 * Code de sortie : 0 = complet, 2 = arrêté pour blocage (données partielles
 * fusionnées), 1 = erreur.
 */
import { parseArgs } from 'node:util';
import { BOT, loadChains, ROOT } from '../config.ts';
import { PoliteFetcher } from './http.ts';
import { collectSitemapPages, discoverSitemaps, type RunStats, type Shard } from './collectors/sitemap-pages.ts';
import type { Offer } from '../core/types.ts';
import { parseSitemap } from './sitemap.ts';
import { mergeOffers, readPriceFile, writePriceFile } from './store.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'max-pages': { type: 'string', default: '200' },
    'delay-ms': { type: 'string', default: '2000' },
    explore: { type: 'boolean', default: false },
    shard: { type: 'string' },
  },
});

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function main(): Promise<number> {
  const chainId = positionals[0];
  const chains = loadChains();
  const chain = chains.find((c) => c.id === chainId);
  if (!chain) {
    console.error(`Usage : npm run collect -- <enseigne>. Enseignes avec collecte : ${chains.filter((c) => c.collect).map((c) => c.id).join(', ')}`);
    return 1;
  }
  if (!chain.collect) {
    console.error(`${chain.id} n'a pas encore de collecteur (bloc "collect" absent de config/chains.json).`);
    return 1;
  }

  const fetcher = new PoliteFetcher({
    botName: BOT.name,
    contactUrl: BOT.contactUrl,
    minDelayMs: Number(values['delay-ms']),
  });
  log(`user-agent : ${fetcher.userAgent}`);

  if (values.explore) {
    const rules = await fetcher.rulesFor(chain.collect.origin);
    log(`robots.txt : ${rules.disallow.length} Disallow, ${rules.allow.length} Allow, crawl-delay ${rules.crawlDelaySec ?? 'aucun'}`);
    for (const d of rules.disallow) log(`  Disallow: ${d}`);
    for (const root of await discoverSitemaps(fetcher, chain)) {
      const { status, text } = await fetcher.getText(root);
      const sm = parseSitemap(text);
      log(`${root} → HTTP ${status}, ${sm.kind}, ${sm.locs.length} entrées`);
      for (const loc of sm.locs.slice(0, 15)) log(`  ${loc}`);
    }
    return 0;
  }

  if (chain.collect.aVerifier) {
    log(`ATTENTION : la config de collecte de ${chain.id} n'a pas encore été vérifiée sur le site réel (aVerifier=true). Lancez d'abord --explore.`);
  }

  let shard: Shard | undefined;
  if (values.shard) {
    const m = /^(\d+)\/(\d+)$/.exec(values.shard);
    if (!m || Number(m[1]) >= Number(m[2])) {
      console.error('--shard attend la forme i/n avec i < n, ex. 0/2');
      return 1;
    }
    shard = { index: Number(m[1]), count: Number(m[2]) };
  }

  const path = `${ROOT}data/latest/${chain.id}.json`;
  const previous = readPriceFile(path)?.offers ?? [];
  const save = (fresh: Offer[], stats: RunStats) => {
    const now = new Date();
    const merged = mergeOffers(previous, fresh, now);
    writePriceFile(path, {
      chainId: chain.id,
      updatedAt: now.toISOString(),
      lastRun: { ...stats, at: now.toISOString() },
      offers: merged,
    });
    return merged;
  };

  const { offers, stats } = await collectSitemapPages(fetcher, chain, {
    maxPages: Number(values['max-pages']),
    shard,
    log,
    onCheckpoint: (partial, s) => save(partial, { ...s }),
  });
  const merged = save(offers, stats);

  log(`terminé : ${JSON.stringify(stats)} ; ${merged.length} offres dans ${path} ; ${fetcher.requestCount} requêtes HTTP`);
  if (stats.blocked) return 2;
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
