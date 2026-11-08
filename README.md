# Mon2027

Application civique pour préparer l'élection présidentielle de 2027 en France.
Elle pose des questions sur le monde social (immigration, sécurité, économie,
climat, santé, école…), révèle la réponse avec ses sources publiques (INSEE,
Eurostat, OCDE…) et montre l'écart entre ce que l'on croit et ce que disent les
données.

Instance publique : [mon2027.fr](https://mon2027.fr).

## Fonctionnalités

- **9 formats de questions** : estimation sur un curseur, vrai ou faux, A ou B,
  QCM, remise dans l'ordre, plusieurs vrai/faux, placement sur une échelle,
  classement dans des catégories, répartition de points.
- **Révélation sourcée** après chaque réponse : explication, mise en
  perspective dans le temps et l'espace, sources primaires.
- **Défis entre proches** par lien court, **portrait** par indicateurs
  transverses, badges et niveaux.
- **Comptes facultatifs et sans e-mail** (pseudo et mot de passe). Sans compte,
  la progression reste sur l'appareil.
- **PWA** installable, notifications Web Push.
- **Espace contributeurs** (`/admin`) : comptes individuels, rôles, validation
  par un relecteur, historique des versions, discussion, propositions des
  joueurs.

## Principes éditoriaux

- **Sources** : institutions publiques indépendantes (INSEE, Eurostat, OCDE,
  DREES, SSMSI, Cour des comptes, GIEC…) et travaux à comité de lecture. Pas de
  think tank, de parti, d'article de presse ni de Wikipédia comme source
  primaire.
- **Relecture** : une question n'est publiée qu'après validation par un
  relecteur autre que l'auteur de la dernière modification. Pour les questions
  sensibles, plusieurs relectures sont recommandées.
- **Ni consigne de vote, ni publicité, ni traceur tiers.**

Détails : [admin/README.md](admin/README.md) (rôles, workflow, sources) et
[admin/prisma/FORMATS-SPEC.md](admin/prisma/FORMATS-SPEC.md) (structure de
chaque format).

## Structure du dépôt

```
├── prisma/            # schéma Prisma partagé + migrations (SQLite)
├── player/            # app publique : Next.js, mobile-first, PWA
├── admin/             # espace contributeurs : Next.js (servi sous /admin)
├── content/           # questions publiées et leurs sources (JSON)
├── scripts/           # scripts Node hors Next : synchro de contenu,
│                      #   comptes contributeurs, sauvegardes
├── deploy.py          # déploiement et opérations serveur (cf. DEPLOY.md)
└── docker-compose.yml, Dockerfile.*, nginx-mon2027*.conf
```

## Lancer en local

Prérequis : Node 22, npm, Python 3 (pour `deploy.py` seulement).

```bash
# 1. Dépendances de chaque app (le dépôt n'est pas un workspace npm)
(cd player && npm install)
(cd admin  && npm install)

# 2. Client Prisma : à refaire après chaque modification de
#    prisma/schema.prisma ou réinstallation de node_modules
(cd player && npx prisma generate)
(cd admin  && npx prisma generate)

# 3. Fichiers d'environnement (gitignorés)
cp player/.env.example player/.env
cp admin/.env.example  admin/.env

# 4. Base de dev : prisma.config.ts désactive la lecture de .env par la CLI
#    Prisma, d'où DATABASE_URL en ligne (chemin relatif à prisma/schema.prisma)
(cd player && DATABASE_URL="file:./dev.db" npx prisma migrate deploy)

# 5. Contenu : charge les questions publiées de content/questions.json
(cd admin && DATABASE_URL="file:./dev.db" node ../scripts/content-sync.cjs replace ../content/questions.json --apply)

# 6. Premier compte contributeur (seul moyen de créer un superadmin)
(cd admin && DATABASE_URL="file:./dev.db" node ../scripts/contributor.cjs create <login> superadmin "Ton nom")

# 7. Lancer chaque app depuis son dossier
(cd player && npm run dev)   # https://localhost:2028 (certificat auto-signé ; npm run dev:http pour du HTTP)
(cd admin  && npm run dev)   # http://localhost:2027
```

Sous PowerShell, remplacer `DATABASE_URL="file:./dev.db" commande` par
`$env:DATABASE_URL="file:./dev.db"; commande`.

### Pièges connus

- **Windows et bindings natifs manquants** (`lightningcss.win32-x64-msvc.node`,
  `@tailwindcss/oxide`…) : vérifier `~/.npmrc`. Une ligne `os=windows` y filtre
  toutes les dépendances optionnelles natives (npm attend `win32`). La
  supprimer, puis `rm -rf node_modules package-lock.json && npm install`.
- **Avertissement « multiple lockfiles »** : normal. La racine garde son propre
  `package-lock.json` pour `prisma generate`, et `outputFileTracingRoot` est
  épinglé dans les deux `next.config.ts`.
- **Accès au serveur de dev depuis le réseau local** (tablette, téléphone) :
  ajouter l'adresse IP dans `allowedDevOrigins` de `player/next.config.ts`.

## Tests

Dans `player/` comme dans `admin/` :

```bash
npm run typecheck && npm run lint && npm test
```

La CI GitHub (`.github/workflows/ci.yml`) rejoue ces vérifications et contrôle
que les migrations décrivent bien `prisma/schema.prisma`.

## Héberger sa propre instance

- **Déploiement** : [DEPLOY.md](DEPLOY.md). `deploy.py` vise un VPS sous Docker
  derrière un nginx partagé ; l'alias SSH et l'e-mail Let's Encrypt se règlent
  avec les variables `MON2027_SSH_HOST` et `MON2027_CERT_EMAIL`, le domaine et
  les noms de conteneurs en tête du fichier.
- **À personnaliser** : l'adresse de contact (`player/src/lib/contact.ts`), la
  page « À propos » (`player/src/components/screens/apropos.tsx` et
  `player/src/components/desktop/apropos-dt.tsx`), le domaine
  (`NEXT_PUBLIC_BASE_URL`, configurations nginx).

## Contribuer

Les signalements d'erreur (chiffre faux, source périmée, formulation biaisée)
et les propositions de code sont bienvenus, par issue ou pull request. Pour le
contenu, merci de citer une source primaire.

## Licence

Copyright (C) 2026 Vivien Mirebeau.

Ce dépôt, code et contenu (`content/`), est distribué sous licence
[GNU Affero General Public License v3.0](LICENSE). En résumé : vous pouvez
l'utiliser, le modifier et le redistribuer ; si vous mettez en ligne une
version modifiée, vous devez en publier le code source sous la même licence.
