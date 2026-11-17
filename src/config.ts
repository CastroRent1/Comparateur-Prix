import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Chain, Coverage, PriceScope } from './core/types.ts';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export interface CollectConfig {
  method: 'sitemap-jsonld';
  origin: string;
  /** Sitemaps explicites ; vide = ceux déclarés dans robots.txt. */
  sitemaps: string[];
  productUrlPattern: string;
  sitemapPattern?: string;
  aVerifier?: boolean;
}

export interface ChainConfig extends Chain {
  collect?: CollectConfig;
}

const COVERAGES: Coverage[] = ['full', 'promos', 'none'];
const SCOPES: PriceScope[] = ['national', 'store', 'format'];

/** Valide config/chains.json et lève une erreur lisible au moindre écart. */
export function parseChains(raw: unknown): ChainConfig[] {
  const list = (raw as { chains?: unknown })?.chains;
  if (!Array.isArray(list)) throw new Error('config/chains.json : clé "chains" manquante');
  const ids = new Set<string>();
  return list.map((c: Record<string, unknown>, i) => {
    const where = `config/chains.json, enseigne n°${i + 1}`;
    for (const k of ['id', 'name', 'domain', 'coverageNote'] as const) {
      if (typeof c[k] !== 'string' || !(c[k] as string).trim()) throw new Error(`${where} : "${k}" manquant`);
    }
    if (!COVERAGES.includes(c.coverage as Coverage)) throw new Error(`${where} : coverage invalide`);
    if (!SCOPES.includes(c.priceScope as PriceScope)) throw new Error(`${where} : priceScope invalide`);
    if (ids.has(c.id as string)) throw new Error(`${where} : id en double "${c.id}"`);
    ids.add(c.id as string);
    const collect = c.collect as CollectConfig | undefined;
    if (collect) {
      if (collect.method !== 'sitemap-jsonld') throw new Error(`${where} : collect.method inconnu`);
      if (!/^https:\/\/[^/]+$/.test(collect.origin)) throw new Error(`${where} : collect.origin doit être https://hôte sans slash final`);
      new RegExp(collect.productUrlPattern); // lève si invalide
      if (collect.sitemapPattern) new RegExp(collect.sitemapPattern);
    }
    return c as unknown as ChainConfig;
  });
}

export function loadChains(path = `${ROOT}config/chains.json`): ChainConfig[] {
  return parseChains(JSON.parse(readFileSync(path, 'utf8')));
}

export const BOT = {
  name: process.env.BOT_NAME ?? 'PanierMalinBot',
  contactUrl: process.env.BOT_CONTACT_URL ?? 'https://paniermalin.be/robot',
};
