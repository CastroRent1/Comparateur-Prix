import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BlockedError, DisallowedError, looksLikeChallenge, PoliteFetcher } from '../src/collect/http.ts';
import { extractProducts, parsePrice } from '../src/collect/jsonld.ts';
import { isAllowed, parseRobots } from '../src/collect/robots.ts';
import { collectSitemapUrls, parseSitemap } from '../src/collect/sitemap.ts';
import { mergeOffers } from '../src/collect/store.ts';
import { parseChains } from '../src/config.ts';
import type { Offer } from '../src/core/types.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('robots.txt', () => {
  const txt = `
# commentaire
User-agent: *
Disallow: /checkout
Disallow: /*?sort=
Allow: /checkout/aide$
Crawl-delay: 5

User-agent: PanierMalinBot
User-agent: AutreBot
Disallow: /prive/

Sitemap: https://www.exemple.be/sitemap.xml
`;
  it('prend le groupe spécifique à notre robot', () => {
    const r = parseRobots(txt, 'PanierMalinBot');
    expect(r.disallow).toEqual(['/prive/']);
    expect(r.crawlDelaySec).toBeUndefined();
    expect(r.sitemaps).toEqual(['https://www.exemple.be/sitemap.xml']);
  });
  it('sinon le groupe *, avec jokers et ancre $', () => {
    const r = parseRobots(txt, 'UnRobotQuelconque');
    expect(r.crawlDelaySec).toBe(5);
    expect(isAllowed(r, '/produits/lait')).toBe(true);
    expect(isAllowed(r, '/checkout/panier')).toBe(false);
    expect(isAllowed(r, '/checkout/aide')).toBe(true);
    expect(isAllowed(r, '/checkout/aide/plus')).toBe(false);
    expect(isAllowed(r, '/produits?sort=prix')).toBe(false);
  });
  it('« Disallow: » vide = tout autorisé', () => {
    expect(isAllowed(parseRobots('User-agent: *\nDisallow:', 'x'), '/tout')).toBe(true);
  });
});

describe('sitemap', () => {
  it('lit un index et un urlset (entités, CDATA)', () => {
    expect(parseSitemap(fixture('sitemap-index.xml'))).toEqual({
      kind: 'index',
      locs: ['https://www.exemple.be/sitemap-produits.xml', 'https://www.exemple.be/sitemap-recettes.xml'],
    });
    const urlset = parseSitemap(fixture('sitemap-produits.xml'));
    expect(urlset.kind).toBe('urlset');
    expect(urlset.locs).toContain('https://www.exemple.be/fr/lait-demi-ecreme.html?a=1&b=2');
  });
});

describe('JSON-LD', () => {
  it('extrait uniquement les faits utiles (pas d’image, pas de description)', () => {
    const [p] = extractProducts(fixture('page-produit.html'), 'https://www.exemple.be/fr/lait.html');
    expect(p).toEqual({
      name: 'Lait demi-écrémé',
      brand: 'Marque Exemple',
      gtin: '5400000000017',
      sku: '12345',
      price: 1.05,
      currency: 'EUR',
      priceValidUntil: undefined,
      sizeText: '1 l',
      url: 'https://www.exemple.be/fr/lait.html',
    });
    expect(Object.keys(p!)).not.toContain('image');
    expect(Object.keys(p!)).not.toContain('description');
  });
  it('gère @graph, AggregateOffer et JSON invalide', () => {
    const html = `
      <script type="application/ld+json">{ invalide </script>
      <script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"},{"@type":["Product"],"name":"Riz","offers":{"@type":"AggregateOffer","lowPrice":"2,49","priceCurrency":"EUR"}}]}</script>`;
    const ps = extractProducts(html, 'https://x.invalid/riz');
    expect(ps).toHaveLength(1);
    expect(ps[0]!.price).toBe(2.49);
  });
  it.each([
    ['1,99', 1.99],
    ['€ 1.99', 1.99],
    ['1.234,56', 1234.56],
    [2.5, 2.5],
    ['0', undefined],
    ['gratuit', undefined],
  ] as const)('parsePrice(%s)', (v, expected) => {
    expect(parsePrice(v)).toBe(expected);
  });
});

describe('looksLikeChallenge', () => {
  const html = (s: string) => Buffer.from(s);
  it('statuts de blocage', () => {
    expect(looksLikeChallenge(403, 'text/html', html('x'))).toBe(true);
    expect(looksLikeChallenge(429, 'text/html', html('x'))).toBe(true);
  });
  it('petite page de défi', () => {
    expect(looksLikeChallenge(200, 'text/html', html('<html>Please complete the captcha</html>'))).toBe(true);
  });
  it('une grande page produit qui mentionne reCAPTCHA n’est pas un blocage', () => {
    expect(looksLikeChallenge(200, 'text/html', html('<html>' + 'x'.repeat(50_000) + 'recaptcha</html>'))).toBe(false);
  });
});

/** Faux serveur : URL → [statut, corps, content-type]. */
function fakeFetch(routes: Record<string, [number, string, string?]>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const [status, body, type] = routes[url] ?? [404, 'not found', 'text/plain'];
    return new Response(body, { status, headers: { 'content-type': type ?? 'text/html' } });
  }) as typeof fetch;
  return { impl, calls };
}

