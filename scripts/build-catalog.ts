/**
 * Assemble les données de l'appli web : web/app/data/catalog.json.
 *
 *   npm run catalog
 *
 * Entrées : config/chains.json, data/latest/<enseigne>.json, data/stores.json,
 * data/postcodes.json (facultatifs). Sortie compacte : une seule requête
 * pour l'appli, aucune donnée personnelle.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { loadChains, ROOT } from '../src/config.ts';
import { classifyFreshness } from '../src/core/freshness.ts';
import { EquivalenceIndex, type IndexedProduct } from '../src/core/matching.ts';
import type { Offer, Store } from '../src/core/types.ts';
import { readPriceFile } from '../src/collect/store.ts';
import { buildCatalog, type CatalogFile } from './lib/catalog.ts';
import { qualityCheck } from './lib/quality.ts';

const readJson = <T>(path: string): T | undefined => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined);

function main(): void {
  const now = new Date();
  const chains = loadChains();
  const offers: Offer[] = [];
  for (const f of readdirSync(`${ROOT}data/latest`).filter((f) => f.endsWith('.json'))) {
    const file = readPriceFile(`${ROOT}data/latest/${f}`);
    if (!file) continue;
    const chain = chains.find((c) => c.id === file.chainId);
    if (!chain || chain.coverage === 'none') continue;
    for (const o of file.offers) {
      // Un prix trop vieux ne sert plus à rien, sauf si une promo est encore valable.
      const tooOld = classifyFreshness(o.observedAt, now) === 'expired';
      if (tooOld && !(o.promo && o.promo.validTo >= now.toISOString().slice(0, 10))) continue;
      offers.push(o);
    }
  }

  // Contrôle qualité : un prix douteux n'est jamais publié (rapport dans data/controle-qualite.json).
  const { kept, rejected } = qualityCheck(offers);
  writeFileSync(
    `${ROOT}data/controle-qualite.json`,
    `${JSON.stringify({ generatedAt: now.toISOString(), checked: offers.length, rejectedCount: rejected.length, rejected }, null, 1)}\n`,
  );
  const byReason = rejected.reduce<Record<string, number>>((m, r) => ((m[r.reason] = (m[r.reason] ?? 0) + 1), m), {});
  console.log(`contrôle qualité : ${rejected.length} produit(s) écarté(s) sur ${offers.length} ${JSON.stringify(byReason)}`);

  const storesFile = readJson<{ attribution: string; generatedAt: string; stores: Store[] }>(`${ROOT}data/stores.json`);
  const postcodes = readJson<{ attribution: string; postcodes: Array<[string, string, number, number]> }>(`${ROOT}data/postcodes.json`);

  const catalog: CatalogFile = buildCatalog({
    now,
    chains,
    offers: kept,
    stores: (storesFile?.stores ?? []).filter((s) => chains.some((c) => c.id === s.chainId && c.coverage !== 'none')),
    storesAttribution: storesFile?.attribution,
    postcodes: postcodes?.postcodes ?? [],
    postcodesAttribution: postcodes?.attribution,
    makeIndex: (products: IndexedProduct[]) => new EquivalenceIndex(products, new Set(['delhaize'])),
  });

  mkdirSync(`${ROOT}web/app/data`, { recursive: true });
  const out = JSON.stringify(catalog);
  writeFileSync(`${ROOT}web/app/data/catalog.json`, out);
  const withEq = catalog.products.filter((p) => p.e && p.e.length).length;
  console.log(
    `catalogue : ${catalog.products.length} produits (${withEq} avec équivalent), ${catalog.stores.length} magasins, ` +
      `${catalog.postcodes.length} codes postaux, ${(out.length / 1024).toFixed(0)} Ko`,
  );
}

main();
