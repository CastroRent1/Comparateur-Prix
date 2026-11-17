import { gunzipSync } from 'node:zlib';
import { isAllowed, parseRobots, type RobotsRules } from './robots.ts';

/**
 * Client HTTP « poli » pour la collecte.
 *
 * Politique (à ne PAS assouplir sans avis de l'avocat, cf. docs/dossier-avocat.md) :
 * - pages publiques uniquement, jamais de connexion à un compte ;
 * - robots.txt respecté (Disallow + Crawl-delay) ;
 * - user-agent qui s'identifie, avec une URL de contact ;
 * - cadence lente (une requête à la fois, délai minimal entre deux requêtes) ;
 * - AUCUN contournement : pas de proxys tournants, pas de rotation de
 *   user-agent, pas de résolution de captcha. Au premier signe de blocage
 *   répété, on S'ARRÊTE (BlockedError).
 */

export interface FetcherOptions {
  /** Nom du robot, ex. « PanierMalinBot ». Sert aussi à choisir le groupe robots.txt. */
  botName: string;
  botVersion?: string;
  /** Page qui explique le robot et permet de nous contacter. */
  contactUrl: string;
  /** Délai minimal entre deux requêtes vers le même hôte (ms). */
  minDelayMs?: number;
  /** Nombre de réponses « bloquantes » consécutives avant abandon. */
  maxConsecutiveBlocks?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
  blocked: boolean;
}

export class BlockedError extends Error {
  constructor(public readonly host: string, public readonly lastStatus: number) {
    super(`Collecte arrêtée : ${host} semble bloquer le robot (dernier statut HTTP ${lastStatus}). Aucun contournement n'est tenté.`);
    this.name = 'BlockedError';
  }
}

export class DisallowedError extends Error {
  constructor(public readonly url: string) {
    super(`robots.txt interdit l'accès à ${url}`);
    this.name = 'DisallowedError';
  }
}

const BLOCK_STATUSES = new Set([401, 403, 429, 503]);
const CHALLENGE_MAX_BYTES = 15_000;
const CHALLENGE_MARKERS = [
  'captcha',
  'cf-chl',
  'challenge-platform',
  'are you a robot',
  'access denied',
  'request unsuccessful. incapsula',
  'px-captcha',
  'datadome',
];

export function looksLikeChallenge(status: number, contentType: string, body: Buffer): boolean {
  if (BLOCK_STATUSES.has(status)) return true;
  if (!contentType.includes('html')) return false;
  // Les pages de défi anti-robot sont petites. Une vraie page produit (souvent
  // > 50 Ko) peut mentionner « captcha » (reCAPTCHA d'une newsletter) sans
  // être un blocage : on ne l'inspecte donc pas.
  if (body.length > CHALLENGE_MAX_BYTES) return false;
  const text = body.toString('utf8').toLowerCase();
  return CHALLENGE_MARKERS.some((m) => text.includes(m));
}

export class PoliteFetcher {
  private readonly opts: Required<Omit<FetcherOptions, 'botVersion'>> & { botVersion: string };
  private readonly robots = new Map<string, RobotsRules>();
  private readonly lastRequestAt = new Map<string, number>();
  private consecutiveBlocks = 0;
  public requestCount = 0;

  constructor(options: FetcherOptions) {
    this.opts = {
      botVersion: '0.1',
      minDelayMs: 2_000,
      maxConsecutiveBlocks: 3,
      timeoutMs: 30_000,
      fetchImpl: globalThis.fetch.bind(globalThis),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      ...options,
    };
  }

  get userAgent(): string {
    return `Mozilla/5.0 (compatible; ${this.opts.botName}/${this.opts.botVersion}; +${this.opts.contactUrl})`;
  }

  /** Règles robots.txt de l'origine (téléchargées une seule fois). */
  async rulesFor(origin: string): Promise<RobotsRules> {
    const cached = this.robots.get(origin);
    if (cached) return cached;
    const res = await this.rawGet(`${origin}/robots.txt`);
    let rules: RobotsRules;
    if (res.status >= 200 && res.status < 300) {
      rules = parseRobots(res.body.toString('utf8'), this.opts.botName);
    } else if (res.status >= 400 && res.status < 500 && !res.blocked) {
      // RFC 9309 : robots.txt absent (4xx) → tout est autorisé.
      rules = { allow: [], disallow: [], sitemaps: [] };
    } else {
      // Erreur serveur ou blocage : par prudence, on considère tout interdit.
      rules = { allow: [], disallow: ['/'], sitemaps: [] };
    }
    this.robots.set(origin, rules);
    return rules;
  }

  async get(url: string): Promise<FetchResult> {
    const u = new URL(url);
    const rules = await this.rulesFor(u.origin);
    if (!isAllowed(rules, u.pathname + u.search)) throw new DisallowedError(url);
    return this.rawGet(url, rules.crawlDelaySec);
  }

  async getText(url: string): Promise<{ status: number; text: string; contentType: string }> {
    const r = await this.get(url);
    return { status: r.status, contentType: r.contentType, text: decodeBody(r.body).toString('utf8') };
  }

  private async rawGet(url: string, crawlDelaySec?: number): Promise<FetchResult> {
    const host = new URL(url).host;
    const delay = Math.max(this.opts.minDelayMs, (crawlDelaySec ?? 0) * 1000);
    const last = this.lastRequestAt.get(host);
    if (last !== undefined) {
      const wait = last + delay - this.opts.now();
      if (wait > 0) await this.opts.sleep(wait);
    }
    this.lastRequestAt.set(host, this.opts.now());
    this.requestCount++;

    const res = await this.opts.fetchImpl(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept-Language': 'fr-BE,fr;q=0.9,nl-BE;q=0.6,en;q=0.4',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    const body = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? '';
    const blocked = looksLikeChallenge(res.status, contentType, body);

    if (blocked) {
      this.consecutiveBlocks++;
      if (this.consecutiveBlocks >= this.opts.maxConsecutiveBlocks) throw new BlockedError(host, res.status);
    } else {
      this.consecutiveBlocks = 0;
    }
    return { url: res.url || url, status: res.status, contentType, body, blocked };
  }
}

/** Décompresse les fichiers .gz (sitemaps) si nécessaire. */
export function decodeBody(body: Buffer): Buffer {
  if (body.length > 2 && body[0] === 0x1f && body[1] === 0x8b) return gunzipSync(body);
  return body;
}
