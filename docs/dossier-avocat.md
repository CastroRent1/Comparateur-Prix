# Dossier pour l'avocat (étape 0)

À envoyer **avant** le premier rendez-vous avec un avocat belge spécialisé en
propriété intellectuelle (droit des bases de données) et en protection des
données. But : obtenir un feu vert écrit sur le périmètre « faits seulement,
pages publiques » avant toute collecte régulière.

> Pour trouver un avocat : l'annuaire d'[avocats.be](https://avocats.be)
> (Ordre des barreaux francophones et germanophone) permet de chercher par
> matière (« droit intellectuel », « protection des données »). Demandez un
> devis forfaitaire pour une consultation écrite sur les questions ci-dessous.

## 1. Le projet en une page

- **Quoi** : une appli gratuite (web puis mobile) qui indique, pour une liste
  de courses, quel supermarché proche est le moins cher, avec le prix du
  magasin réellement fréquenté. Francophone d'abord (Bruxelles, Wallonie).
- **Qui paie** : personne au départ. Plus tard : options premium de confort
  (alertes, historique) et sponsors clairement signalés. Aucune enseigne ne
  paie pour son classement.
- **Données collectées** (faits uniquement) : nom du produit, marque, format,
  prix, prix au kilo, promotion et dates de validité, code-barres EAN, URL de
  la page source, date et heure du relevé.
- **Données NON collectées** : photos, textes descriptifs, avis clients,
  toute donnée derrière une connexion à un compte.
- **Enseignes visées en phase 1** : Aldi (prix national), puis Colruyt
  (quelques magasins de référence), Delhaize, Carrefour (un format de
  référence), Albert Heijn. Lidl : promotions seulement.
- **Volume** : de l'ordre de 5 000 à 20 000 fiches par enseigne, relevées au
  plus une fois par jour, la nuit.

## 2. Comment le robot collecte (mesures techniques)

Voir `src/collect/http.ts` et la page publique `web/robot.html`.

1. Pages publiques uniquement, sans connexion.
2. robots.txt respecté (Disallow, Crawl-delay). robots.txt injoignable →
   collecte abandonnée.
3. User-agent identifié (`PanierMalinBot`) avec un lien vers une page de
   contact.
4. Une requête à la fois, au moins 2 secondes entre deux requêtes.
5. Aucun contournement : pas de proxys tournants, pas de rotation
   d'identité, pas de résolution de captcha. Arrêt automatique après trois
   refus consécutifs.
6. Archive hebdomadaire datée (empreinte SHA-256) des robots.txt et
   conditions d'utilisation des enseignes (`legal/archives/`).

## 3. Questions précises

### A. Droit sui generis des bases de données (CDE, livre XI)

1. Une collecte quotidienne de **l'ensemble des prix** d'une enseigne
   constitue-t-elle une extraction « substantielle », ou une extraction
   « répétée et systématique » de parties non substantielles ?
2. L'argument tiré de *BHB c. William Hill* (C-203/02 : l'investissement pour
   **créer** des données — ici, fixer ses prix — ne compte pas) est-il
   solide pour un catalogue de prix de supermarché ? Quelle part de
   l'investissement d'une enseigne serait retenue (vérification,
   présentation du site) ?
3. Après *CV-Online* (C-762/19), notre usage porte-t-il atteinte à la
   capacité de l'enseigne à amortir son investissement, alors que nous
   renvoyons vers ses magasins ?
4. Afficher les prix par **ligne de liste** (quelques produits à la fois)
   plutôt que de republier le catalogue réduit-il le risque ?
5. L'exception de fouille de textes et de données (directive 2019/790,
   art. 4) s'applique-t-elle, et comment a-t-elle été transposée en Belgique ?
   Un opt-out dans robots.txt ou dans les conditions l'écarte-t-il ?

### B. Contrat (conditions d'utilisation)

6. Si une enseigne interdit la collecte automatisée dans ses conditions
   (*Ryanair c. PR Aviation*, C-30/14), ces conditions nous lient-elles
   alors que le robot n'a jamais rien accepté (simple navigation, pas de
   compte) ?
7. Les conditions Colruyt Group consultées datent de 2019 et reprennent le
   droit des bases de données sans interdire la collecte : est-ce suffisant
   pour considérer le risque contractuel comme modéré ? (Version actuelle à
   vérifier dans `legal/archives/`.)

### C. Contournement et concurrence déloyale

8. Chez Colruyt, la collecte à grande échelle passe ailleurs par un
   navigateur automatisé qui recycle des sessions pour échapper aux
   blocages. Où passe la limite entre « navigation automatisée » et
   « contournement d'une mesure technique » ? Notre politique (arrêt au
   premier blocage) suffit-elle ?
9. Que faire en cas de mise en demeure : arrêt immédiat pour l'enseigne
   concernée ? Quelle réponse type ?

### D. Droit de la consommation (comparateur)

10. Quelles mentions sont obligatoires sur l'appli : critères de
    classement, mode de financement, part du marché couverte, date des prix
    (directive Omnibus 2019/2161, CDE livre VI) ?
11. Nos libellés suffisent-ils : « Prix relevé sur colruyt.be le 16/11 à
    8 h, magasin de référence : Anderlecht », « Lidl : promotions
    seulement », « Le prix en magasin et sur le site de l'enseigne fait
    foi » ?
12. Comparer un magasin de référence Colruyt à un Carrefour Market présente-t-il
    un risque au regard de *Carrefour c. ITM* (C-562/21, comparaison de
    magasins de tailles différentes) ?
13. Les noms et logos des enseignes : peut-on afficher les noms (oui a
    priori) ? Et les logos (marques) ?

### E. RGPD

14. Liste d'attente : la politique de confidentialité (`web/confidentialite.html`)
    est-elle suffisante ? Faut-il un registre des traitements dès ce stade ?
15. Plus tard : localisation de l'utilisateur, historique de listes, scan
    facultatif de tickets. Quelles précautions (analyse d'impact, données
    sensibles déductibles — halal, diabète, alcool — cf. C-184/20) ?

### F. Structure

16. Faut-il créer une société (SRL) avant le lancement public pour limiter
    la responsabilité personnelle ? À quel moment ?
17. Vendre plus tard des statistiques agrégées et anonymes à des marques ou
    médias : quelles limites au regard du droit de la concurrence (échange
    d'informations entre concurrents) ?

## 4. Pièces à joindre

- Ce document.
- `web/robot.html` et `web/confidentialite.html` (versions imprimées).
- Le dernier dossier `legal/archives/AAAA-MM-JJ/` (robots.txt, conditions,
  MANIFEST.json).
- Un exemple de fichier de prix (`data/latest/aldi.json`, quelques lignes).
- Le rapport de recherche initial (comparateurs belges et étrangers, risques).

## 5. Ce qu'on attend en retour

Un avis écrit, enseigne par enseigne si nécessaire, classant chaque pratique
en : autorisé / autorisé sous conditions (lesquelles) / à éviter. Les
critères d'arrêt du projet en dépendent (`docs/feuille-de-route.md`).

*Ce dossier prépare une consultation ; il ne constitue pas un avis juridique.*
