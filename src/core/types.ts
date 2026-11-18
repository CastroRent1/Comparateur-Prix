/**
 * Modèle de données du comparateur.
 *
 * Principe directeur (cf. docs/dossier-avocat.md) : on ne stocke que des FAITS
 * (nom, marque, format, prix, promo, dates, code-barres, URL source).
 * Jamais de photos ni de descriptions copiées des enseignes.
 */

/** Ce que l'appli sait réellement d'une enseigne. Affiché tel quel à l'utilisateur. */
export type Coverage =
  /** Prix réguliers + promos : le panier complet est comparable. */
  | 'full'
  /** Promotions seulement (ex. Lidl) : jamais classé dans le panier complet. */
  | 'promos'
  /** Pas encore couverte. */
  | 'none';

/** À quel niveau l'enseigne fixe ses prix. */
export type PriceScope =
  /** Même prix dans toute la Belgique (ex. Aldi). */
  | 'national'
  /** Prix propre à chaque magasin (ex. Colruyt) : on rattache à un magasin de référence. */
  | 'store'
  /** Prix par format de magasin (ex. Carrefour Hyper / Market / Express). */
  | 'format';

export interface Chain {
  id: string;
  name: string;
  /** Domaine affiché dans le libellé « Prix relevé sur … ». */
  domain: string;
  coverage: Coverage;
  priceScope: PriceScope;
  /** Phrase courte affichée à l'utilisateur pour expliquer la couverture. */
  coverageNote: string;
}

export type BaseUnit = 'kg' | 'l' | 'piece';

/** Quantité normalisée dans l'unité de base (kg, l ou pièces). */
export interface Quantity {
  amount: number;
  unit: BaseUnit;
}

export interface Promo {
  /** Prix promotionnel unitaire, en euros. */
  price: number;
  /** Libellé lisible : « 2e à moitié prix », « -30 % »… */
  label?: string;
  /** Premier jour de validité, AAAA-MM-JJ, heure de Bruxelles. */
  validFrom: string;
  /** Dernier jour de validité inclus, AAAA-MM-JJ, heure de Bruxelles. */
  validTo: string;
  /** Promo réservée à une carte de fidélité (Xtra, SuperPlus, Bonus, Lidl Plus…). */
  requiresCard?: boolean;
}

/** Un prix observé pour un produit d'une enseigne, à un instant donné. */
export interface Offer {
  chainId: string;
  /**
   * Référence de prix : identifiant du magasin (scope « store ») ou du format
   * (scope « format ») dont ce prix provient. Absent pour le scope « national ».
   */
  priceRef?: string;
  /** Identifiant du produit chez l'enseigne (SKU, ou à défaut EAN ou URL). */
  productKey: string;
  name: string;
  brand?: string;
  /** Code-barres EAN/GTIN, sans zéros de tête superflus. */
  ean?: string;
  size?: Quantity;
  /** Format tel qu'affiché par l'enseigne (« 6 x 33 cl »). */
  sizeText?: string;
  /** Prix régulier unitaire en euros. Absent pour une enseigne « promos seulement ». */
  price?: number;
  /**
   * Prix au kilo / litre AFFICHÉ par l'enseigne le jour du relevé, pour le
   * prix affiché ce jour-là (promo comprise). Sert au contrôle qualité du format.
   */
  shownUnitPrice?: { value: number; unit: 'kg' | 'l' };
  promo?: Promo;
  /** Date du relevé, ISO 8601 UTC. */
  observedAt: string;
  /** Page publique d'où provient le prix. */
  sourceUrl: string;
  /** Rayon tel que publié par l'enseigne (fait, pas de texte descriptif). */
  category?: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Store extends GeoPoint {
  id: string;
  chainId: string;
  name: string;
  city?: string;
  /**
   * Référence de prix applicable à ce magasin (magasin de référence de la zone
   * ou format). Par défaut : l'id du magasin lui-même.
   */
  priceRef?: string;
}
