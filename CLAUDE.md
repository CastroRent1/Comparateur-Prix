# Panier Malin — comparateur de supermarchés belges

## Objectif
Appli gratuite, francophone d'abord (Bruxelles, Wallonie), qui donne « le
panier le moins cher près de chez moi » en tenant compte du magasin réel.
Coûts fixes proches de zéro : collecte via GitHub Actions, données en JSON
versionné, site statique.

## Règles non négociables
- **Faits seulement** : nom, marque, format, prix, prix unitaire, promo et
  dates, EAN, URL source, date du relevé. JAMAIS de photos ni de
  descriptions des enseignes (images : Open Food Facts sous licence, ou rien).
- **Pas de contournement** : robots.txt respecté, user-agent identifié
  (PanierMalinBot + URL de contact), une requête à la fois, ≥ 2 s d'écart,
  arrêt au blocage. Pas de proxys tournants, rotation d'identité, captcha,
  ni connexion à un compte. Ne pas assouplir `src/collect/http.ts` sans avis
  écrit de l'avocat.
- **Couverture honnête** : une enseigne n'est `full` que si ses prix
  réguliers sont réellement collectés. Lidl = `promos` au mieux.
- **Fraîcheur** (`src/core/freshness.ts`) : promo affichée seulement pendant
  sa validité ; prix régulier actuel ≤ 48 h, grisé 48-72 h, masqué > 72 h ;
  libellé « Prix relevé sur X le JJ/MM à H h[, magasin de référence : Y] » ;
  avertissement « Le prix en magasin et sur le site de l'enseigne fait foi. »
  Jamais « prix vérifié ».
- **Prix locaux** : Colruyt = prix par magasin (`store`), Carrefour = par
  format (`format`), Aldi = national. Une offre ne s'applique qu'aux
  magasins de même `priceRef`.
- **Classement** : aucune enseigne ne paie pour être mieux classée ;
  placement sponsorisé toujours signalé.
- **Collecte nocturne active** (`collect.yml`) par décision du porteur de
  projet (17/11/2026) : l'appli d'abord, l'avocat ensuite si nécessaire.
  À suspendre immédiatement en cas de mise en demeure d'une enseigne.
- **Enseigne qui bloque = enseigne exclue** : Colruyt (page AntiBot),
  Carrefour (Cloudflare), Albert Heijn (403) ne sont PAS collectées. Ne
  jamais chercher à passer outre (autre IP, navigateur automatisé, etc.).
- **RGPD** : pas de cookie ni de traceur sur le site ; aucune donnée
  individuelle d'achat vendue, jamais.
- Ne jamais commiter `.env` ni de clé API.

## Architecture
- Collecte : `src/collect/` — sitemaps publics → pages produit →
  extracteur par enseigne (`src/collect/extractors/`). Aldi : JSON Next.js
  (`apiData` → `PRODUCT_DETAIL_GET`). Delhaize : prix affiché (aria-label),
  le JSON-LD ne fait pas foi ; promos limitées au jour du relevé.
- Données : `data/latest/<enseigne>.json` (prix), `data/stores.json`
  (OpenStreetMap, ODbL), `data/postcodes.json` (GeoNames, CC BY 4.0).
- Catalogue : `npm run catalog` → `web/app/data/catalog.json`, avec les
  équivalents entre enseignes (`EquivalenceIndex`, seuil 0,55, format ±30 %
  ou lot exact de 2 à 12 unités ; mot de variante d'un seul côté — bio,
  chocolat, moulu/grains… — ×0,7). Équivalent par défaut = le moins cher au
  kilo/litre parmi ceux à 0,25 du meilleur score (jamais un premier prix
  contre une grande marque par défaut).
- Rayons (`src/core/categories.ts`) : rayons communs à toutes les enseignes
  (catégorie Aldi `mainCategoryID` / chemin d'URL Delhaize, repli sur le nom),
  avec des types (lait entier, demi-écrémé…). L'appli (`src/web/browse.ts`)
  liste un rayon toutes marques confondues, trié au prix au litre / kilo /
  pièce du jour (promo en cours comprise, prix périmés exclus).
- **Contrôle qualité** (`scripts/lib/quality.ts`, à chaque `npm run catalog`) :
  un prix douteux n'est jamais publié. Écartés : format incohérent avec le
  prix au kilo/litre affiché par l'enseigne (> 6 %), ou prix au kilo/litre
  > 4 × la médiane de son type (≥ 6 produits ; jamais vers le bas). Rapport :
  `data/controle-qualite.json`.
- Delhaize : le « Contenu net » est par unité ; un lot (prix ÷ prix unitaire
  = N × contenu net) est enregistré comme N × contenu.
- Appli : `src/web/` (TypeScript, sans framework) → `npm run build:app` →
  `web/app/app.js` (commité ; la CI vérifie qu'il est à jour).
- Site statique `web/` (accueil, appli, confidentialité, robot).

## Conventions
- TypeScript strict, ESM, imports avec extension `.ts` (exécuté par tsx).
- Montants calculés en centimes entiers.
- Dates : ISO UTC en stockage ; affichage et validité des promos en
  Europe/Brussels.
- Tout changement de règle métier : test dans `test/` + mise à jour ici.
- Textes visibles en français de Belgique, ton simple et factuel.
