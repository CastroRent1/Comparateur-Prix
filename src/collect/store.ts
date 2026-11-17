import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Offer } from '../core/types.ts';
import type { RunStats } from './collectors/sitemap-pages.ts';

/**
 * Fichier de prix par enseigne : data/latest/<enseigne>.json.
 *
 * Versionné dans git : l'historique git donne l'historique des prix
 * gratuitement (modèle Checkjebon, coûts fixes ≈ 0). Les offres sont triées
 * par productKey pour des diffs lisibles.
 *
 * Fusion : une collecte partielle (blocage, limite de pages) met à jour les
 * produits revus et conserve les autres avec leur ancienne date de relevé ;
 * les règles de fraîcheur les masqueront d'elles-mêmes après 72 h.
 */

export interface PriceFile {
  chainId: string;
  updatedAt: string;
  lastRun: RunStats & { at: string };
  offers: Offer[];
}

export function readPriceFile(path: string): PriceFile | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as PriceFile;
}

/** Supprime les offres plus vieilles que `dropAfterDays` (elles ne servent plus à rien). */
export function mergeOffers(previous: Offer[], fresh: Offer[], now: Date, dropAfterDays = 14): Offer[] {
  const byKey = new Map(previous.map((o) => [o.productKey, o]));
  for (const o of fresh) byKey.set(o.productKey, o);
  const cutoff = now.getTime() - dropAfterDays * 86_400_000;
  return [...byKey.values()]
    .filter((o) => Date.parse(o.observedAt) >= cutoff)
    .sort((a, b) => a.productKey.localeCompare(b.productKey));
}

export function writePriceFile(path: string, file: PriceFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 1) + '\n');
}
