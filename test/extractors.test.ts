import { describe, expect, it } from 'vitest';
import { aldiToOffer, extractAldi, sizeFromBasePrice, type AldiProduct } from '../src/collect/extractors/aldi.ts';
import { extractDelhaize, parseSpokenEuros, parseSpokenUnit } from '../src/collect/extractors/delhaize.ts';

// Structures reproduites d'après les vraies pages (17/11/2026), contenus fictifs.
const now = new Date('2026-11-17T12:00:00Z');
const sec = (iso: string) => Date.parse(iso) / 1000;

function aldiPage(product: object): string {
  const apiData = JSON.stringify([['PRODUCT_DETAIL_GET', { req: { productIds: ['1'] }, res: { products: [product] } }]]);
  const nextData = { props: { pageProps: { page: { apiData, other: 'texte PRODUCT_DETAIL_GET non JSON' } } } };
  return `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

const base: AldiProduct = {
  objectID: '9838',
  name: 'Fromage en tranches',
  brandName: 'MARQUE®',
  salesUnit: '200 g',
  mainCategoryID: 'kaas',
  currentPrice: {
    priceValue: 2.75,
    basePrice: [{ basePriceValue: 13.75, basePriceScale: 'par kg' }],
    validFrom: sec('2026-01-01T00:00:00Z'),
    validUntil: 0,
  },
};

describe('Aldi', () => {
  it('lit le produit dans __NEXT_DATA__ → apiData', () => {
    const [o] = extractAldi(aldiPage({ ...base, assets: [{ url: 'photo.jpg' }], shortDescription: 'texte' }), 'https://www.aldi.be/fr/product/x-9838.html', now);
    expect(o).toMatchObject({
      chainId: 'aldi',
      productKey: '9838',
      name: 'Fromage en tranches',
      brand: 'MARQUE',
      size: { amount: 0.2, unit: 'kg' },
      price: 2.75,
      category: 'kaas',
    });
    expect(o!.promo).toBeUndefined();
    expect(JSON.stringify(o)).not.toContain('photo.jpg');
    expect(JSON.stringify(o)).not.toContain('texte');
  });

  it('déduit le format du prix au litre (« 2 x (6 x 33 cl) »)', () => {
    expect(sizeFromBasePrice({ priceValue: 7.98, basePrice: [{ basePriceValue: 2.02, basePriceScale: 'par l' }] })).toEqual({ amount: 3.95, unit: 'l' });
  });

  it('exclut un article temporaire sans prix barré', () => {
    const temp = { ...base, currentPrice: { priceValue: 8.99, validFrom: sec('2026-11-16T23:00:00Z'), validUntil: sec('2026-11-21T23:00:00Z') } };
    expect(aldiToOffer(temp, 'u', now)).toBeUndefined();
  });

  it('exclut un article pas encore en vente', () => {
    const futur = { ...base, currentPrice: { priceValue: 5.99, validFrom: sec('2026-11-19T23:00:00Z'), validUntil: 0 } };
    expect(aldiToOffer(futur, 'u', now)).toBeUndefined();
  });

  it('promo : prix barré = prix régulier, dates de Bruxelles, fin exclusive', () => {
    const promoPrice = {
      priceValue: 3.49,
      strikePrice: { strikePriceValue: 6.98 },
      basePrice: [{ basePriceValue: 3.17, basePriceScale: 'par kg' }],
      priceTagLabels: { promoText1: '1+1 gratuit' },
      validFrom: sec('2026-11-15T23:00:00Z'), // lundi 16/11 00:00 à Bruxelles
      validUntil: sec('2026-11-21T23:00:00Z'), // dimanche 22/11 00:00 → dernier jour samedi 21/11
    };
    const o = aldiToOffer({ ...base, salesUnit: '2 x 550 g', currentPrice: promoPrice, promotionPrices: [promoPrice] }, 'u', now)!;
    expect(o.price).toBe(6.98);
    expect(o.promo).toEqual({ price: 3.49, label: '1+1 gratuit', validFrom: '2026-11-16', validTo: '2026-11-21' });
    expect(o.size).toEqual({ amount: 1.101, unit: 'kg' });
  });

  it('promo à venir : prix régulier garanti, promo future conservée (inactive aujourd’hui)', () => {
    const p = {
      priceValue: 7.98,
      strikePrice: { strikePriceValue: 9.98 },
      validFrom: sec('2026-11-19T23:00:00Z'),
      validUntil: sec('2026-11-26T23:00:00Z'),
    };
    const o = aldiToOffer({ ...base, currentPrice: p, promotionPrices: [p] }, 'u', now)!;
    expect(o.price).toBe(9.98);
    expect(o.promo?.validFrom).toBe('2026-11-20');
  });
});

function delhaizePage(opts: { price: string; old?: string; unit?: string; notYet?: boolean; ldPrice?: number }): string {
  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: 'Bonbons | Oursons',
    category: 'Bonbons',
    brand: { '@type': 'Brand', name: 'Marque' },
    image: ['photo.jpg'],
    description: 'texte protégé',
    offers: { '@type': 'Offer', priceSpecification: { '@type': 'UnitPriceSpecification', price: opts.ldPrice ?? 9.99, priceCurrency: 'EUR' } },
  };
  return `<html><script type="application/ld+json">${JSON.stringify(ld)}</script>
  <div data-stellar="st-web-price" data-testid="product-block-price" aria-label="${opts.price}" class="a"><span>€</span></div>
  ${opts.old ? `<div data-testid="product-block-old-price" aria-label="${opts.old}" class="b">€</div>` : ''}
  ${opts.unit ? `<div data-testid="product-block-price-per-unit" type="sale" aria-label="${opts.unit}">x</div>` : ''}
  ${opts.notYet ? '<p>Commandable à partir du 20/11</p>' : ''}
  <div>Contenu net</div><div><span>75 g</span></div></html>`;
}

describe('Delhaize', () => {
  const url = 'https://www.delhaize.be/fr/shop/Epicerie-sucree/Bonbons/Oursons/p/S2024022000754220000';

  it('« 2 euros et 29 centimes » et unités', () => {
    expect(parseSpokenEuros('Prix: 2 euros et 29 centimes')).toBe(2.29);
    expect(parseSpokenEuros('Nouveau prix: 0 euro et 59 centimes')).toBe(0.59);
    expect(parseSpokenEuros('Prix: 3 euros')).toBe(3);
    expect(parseSpokenUnit('Prix par unité: 13 euros et 09 centimes par kg')).toBe('kg');
    expect(parseSpokenUnit('Prix par unité: 1 euro par l')).toBe('l');
  });

  it('prix affiché prioritaire sur le JSON-LD, format déduit du prix unitaire', () => {
    const [o] = extractDelhaize(delhaizePage({ price: 'Prix: 1 euro et 18 centimes', unit: 'Prix par unité: 15 euros et 73 centimes par kg', ldPrice: 1.16 }), url, now);
    expect(o).toMatchObject({ productKey: 'S2024022000754220000', name: 'Bonbons Oursons', brand: 'Marque', price: 1.18, size: { amount: 0.075, unit: 'kg' }, category: 'Bonbons' });
    expect(o!.promo).toBeUndefined();
    expect(JSON.stringify(o)).not.toMatch(/photo|protégé/);
  });

  it('promo valable seulement le jour du relevé', () => {
    const [o] = extractDelhaize(
      delhaizePage({ price: 'Nouveau prix: 0 euro et 59 centimes', old: 'Ancien prix: 1 euro et 18 centimes ', unit: 'Nouveau prix par unité: 7 euros et 86 centimes par kg' }),
      url,
      now,
    );
    expect(o!.price).toBe(1.18);
    expect(o!.promo).toEqual({ price: 0.59, label: 'Promo', validFrom: '2026-11-17', validTo: '2026-11-17' });
    expect(o!.size).toEqual({ amount: 0.075, unit: 'kg' });
  });

  it('« Commandable à partir du … » : promo ignorée, ancien prix conservé', () => {
    const [o] = extractDelhaize(
      delhaizePage({ price: 'Nouveau prix: 0 euro et 59 centimes', old: 'Ancien prix: 1 euro et 18 centimes', notYet: true }),
      url,
      now,
    );
    expect(o!.price).toBe(1.18);
    expect(o!.promo).toBeUndefined();
  });

  it('le contenu net publié prime sur le format calculé', () => {
    const [o] = extractDelhaize(delhaizePage({ price: 'Prix: 2 euros et 75 centimes', unit: 'Prix par unité: 3 euros et 67 centimes par kg' }), url, now);
    expect(o!.size).toEqual({ amount: 0.075, unit: 'kg' }); // « Contenu net 75 g » de la page, pas 2,75 / 3,67
  });

  it('sans contenu net : format calculé depuis le prix unitaire', () => {
    const html = delhaizePage({ price: 'Prix: 1 euro et 18 centimes', unit: 'Prix par unité: 15 euros et 73 centimes par kg' }).replace('Contenu net', 'Autre');
    expect(extractDelhaize(html, url, now)[0]!.size).toEqual({ amount: 0.075, unit: 'kg' });
  });

  it('sans prix affiché : repli sur le JSON-LD', () => {
    const html = delhaizePage({ price: '' }).replace(/<div data-stellar[^>]*>.*?<\/div>/s, '');
    expect(extractDelhaize(html, url, now)[0]!.price).toBe(9.99);
  });
});
