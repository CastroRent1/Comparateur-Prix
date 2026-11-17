import type { PoliteFetcher } from './http.ts';

export interface ParsedSitemap {
  kind: 'index' | 'urlset' | 'unknown';
  locs: string[];
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Lecture volontairement simple (regex) : les sitemaps ont une structure fixe. */
export function parseSitemap(xml: string): ParsedSitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? 'index' : /<urlset[\s>]/i.test(xml) ? 'urlset' : 'unknown';
  const locs: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
  for (let m = re.exec(xml); m; m = re.exec(xml)) locs.push(decodeXmlEntities(m[1]!));
  return { kind, locs };
}

export interface SitemapWalkOptions {
  /** Ne garder que les URL qui correspondent (pages produit). */
  urlFilter: RegExp;
  /** Ne descendre que dans les sous-sitemaps qui correspondent (facultatif). */
  sitemapFilter?: RegExp;
  limit: number;
  maxDepth?: number;
  log?: (msg: string) => void;
}

/** Parcourt les sitemaps (index imbriqués compris) et renvoie les URL produit. */
export async function collectSitemapUrls(
  fetcher: PoliteFetcher,
  roots: string[],
  opts: SitemapWalkOptions,
): Promise<string[]> {
  const found = new Set<string>();
  const seen = new Set<string>();
  const maxDepth = opts.maxDepth ?? 3;

  const walk = async (url: string, depth: number): Promise<void> => {
    if (found.size >= opts.limit || seen.has(url) || depth > maxDepth) return;
    seen.add(url);
    const { status, text } = await fetcher.getText(url);
    if (status < 200 || status >= 300) {
      opts.log?.(`sitemap ${url} → HTTP ${status}, ignoré`);
      return;
    }
    const sm = parseSitemap(text);
    if (sm.kind === 'index') {
      for (const child of sm.locs) {
        if (opts.sitemapFilter && !opts.sitemapFilter.test(child)) continue;
        await walk(child, depth + 1);
        if (found.size >= opts.limit) return;
      }
    } else {
      for (const loc of sm.locs) {
        if (opts.urlFilter.test(loc)) found.add(loc);
        if (found.size >= opts.limit) return;
      }
    }
  };

  for (const root of roots) await walk(root, 0);
  return [...found];
}
