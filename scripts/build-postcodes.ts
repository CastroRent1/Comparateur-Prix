/**
 * Construit data/postcodes.json (codes postaux belges → coordonnées) depuis
 * GeoNames (licence CC BY 4.0, attribution affichée dans l'appli).
 *
 *   npm run postcodes        (nécessite la commande `unzip`)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../src/config.ts';

const URL_BE = 'https://download.geonames.org/export/zip/BE.zip';

/** Ligne GeoNames (tabulations) → [code, localité, lat, lon]. */
export function parseGeonamesLine(line: string): [string, string, number, number] | undefined {
  const f = line.split('\t');
  if (f.length < 11 || f[0] !== 'BE') return undefined;
  const lat = Number(f[9]);
  const lon = Number(f[10]);
  if (!/^\d{4}$/.test(f[1]!) || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  return [f[1]!, f[2]!.trim(), Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4];
}

async function main(): Promise<void> {
  const res = await fetch(URL_BE, { headers: { 'User-Agent': 'PanierMalin/0.1 (+https://paniermalin.be/robot)' } });
  if (!res.ok) throw new Error(`GeoNames : HTTP ${res.status}`);
  const dir = mkdtempSync(join(tmpdir(), 'geonames-'));
  const zip = join(dir, 'BE.zip');
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const txt = execFileSync('unzip', ['-p', zip, 'BE.txt'], { maxBuffer: 50 * 1024 * 1024 }).toString('utf8');
  const rows = txt
    .split('\n')
    .map(parseGeonamesLine)
    .filter((r): r is [string, string, number, number] => r !== undefined)
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1], 'fr'));
  if (rows.length < 1000) throw new Error(`Seulement ${rows.length} codes postaux : fichier non écrasé.`);
  writeFileSync(
    `${ROOT}data/postcodes.json`,
    JSON.stringify({ source: 'GeoNames', attribution: 'Codes postaux : GeoNames (CC BY 4.0)', generatedAt: new Date().toISOString(), postcodes: rows }) + '\n',
  );
  console.log(`${rows.length} localités écrites dans data/postcodes.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