const fetcherWith = (routes: Record<string, [number, string, string?]>) => {
  const f = fakeFetch(routes);
  const sleeps: number[] = [];
  let clock = 0;
  const fetcher = new PoliteFetcher({
    botName: 'PanierMalinBot',
    contactUrl: 'https://paniermalin.be/robot',
    minDelayMs: 1000,
    fetchImpl: f.impl,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
  });
  return { fetcher, calls: f.calls, sleeps };
};

describe('PoliteFetcher', () => {
  it('respecte robots.txt et le crawl-delay', async () => {
    const { fetcher, calls, sleeps } = fetcherWith({
      'https://www.exemple.be/robots.txt': [200, 'User-agent: *\nDisallow: /prive\nCrawl-delay: 3', 'text/plain'],
      'https://www.exemple.be/ok': [200, 'ok'],
    });
    await expect(fetcher.get('https://www.exemple.be/prive/x')).rejects.toBeInstanceOf(DisallowedError);
    await fetcher.get('https://www.exemple.be/ok');
    await fetcher.get('https://www.exemple.be/ok');
    expect(calls.filter((c) => c.endsWith('/robots.txt'))).toHaveLength(1);
    expect(sleeps).toContain(3000);
  });

  it('robots.txt injoignable (5xx) → tout interdit par prudence', async () => {
    const { fetcher } = fetcherWith({ 'https://www.exemple.be/robots.txt': [500, 'erreur'] });
    await expect(fetcher.get('https://www.exemple.be/produit')).rejects.toBeInstanceOf(DisallowedError);
  });

  it('robots.txt absent (404) → autorisé', async () => {
    const { fetcher } = fetcherWith({ 'https://www.exemple.be/produit': [200, 'ok'] });
    expect((await fetcher.get('https://www.exemple.be/produit')).status).toBe(200);
  });

  it('s’arrête après 3 blocages consécutifs, sans contournement', async () => {
    const { fetcher, calls } = fetcherWith({
      'https://www.exemple.be/robots.txt': [200, 'User-agent: *\nDisallow:', 'text/plain'],
      'https://www.exemple.be/a': [403, 'interdit'],
      'https://www.exemple.be/b': [403, 'interdit'],
      'https://www.exemple.be/c': [403, 'interdit'],
    });
    await fetcher.get('https://www.exemple.be/a');
    await fetcher.get('https://www.exemple.be/b');
    await expect(fetcher.get('https://www.exemple.be/c')).rejects.toBeInstanceOf(BlockedError);
    expect(calls).toHaveLength(4); // robots + a + b + c, aucune nouvelle tentative
  });

  it('s’identifie dans le user-agent', () => {
    const { fetcher } = fetcherWith({});
    expect(fetcher.userAgent).toContain('PanierMalinBot/0.1; +https://paniermalin.be/robot');
  });

  it('parcourt les sitemaps imbriqués en filtrant les pages produit', async () => {
    const { fetcher } = fetcherWith({
      'https://www.exemple.be/robots.txt': [200, 'User-agent: *\nDisallow:', 'text/plain'],
      'https://www.exemple.be/sitemap.xml': [200, fixture('sitemap-index.xml'), 'application/xml'],
      'https://www.exemple.be/sitemap-produits.xml': [200, fixture('sitemap-produits.xml'), 'application/xml'],
    });
    const urls = await collectSitemapUrls(fetcher, ['https://www.exemple.be/sitemap.xml'], {
      urlFilter: /\/fr\/.+\.html/,
      sitemapFilter: /produits/,
      limit: 10,
    });
    expect(urls).toEqual([
      'https://www.exemple.be/fr/lait-demi-ecreme.html?a=1&b=2',
      'https://www.exemple.be/fr/spaghetti.html',
    ]);
  });
});

describe('mergeOffers', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const o = (key: string, observedAt: string, price = 1): Offer => ({
    chainId: 'aldi',
    productKey: key,
    name: key,
    price,
    observedAt,
    sourceUrl: 'https://x.invalid',
  });
  it('met à jour, conserve, puis purge au-delà de 14 jours', () => {
    const merged = mergeOffers(
      [o('b', '2026-11-16T00:00:00Z', 1), o('a', '2026-11-16T00:00:00Z'), o('vieux', '2026-10-01T00:00:00Z')],
      [o('b', '2026-11-17T00:00:00Z', 2)],
      now,
    );
    expect(merged.map((m) => [m.productKey, m.price])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });
});

describe('config/chains.json', () => {
  it('le fichier du dépôt est valide', () => {
    const chains = parseChains(JSON.parse(readFileSync(new URL('../config/chains.json', import.meta.url), 'utf8')));
    expect(chains.map((c) => c.id)).toContain('aldi');
  });
  it('Lidl n’est jamais annoncé avec un panier complet', () => {
    const chains = parseChains(JSON.parse(readFileSync(new URL('../config/chains.json', import.meta.url), 'utf8')));
    expect(chains.find((c) => c.id === 'lidl')!.coverage).not.toBe('full');
  });
  it('rejette une config invalide', () => {
    expect(() => parseChains({ chains: [{ id: 'x' }] })).toThrow(/manquant/);
  });
});
