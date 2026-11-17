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
- **Collecte planifiée désactivée** (`collect.yml`) tant que l'avocat n'a
  pas donné son feu vert écrit.
- **RGPD** : pas de cookie ni de traceur sur le site ; aucune donnée
  individuelle d'achat vendue, jamais.
- Ne jamais commiter `.env` ni de clé API.

## Conventions
- TypeScript strict, ESM, imports avec extension `.ts` (exécuté par tsx).
- Montants calculés en centimes entiers.
- Dates : ISO UTC en stockage ; affichage et validité des promos en
  Europe/Brussels.
- Tout changement de règle métier : test dans `test/` + mise à jour ici.
- Textes visibles en français de Belgique, ton simple et factuel.
