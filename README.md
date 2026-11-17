# Panier Malin

Comparateur de panier de supermarchés belges : **« le panier le moins cher
près de chez vous, magasin par magasin, en français »**.

*Nom de travail, modifiable.* État : **version d'essai** — appli web
fonctionnelle, Aldi et Delhaize comparés, prix relevés chaque nuit.

## Démarrer

```bash
npm install
npm run check                 # typecheck + tests
npm run build                 # catalogue + appli
npm run web                   # site + appli sur http://localhost:4173 (appli : /app/)
```

## Données

```bash
npm run collect -- aldi                        # tout Aldi (~3 000 pages, ~1 h 40)
npm run collect -- delhaize --shard 0/2        # une moitié de Delhaize (~2 h 40)
npm run collect -- aldi --explore              # robots.txt + aperçu des sitemaps
npm run stores                                 # magasins (OpenStreetMap) — via GitHub Actions
npm run postcodes                              # codes postaux (GeoNames) — via GitHub Actions
npm run catalog                                # assemble web/app/data/catalog.json
```

Dans ce conteneur cloud, Node a besoin de `NODE_USE_ENV_PROXY=1` pour
passer par le proxy. Sur GitHub Actions, rien à faire.

Automatisation (onglet **Actions**) :
- **Collecte des prix** : chaque nuit, Aldi + une moitié de Delhaize, puis
  reconstruction de l'appli.
- **Données de référence** : magasins et codes postaux, chaque mois.

## Couverture réelle (17/11/2026)

| Enseigne | État |
|---|---|
| Aldi | ✅ assortiment complet, promotions comprises |
| Delhaize | ✅ alimentation (~9 600 produits), prix habituels |
| Colruyt | ⛔ page anti-robot → exclu |
| Carrefour | ⛔ défi Cloudflare → exclu |
| Albert Heijn | ⛔ HTTP 403 → exclu |
| Lidl | ⏳ pas de prix habituels en ligne ; promotions plus tard |

## Organisation

| Chemin | Rôle |
|---|---|
| `src/web/` | Appli : catalogue, recherche, liste, comparaison (`plan.ts`), interface (`app.ts`). |
| `scripts/` | Construction du catalogue, des magasins, des codes postaux ; archive juridique. |
| `src/core/` | Métier pur, sans réseau : types, formats et prix unitaires, règles de fraîcheur, calcul du panier, correspondance produits, distance. |
| `src/collect/` | Collecte polie : robots.txt, client HTTP qui s'arrête au premier blocage, sitemaps, JSON-LD, stockage. |
| `config/chains.json` | Enseignes : couverture affichée (`full` / `promos` / `none`), portée des prix (`national` / `store` / `format`), config de collecte. |
| `config/legal-urls.json` | Pages archivées pour le dossier juridique. |
| `data/latest/` | Derniers prix par enseigne (versionnés : git = historique des prix). |
| `legal/archives/` | Copies datées des robots.txt et conditions. |
| `web/` | Page d'attente statique, confidentialité, page du robot. |
| `docs/` | Dossier avocat, feuille de route, mise en ligne de la page. |

## Règles non négociables

Voir [`CLAUDE.md`](CLAUDE.md).
