# Mettre la page d'attente en ligne

La page (`web/`) est 100 % statique : aucun serveur, aucun cookie.

## 1. Brancher les inscriptions (Brevo, hébergé dans l'UE, gratuit au départ)

1. Créez un compte sur brevo.com.
2. **Contacts → Paramètres → Attributs** : ajoutez deux attributs texte,
   `CODE_POSTAL` et `MAGASINS`.
3. **Contacts → Formulaires → Créer un formulaire d'inscription** :
   - champs : EMAIL, CODE_POSTAL, MAGASINS ;
   - activez le **double opt-in** (confirmation par e-mail) ;
   - langue : français.
4. À l'étape « Partager », copiez l'URL d'action du formulaire (elle
   ressemble à `https://xxxx.sibforms.com/serve/MUIF...`).
5. Collez-la dans `web/index.html`, attribut `data-endpoint` du formulaire
   `#waitlist`. Tant qu'il est vide, rien n'est envoyé.
6. Testez avec votre propre adresse et vérifiez que le contact apparaît
   dans Brevo avec son code postal.

Les noms de champs du formulaire (`EMAIL`, `CODE_POSTAL`, `MAGASINS`,
`OPT_IN`) correspondent à ces attributs. Si vous choisissez un autre outil,
adaptez les attributs `name` des champs.

## 2. Héberger gratuitement (Cloudflare Pages)

GitHub Pages n'est gratuit que pour les dépôts publics ; Cloudflare Pages
l'est aussi pour un dépôt privé.

1. dash.cloudflare.com → Workers & Pages → Créer → Pages → Connecter à Git.
2. Choisissez le dépôt, branche `main`.
3. Commande de build : *(vide)*. Répertoire de sortie : `web`.
4. Ajoutez votre domaine (paniermalin.be) dans « Domaines personnalisés ».

## 3. Avant de partager le lien

- [ ] `À COMPLÉTER` remplis dans `confidentialite.html` et `robot.html`.
- [ ] Formulaire testé de bout en bout (double opt-in reçu).
- [ ] Page vérifiée sur téléphone.
