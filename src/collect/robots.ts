/**
 * Lecture de robots.txt (RFC 9309) : groupes user-agent, Allow/Disallow avec
 * jokers `*` et ancre `$`, règle la plus longue gagnante (Allow l'emporte à
 * égalité), Crawl-delay et Sitemap.
 */

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  crawlDelaySec?: number;
  sitemaps: string[];
}

interface Group {
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelaySec?: number;
}

export function parseRobots(txt: string, agentToken: string): RobotsRules {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | undefined;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow') current.allow.push(value);
    else if (field === 'disallow') current.disallow.push(value);
    else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelaySec = n;
    }
  }

  const token = agentToken.toLowerCase();
  // Groupe le plus spécifique dont le nom figure dans notre user-agent.
  let selected: Group[] = [];
  let bestLen = 0;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a !== '*' && token.includes(a) && a.length >= bestLen) {
        if (a.length > bestLen) selected = [];
        bestLen = a.length;
        selected.push(g);
      }
    }
  }
  if (selected.length === 0) selected = groups.filter((g) => g.agents.includes('*'));

  const crawlDelays = selected.map((g) => g.crawlDelaySec).filter((n): n is number => n !== undefined);
  return {
    allow: selected.flatMap((g) => g.allow).filter(Boolean),
    disallow: selected.flatMap((g) => g.disallow).filter(Boolean),
    crawlDelaySec: crawlDelays.length ? Math.max(...crawlDelays) : undefined,
    sitemaps,
  };
}

function patternToRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + (anchored ? '$' : ''));
}

/** `pathWithQuery` : chemin + éventuelle query string, ex. « /fr/p/123?x=1 ». */
export function isAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  let best: { len: number; allow: boolean } | undefined;
  const consider = (patterns: string[], allow: boolean) => {
    for (const p of patterns) {
      if (!patternToRegex(p).test(pathWithQuery)) continue;
      const len = p.length;
      if (!best || len > best.len || (len === best.len && allow)) best = { len, allow };
    }
  };
  consider(rules.disallow, false);
  consider(rules.allow, true);
  return best ? best.allow : true;
}
