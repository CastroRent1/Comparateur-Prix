/**
 * Construit data/stores.json depuis OpenStreetMap (API Overpass).
 *
 *   npm run stores
 *
 * Données © contributeurs OpenStreetMap, licence ODbL : l'attribution est
 * affichée dans l'appli. Une seule requête, mensuelle.
 */
import { writeFileSync } from 'node:fs';
import { ROOT } from '../src/config.ts';
import { OVERPASS_QUERY, osmToStore, type OsmElement } from './lib/stores.ts';

const ENDPOINT = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

async function main(): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PanierMalin/0.1 (comparateur de prix; +https://paniermalin.be/robot)',
    },
    body: new URLSearchParams({ data: OVERPASS_QUERY }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`Overpass : HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  const { elements } = (await res.json()) as { elements: OsmElement[] };

  const stores = elements
    .map(osmToStore)
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .sort((a, b) => a.chainId.localeCompare(b.chainId) || a.id.localeCompare(b.id));

  const counts = stores.reduce<Record<string, number>>((acc, s) => ((acc[s.chainId] = (acc[s.chainId] ?? 0) + 1), acc), {});
  if (stores.length < 100) throw new Error(`Seulement ${stores.length} magasins trouvés : réponse Overpass suspecte, fichier non écrasé.`);

  writeFileSync(
    `${ROOT}data/stores.json`,
    JSON.stringify(
      {
        source: 'OpenStreetMap',
        attribution: '© contributeurs OpenStreetMap (ODbL)',
        generatedAt: new Date().toISOString(),
        counts,
        stores,
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`${stores.length} magasins écrits dans data/stores.json :`, counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
