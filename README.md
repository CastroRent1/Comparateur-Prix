# Panier Malin

Comparateur de panier de supermarchés belges : **« le panier le moins cher
près de chez vous, magasin par magasin, en français »**.

*Nom de travail, modifiable.* État : **étape 0** (vérifications juridiques +
page d'attente + socle technique). Voir [`docs/feuille-de-route.md`](docs/feuille-de-route.md).

## Démarrer

```bash
npm install
npm run check     # typecheck + tests
npm run demo      # calcul de panier sur données FICTIVES
npm run web       # page d'attente sur http://localhost:4173
```

## Collecte (manuelle tant que l'avocat n'a pas validé)

```bash
npm run collect -- aldi --explore           # robots.txt + aperçu des sitemaps
npm run collect -- aldi --max-pages 200     # relevé → data/latest/aldi.json
npm run archive-legal                       # archive robots.txt / conditions → legal/archives/
```

Ou depuis GitHub : **Actions → Collecte des prix → Run workflow**.

## Organisation

| Chemin | Rôle |
|---|---|
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
