import type { Chain, Offer, Promo } from './types.ts';

/**
 * Règles d'actualité des prix (remplacent la « règle des 3 jours ») :
 *
 * 1. Une promo n'est affichée que PENDANT sa période de validité, quelle que
 *    soit la date du relevé.
 * 2. Un prix régulier est « actuel » s'il a au plus FRESH_HOURS heures ;
 *    entre FRESH_HOURS et MAX_HOURS il est affiché grisé avec avertissement ;
 *    au-delà de MAX_HOURS il n'est plus affiché.
 * 3. Libellé factuel : « Prix relevé sur colruyt.be le 16/11 à 8 h, magasin de
 *    référence : Anderlecht » — jamais « prix vérifié ».
 * 4. Avertissement explicite : DISCLAIMER.
 */

export const FRESH_HOURS = 48;
export const MAX_HOURS = 72;
export const TIME_ZONE = 'Europe/Brussels';
export const DISCLAIMER = "Le prix en magasin et sur le site de l'enseigne fait foi.";

export type Freshness = 'fresh' | 'stale' | 'expired';

const HOUR_MS = 3_600_000;

export function classifyFreshness(observedAt: string, now: Date): Freshness {
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) return 'expired';
  const ageH = (now.getTime() - observed) / HOUR_MS;
  // Un relevé « dans le futur » (horloge décalée) est traité comme frais,
  // sauf s'il est absurde (> 1 h d'avance) : on le rejette.
  if (ageH < -1) return 'expired';
  if (ageH <= FRESH_HOURS) return 'fresh';
  if (ageH <= MAX_HOURS) return 'stale';
  return 'expired';
}

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Date calendaire à Bruxelles, au format AAAA-MM-JJ. */
export function brusselsDate(d: Date): string {
  return dateFmt.format(d);
}

/** La promo est-elle valable aujourd'hui (heure de Bruxelles) ? Bornes incluses. */
export function isPromoActive(promo: Promo | undefined, now: Date): boolean {
  if (!promo) return false;
  const today = brusselsDate(now);
  return promo.validFrom <= today && today <= promo.validTo;
}

const dayMonthFmt = new Intl.DateTimeFormat('fr-BE', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
});
const hourMinuteFmt = new Intl.DateTimeFormat('fr-BE', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** « 8 h », « 8 h 05 », « 17 h 30 ». */
export function formatHour(d: Date): string {
  const parts = hourMinuteFmt.formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return m === '00' ? `${h} h` : `${h} h ${m}`;
}

/**
 * « Prix relevé sur aldi.be le 16/11 à 8 h »
 * « Prix relevé sur colruyt.be le 16/11 à 8 h, magasin de référence : Anderlecht »
 */
export function observationLabel(offer: Offer, chain: Chain, referenceName?: string): string {
  const d = new Date(offer.observedAt);
  let label = `Prix relevé sur ${chain.domain} le ${dayMonthFmt.format(d)} à ${formatHour(d)}`;
  if (referenceName && chain.priceScope !== 'national') {
    const kind = chain.priceScope === 'store' ? 'magasin de référence' : 'format de référence';
    label += `, ${kind} : ${referenceName}`;
  }
  return label;
}

export function freshnessWarning(f: Freshness): string | undefined {
  if (f === 'stale') return `Prix relevé il y a plus de ${FRESH_HOURS} heures : il a peut-être changé.`;
  return undefined;
}
