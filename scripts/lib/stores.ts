import type { Store } from '../../src/core/types.ts';

/**
 * Annuaire des magasins à partir d'OpenStreetMap (© contributeurs OSM,
 * licence ODbL — attribution obligatoire dans l'appli).
 *
 * Formats exclus volontairement : Proxy Delhaize et Shop'n Go (proximité,
 * prix potentiellement différents de la boutique en ligne), Carrefour Express.
 */

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface ChainMatch {
  chainId: string;
  /** Format (pour les enseignes à prix par format). */
  format?: string;
}

const norm = (s: string | undefined) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .trim();

export function classifyChain(tags: Record<string, string> = {}): ChainMatch | undefined {
  const brand = norm(tags.brand);
  const name = norm(tags.name);
  const label = brand || name;

  if (/\bproxy\b|shop'?n'? ?go/.test(label) || /\bproxy\b|shop'?n'? ?go/.test(name)) return undefined;
  if (/\bdelhaize\b/.test(label)) return { chainId: 'delhaize', format: /^ad\b/.test(label) || /^ad\b/.test(name) ? 'ad' : 'delhaize' };
  if (/^aldi\b/.test(label)) return { chainId: 'aldi' };
  if (/^lidl\b/.test(label)) return { chainId: 'lidl' };
  if (/^albert heijn\b/.test(label)) return { chainId: 'ah' };
  if (/^colruyt\b/.test(label)) return { chainId: 'colruyt' };
  if (/^carrefour\b/.test(label)) {
    if (/express/.test(label) || /express/.test(name)) return undefined;
    if (/market/.test(label) || /market/.test(name)) return { chainId: 'carrefour', format: 'market' };
    if (/hyper/.test(label) || /hyper/.test(name)) return { chainId: 'carrefour', format: 'hyper' };
    return { chainId: 'carrefour', format: 'market' };
  }
  return undefined;
}

const CHAIN_LABEL: Record<string, string> = {
  aldi: 'Aldi',
  delhaize: 'Delhaize',
  lidl: 'Lidl',
  ah: 'Albert Heijn',
  colruyt: 'Colruyt',
  carrefour: 'Carrefour',
};

export function osmToStore(el: OsmElement): (Store & { format?: string }) | undefined {
  const match = classifyChain(el.tags);
  if (!match) return undefined;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat === undefined || lon === undefined) return undefined;
  // Belgique (cadre large) : écarte les erreurs de géocodage.
  if (lat < 49.4 || lat > 51.6 || lon < 2.4 || lon > 6.5) return undefined;
  const t = el.tags ?? {};
  const city = t['addr:city'] ?? t['addr:municipality'];
  const street = t['addr:street'] ? `${t['addr:street']}${t['addr:housenumber'] ? ` ${t['addr:housenumber']}` : ''}` : undefined;
  const base = CHAIN_LABEL[match.chainId]!;
  const name = match.format === 'ad' ? `AD Delhaize${city ? ` ${city}` : ''}` : `${base}${city ? ` ${city}` : ''}`;
  return {
    id: `osm-${el.type[0]}${el.id}`,
    chainId: match.chainId,
    name,
    city: [street, t['addr:postcode'], city].filter(Boolean).join(', ') || undefined,
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
    // Carrefour : prix par format → la référence de prix est le format.
    priceRef: match.chainId === 'carrefour' ? match.format : undefined,
    format: match.format,
  };
}

export const OVERPASS_QUERY = `[out:json][timeout:180];
area["ISO3166-1"="BE"][admin_level=2]->.be;
(
  nwr["shop"~"^(supermarket|convenience)$"]["brand"~"Aldi|Delhaize|Lidl|Albert Heijn|Colruyt|Carrefour",i](area.be);
  nwr["shop"~"^(supermarket|convenience)$"]["name"~"^(Aldi|Delhaize|AD Delhaize|Lidl|Albert Heijn|Colruyt|Carrefour)",i](area.be);
);
out center tags;`;
