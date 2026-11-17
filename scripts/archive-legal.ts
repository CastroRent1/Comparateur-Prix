/**
 * Archive datée des robots.txt et conditions d'utilisation des enseignes
 * (étape 0 du plan : preuve de ce qui était publié au moment de la collecte).
 *
 *   npm run archive-legal
 *
 * Écrit legal/archives/AAAA-MM-JJ/<enseigne>/<fichier> + MANIFEST.json
 * (statut HTTP, type, taille, empreinte SHA-256, URL finale, heure).
 * Une seule requête par page, user-agent identifié, aucune nouvelle tentative
 * en cas de refus : un échec est consigné tel quel dans le manifeste.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BOT, ROOT } from '../src/config.ts';
import { brusselsDate } from '../src/core/freshness.ts';

interface Target {
  chainId: string;
  url: string;
  kind: 'robots' | 'conditions' | 'autre';
}

interface ManifestEntry extends Target {
  fetchedAt: string;
  status: number | null;
  finalUrl?: string;
  contentType?: string;
  bytes?: number;
  sha256?: string;
  file?: string;
  error?: string;
}

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/html': 'html',
  'text/plain': 'txt',
};

function fileNameFor(t: Target, contentType: string): string {
  const base = new URL(t.url).pathname.split('/').filter(Boolean).pop() ?? 'index';
  const mime = contentType.split(';')[0]!.trim();
  const ext = EXT[mime] ?? 'bin';
  const stem = base.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'index';
  return `${t.kind}-${stem}.${ext}`;
}

async function main(): Promise<void> {
  const { targets } = JSON.parse(readFileSync(`${ROOT}config/legal-urls.json`, 'utf8')) as { targets: Target[] };
  const day = brusselsDate(new Date());
  const dir = `${ROOT}legal/archives/${day}`;
  const manifest: ManifestEntry[] = [];
  const ua = `Mozilla/5.0 (compatible; ${BOT.name}/0.1; +${BOT.contactUrl})`;

  for (const t of targets) {
    const entry: ManifestEntry = { ...t, fetchedAt: new Date().toISOString(), status: null };
    try {
      const res = await fetch(t.url, {
        headers: { 'User-Agent': ua, 'Accept-Language': 'fr-BE,fr;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
      const body = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
      entry.status = res.status;
      entry.finalUrl = res.url;
      entry.contentType = contentType;
      entry.bytes = body.length;
      entry.sha256 = createHash('sha256').update(body).digest('hex');
      if (res.ok) {
        const file = `${t.chainId}/${fileNameFor(t, contentType)}`;
        mkdirSync(`${dir}/${t.chainId}`, { recursive: true });
        writeFileSync(`${dir}/${file}`, body);
        entry.file = file;
      }
    } catch (err) {
      entry.error = (err as Error).message;
    }
    manifest.push(entry);
    console.log(`${t.chainId.padEnd(10)} ${String(entry.status ?? 'ERR').padEnd(4)} ${t.url}${entry.error ? ` (${entry.error})` : ''}`);
    await new Promise((r) => setTimeout(r, 1_500));
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/MANIFEST.json`, JSON.stringify({ archivedAt: new Date().toISOString(), userAgent: ua, entries: manifest }, null, 2) + '\n');
  const ok = manifest.filter((m) => m.file).length;
  console.log(`\n${ok}/${manifest.length} pages archivées dans legal/archives/${day}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
