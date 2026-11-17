/**
 * Démonstration du calcul de panier — DONNÉES ENTIÈREMENT FICTIVES.
 * Prix, magasins et coordonnées sont inventés pour illustrer le moteur.
 *
 *   npm run demo
 */
import { computeBasket, type BasketLine } from './core/basket.ts';
import { freshnessWarning, observationLabel } from './core/freshness.ts';
import { formatEuro } from './core/units.ts';
import type { Chain, Offer, Store } from './core/types.ts';

const now = new Date('2026-11-17T10:00:00+01:00');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

const chains: Chain[] = [
  { id: 'aldi', name: 'Aldi', domain: 'aldi.be', coverage: 'full', priceScope: 'national', coverageNote: 'Prix national.' },
  { id: 'colruyt', name: 'Colruyt', domain: 'colruyt.be', coverage: 'full', priceScope: 'store', coverageNote: 'Prix du magasin de référence.' },
  { id: 'carrefour', name: 'Carrefour', domain: 'carrefour.be', coverage: 'full', priceScope: 'format', coverageNote: 'Prix du format Market.' },
  { id: 'lidl', name: 'Lidl', domain: 'lidl.be', coverage: 'promos', priceScope: 'national', coverageNote: 'Promotions seulement.' },
];

const origin = { lat: 50.8272, lon: 4.3466 }; // Saint-Gilles (approx.)
const stores: Store[] = [
  { id: 'aldi-fictif-1', chainId: 'aldi', name: 'Aldi (magasin fictif 1)', lat: 50.829, lon: 4.341 },
  { id: 'colruyt-fictif-1', chainId: 'colruyt', name: 'Colruyt (magasin fictif 1)', lat: 50.821, lon: 4.336, priceRef: 'colruyt-ref-sud' },
  { id: 'colruyt-fictif-2', chainId: 'colruyt', name: 'Colruyt (magasin fictif 2)', lat: 50.845, lon: 4.36, priceRef: 'colruyt-ref-centre' },
  { id: 'carrefour-fictif-1', chainId: 'carrefour', name: 'Carrefour Market (fictif)', lat: 50.83, lon: 4.35, priceRef: 'market' },
  { id: 'lidl-fictif-1', chainId: 'lidl', name: 'Lidl (magasin fictif)', lat: 50.825, lon: 4.355 },
];

const o = (chainId: string, name: string, price: number | undefined, extra: Partial<Offer> = {}): Offer => ({
  chainId,
  productKey: `${chainId}:${name}`,
  name,
  price,
  observedAt: hoursAgo(6),
  sourceUrl: `https://www.${chainId}.be/exemple`,
  ...extra,
});

const lines: BasketLine[] = [
  {
    id: 'lait',
    label: 'Lait demi-écrémé 1 L',
    quantity: 6,
    offers: [
      o('aldi', 'Lait demi-écrémé 1 L', 1.05),
      o('colruyt', 'Lait demi-écrémé 1 L', 1.09, { priceRef: 'colruyt-ref-sud' }),
      o('colruyt', 'Lait demi-écrémé 1 L', 1.15, { priceRef: 'colruyt-ref-centre', productKey: 'colruyt:lait-centre' }),
      o('carrefour', 'Lait demi-écrémé 1 L', 1.19, { priceRef: 'market' }),
    ],
  },
  {
    id: 'pates',
    label: 'Spaghetti 500 g',
    quantity: 2,
    offers: [
      o('aldi', 'Spaghetti 500 g', 0.89, { observedAt: hoursAgo(60) }), // relevé de 60 h : grisé
      o('colruyt', 'Spaghetti 500 g', 0.95, { priceRef: 'colruyt-ref-sud' }),
      o('colruyt', 'Spaghetti 500 g', 0.99, { priceRef: 'colruyt-ref-centre', productKey: 'colruyt:pates-centre' }),
      o('carrefour', 'Spaghetti 500 g', 1.29, {
        priceRef: 'market',
        promo: { price: 0.85, label: '-35 %', validFrom: '2026-11-16', validTo: '2026-11-22' },
      }),
      o('lidl', 'Spaghetti 500 g', undefined, {
        promo: { price: 0.79, label: 'Promo de la semaine', validFrom: '2026-11-17', validTo: '2026-11-22' },
      }),
    ],
  },
  {
    id: 'cafe',
    label: 'Café moulu 250 g',
    quantity: 1,
    offers: [
      o('colruyt', 'Café moulu 250 g', 2.79, { priceRef: 'colruyt-ref-sud' }),
      o('colruyt', 'Café moulu 250 g', 2.85, { priceRef: 'colruyt-ref-centre', productKey: 'colruyt:cafe-centre' }),
      o('carrefour', 'Café moulu 250 g', 2.99, { priceRef: 'market' }),
      // Aldi : relevé de 100 h → trop vieux, considéré comme manquant.
      o('aldi', 'Café moulu 250 g', 2.49, { observedAt: hoursAgo(100) }),
    ],
  },
];

const refNames: Record<string, string> = {
  'colruyt-ref-sud': 'magasin fictif 1',
  'colruyt-ref-centre': 'magasin fictif 2',
  market: 'Market',
};

const frDate = (iso?: string) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '?');

const result = computeBasket(lines, stores, chains, { now, origin, maxDistanceKm: 5 });

console.log('=== DÉMO — DONNÉES FICTIVES ===\n');
console.log(`Liste : ${lines.map((l) => `${l.quantity} × ${l.label}`).join(', ')}\n`);
for (const s of result.stores) {
  const km = s.distanceKm?.toLocaleString('fr-BE', { maximumFractionDigits: 1 });
  const head = `${s.store.name} — ${km} km — ${formatEuro(s.total)}`;
  console.log(s.complete ? `✔ ${head}` : `✖ ${head} (incomplet : ${s.missing.map((m) => m.label).join(', ')} manquant)`);
  for (const p of s.priced) {
    const promo = p.isPromo ? ` [promo ${p.offer.promo?.label ?? ''}]` : '';
    const warn = freshnessWarning(p.freshness);
    console.log(`    ${p.quantity} × ${p.label} : ${formatEuro(p.lineTotal)}${promo}`);
    console.log(`      ${observationLabel(p.offer, s.chain, p.offer.priceRef ? refNames[p.offer.priceRef] : undefined)}${warn ? ` — ⚠ ${warn}` : ''}`);
  }
}
if (result.promosOnly.length) {
  console.log('\nPromotions seulement (enseignes sans prix réguliers en ligne) :');
  for (const h of result.promosOnly) {
    console.log(`  ${h.store.name} : ${h.label} à ${formatEuro(h.promoPrice)} (${h.offer.promo?.label}, jusqu'au ${frDate(h.offer.promo?.validTo)})`);
  }
}
console.log(`\n${result.disclaimer}`);
