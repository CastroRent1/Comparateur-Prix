# Feuille de route

Principe : coûts fixes proches de zéro, critères d'arrêt fixés d'avance.
Checkjebon a survécu là où des modèles plus ambitieux ont fait faillite.

## État au 17/11/2026

Décision du porteur de projet : **l'appli d'abord**, l'avocat ensuite si
nécessaire. L'étape 1 (prototype web) est donc faite avant la fin de
l'étape 0 :

- ✅ Appli web : recherche, liste, équivalents entre enseignes, magasins
  proches, classement, libellés de fraîcheur, comparaison honnête des
  paniers incomplets.
- ✅ Collecte nocturne Aldi + Delhaize (GitHub Actions).
- ⛔ Colruyt, Carrefour, Albert Heijn bloquent les robots : exclus. Pistes
  licites : leur demander l'accès (partenariat, flux de prix), ou attendre
  une obligation légale de publication (modèle croate).
- ☐ Rendez-vous avocat (dossier prêt) — recommandé avant toute
  communication publique large.

## Étape 0 — Vérifications (4 à 6 semaines)

| Tâche | Qui | État |
|---|---|---|
| Socle technique : modèle de données, règles de fraîcheur, calcul du panier, correspondance produits, client HTTP poli, collecteur générique sitemap + JSON-LD | Claude | ✅ fait (tests verts) |
| Page d'attente FR + confidentialité + page robot | Claude | ✅ fait |
| Dossier pour l'avocat | Claude | ✅ fait (`docs/dossier-avocat.md`) |
| Workflow d'archivage hebdomadaire des robots.txt / conditions | Claude | ✅ fait (à lancer une première fois) |
| Réserver le nom de domaine (ex. paniermalin.be) | Vous | ☐ |
| Compléter les `À COMPLÉTER` de `web/confidentialite.html` et `web/robot.html` | Vous | ☐ |
| Créer un compte d'e-mailing UE (ex. Brevo) et brancher le formulaire (`docs/page-attente.md`) | Vous | ☐ |
| Mettre la page en ligne (Cloudflare Pages, gratuit) | Vous + Claude | ☐ |
| Vérifier à la main les URL des conditions d'utilisation des 6 enseignes, les ajouter à `config/legal-urls.json` | Vous | ☐ |
| Rendez-vous avocat (envoyer le dossier avant) | Vous | ☐ |
| Calibrer le collecteur Aldi (`npm run collect -- aldi --explore` via GitHub Actions) | Claude | ☐ |
| Faire connaître la page : groupes Facebook de bons plans à Bruxelles et en Wallonie, r/brussels, r/belgium, bouche-à-oreille | Vous | ☐ |

**Pour passer à l'étape 1** : feu vert juridique écrit sur le périmètre
« faits seulement, pages publiques » **et** quelques centaines d'inscriptions
(objectif indicatif : 300).

## Étape 1 — Prototype web (2 à 3 mois)

- Collecteurs : Aldi (prix national) → Colruyt (2-3 magasins de référence
  par zone) → Delhaize → AH BE → Carrefour (format Market).
- Lidl : promotions seulement (site ou dépliant), ou licence API PrijsProfeet.
- Annuaire des magasins (coordonnées, référence de prix).
- Interface : liste de courses, total par magasin, distance, libellé « relevé
  le », avertissement, mention claire des enseignes « promos seulement ».
- IA : uniquement pour les correspondances produit douteuses (`needsReview`).
- Activer la collecte nocturne (`.github/workflows/collect.yml`).

**Mesures** : taux de correspondance produit correct (échantillon vérifié à la
main), utilisateurs qui reviennent chaque semaine.

## Étape 2 — Applis mobiles et extension (3 à 6 mois)

iOS/Android, promos Intermarché/Spar/Jumbo, OKay et Bio-Planet, plus de
magasins Colruyt de référence, version néerlandaise, indice mensuel des prix
publié pour la presse.

## Étape 3 — Monétisation (après ~10 000 utilisateurs actifs)

Premium annuel (alertes, historique, optimisation multi-magasins, listes
illimitées) + sponsors signalés. Le cœur reste gratuit, pas de paywall au
téléchargement. Seuil : conversion ≥ 1,5 %, revenus qui couvrent les coûts.

## Critères d'arrêt (fixés dès maintenant)

1. L'avocat juge le périmètre trop risqué.
2. Une enseigne majeure bloque ou met en demeure, sans solution licite.
3. Six mois après le lancement mobile, la fidélité et la conversion restent
   nettement sous les seuils ci-dessus.
