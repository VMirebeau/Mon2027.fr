# Déploiement Mon2027

Tout passe par `python deploy.py <commande>` depuis la racine du repo (ou
`python deploy.py` pour le menu interactif).

## Architecture

- **Serveur** : VPS sous Docker, joint en SSH par l'alias `mon-serveur`
  (variable `MON2027_SSH_HOST` de `deploy.py`). Dossier `/opt/docker/mon2027`.
- **Deux conteneurs** derrière le nginx partagé `prod_nginx` (TLS Let's
  Encrypt, renouvelé par `prod_certbot`), config `nginx-mon2027-full.conf` :
  - `prod_mon2027_player` : l'app publique, sur `mon2027.fr/` ;
  - `prod_mon2027_admin` : l'espace contributeurs, sur `mon2027.fr/admin`
    (comptes individuels, cf. [admin/README.md](admin/README.md)).
- **Base** : SQLite `/data/prod.db` dans le volume Docker `mon2027_db`,
  partagée par les deux. Sauvegardes dans `/data/backups`.
- **La prod fait référence pour le contenu** : les contributeurs y
  travaillent. Tu peux aussi préparer du contenu en local (batchs, admin sur
  <http://localhost:2027>) et l'envoyer par fusion avec `content`.

## Cas courants

| Je veux… | Commande |
| --- | --- |
| Récupérer le contenu de prod en local | `python deploy.py pull` |
| Envoyer mon contenu local (batchs…) en prod | `python deploy.py content` |
| Déployer le code | `python deploy.py player` / `python deploy.py admin` |
| Créer ou gérer un compte contributeur | page **Contributeurs** (superadmin), ou `python deploy.py contributor …` |
| Changer le schéma Prisma | voir [Changement de schéma](#changement-de-schéma) |
| Sauvegarder la prod sur mon poste | `python deploy.py backup` |
| Changer une variable d'environnement | éditer `player/.env` ou `admin/.env`, puis `python deploy.py env` |
| Voir les logs / l'état | `python deploy.py logs` / `python deploy.py status` |

## Travailler le contenu en local puis l'envoyer

Cycle recommandé : **`pull` → batchs / modifications locales → `content`**.

`python deploy.py pull` remplace les tables Question et Source de
`prisma/dev.db` par celles de la prod (sauvegarde locale avant ; tes comptes
et réponses de test locaux restent).

`python deploy.py content` fusionne, question par question (clé :
`customId`) :

| Situation | Résultat |
| --- | --- |
| Question absente en prod | créée, avec son statut local |
| Identique | rien |
| Prod inchangée depuis ton dernier `pull`/`content` | mise à jour (statut local compris) |
| Modifiée en prod seulement | prod conservée — fais un `pull` |
| Modifiée en prod **et** chez toi | **conflit** : ignorée et listée |
| Présente en prod seulement | conservée : `content` ne supprime jamais rien |

Les empreintes de « dernier état connu » sont dans `prisma/content-base.json`
(local, gitignoré). Sans ce fichier (premier envoi), une question n'est mise
à jour que si aucun contributeur ne l'a encore touchée en prod.

Avant d'écrire : aperçu détaillé, confirmation `OUI`, sauvegarde de
`prod.db` (`/data/backups/prod-avant-contenu-*.db`, 10 gardées). L'écriture
est une transaction unique : en cas d'erreur, rien ne change. Chaque question
envoyée reçoit une révision « Import local » dans son historique, et une
modification de contenu rend ses validations caduques. Les joueurs (User,
Answer, Defi…) et le travail collectif (historique, validations, discussion)
ne sont jamais touchés.

> Pour retirer une question déjà jouée, passe-la en statut `retire` plutôt
> que de la supprimer : les réponses et défis référencent son `customId`.

## Changement de schéma

1. En local, depuis `player/` (la CLI Prisma ne lit pas `.env` ici, d'où la
   variable passée en ligne ; le chemin est relatif à `prisma/schema.prisma`) :
   `DATABASE_URL="file:./dev.db" npx prisma migrate dev --name <nom>`
   (PowerShell : `$env:DATABASE_URL="file:./dev.db"; npx prisma migrate dev --name <nom>`).
2. `python deploy.py player` puis `python deploy.py admin`.
3. `python deploy.py migrate` (sauvegarde, puis applique la migration).

`content` et `pull` refusent de tourner tant que les migrations diffèrent
entre local et prod.

## Sauvegardes

- `python deploy.py backup` : copie cohérente de la prod, prise à chaud sans
  couper le site, rapatriée dans `backups/` en local. Ce dossier est
  gitignoré : il contient des données joueurs et contributeurs (pseudos,
  hashs de mots de passe), à ne jamais partager.
- `content` et `migrate` sauvegardent automatiquement avant d'écrire.
- `python deploy.py backup-cron` (une fois) : installe sur le serveur une
  sauvegarde quotidienne à 3 h 30 (`/var/backups/mon2027`, 14 jours, copie à
  chaud + contrôle d'intégrité, journal dans `/var/log/mon2027-backup.log`).
  Ces copies restent sur le même serveur : continue à rapatrier de temps en
  temps une copie avec `backup`.

### Restaurer

```bash
ssh mon-serveur
cd /opt/docker/mon2027
sudo docker run --rm -v mon2027_db:/data alpine ls -1 /data/backups
sudo docker compose stop mon2027-player mon2027-admin
sudo docker run --rm -v mon2027_db:/data alpine sh -c \
  'cp /data/backups/<fichier>.db /data/prod.db && rm -f /data/prod.db-journal /data/prod.db-wal /data/prod.db-shm && chown 1001:1001 /data/prod.db'
sudo docker compose start mon2027-player mon2027-admin
```

## Variables d'environnement

`python deploy.py env` envoie `player/.env` et `admin/.env` et les adapte à
la prod à l'arrivée.

| Variable | Rôle | En prod |
| --- | --- | --- |
| `DATABASE_URL` | Base SQLite | forcée à `file:/data/prod.db` |
| `NODE_ENV` | | forcée à `production` |
| `TRUST_PROXY` | Lecture de l'IP client (limites de requêtes) | forcée à `xff-last` (nginx ajoute l'IP en fin de `X-Forwarded-For`) |
| `NEXT_BASE_PATH` | Préfixe de l'admin | forcée à `/admin` (admin) |
| `DEFI_SIGN_SECRET` | Signe le cookie qui relie un navigateur à ses défis | depuis `player/.env` |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications Web Push | depuis `player/.env` |
| `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Inlinées **au build** | depuis `.env.deploy` (`python deploy.py compose`) |

Sans `TRUST_PROXY`, toutes les limites de requêtes seraient partagées par
l'ensemble des visiteurs. Les limites sont définies dans
`player/src/lib/rate-limit.ts` (`LIMITS`), dimensionnées pour une salle d'une
trentaine de personnes derrière la même IP ; elles sont en mémoire (remises à
zéro à chaque redémarrage).

## Mise en service de l'espace contributeurs (une seule fois)

Dans cet ordre :

1. `python deploy.py nginx` — ajoute `location /admin`. La conf résout les
   conteneurs à chaque requête : elle se charge même si l'admin n'existe pas
   encore.
2. `python deploy.py env` — envoie `admin/.env` adapté (et retire les
   anciennes variables `ADMIN_USER`/`ADMIN_PASSWORD`).
3. `python deploy.py all` — compose + images player et admin.
4. `python deploy.py migrate` — marque la migration de rattrapage comme
   appliquée (tables `User`/`Session` déjà présentes) puis crée les tables de
   l'espace contributeurs, après sauvegarde.
5. `python deploy.py contributor create <login> superadmin "Ton nom"` — note le
   mot de passe provisoire, connecte-toi sur `mon2027.fr/admin`, change-le.
6. `python deploy.py content` — premier envoi : établit la base de synchro
   (`prisma/content-base.json`) et envoie ton contenu local s'il est en avance.
7. Ménage facultatif : `ssh mon-serveur "sudo rm -f /opt/docker/nginx/conf.d/.htpasswd-mon2027"`
   (ancien Basic-Auth, plus utilisé).

## Premier déploiement sur un serveur neuf

```bash
python deploy.py init    # dossiers, sources, images, volume, schéma, contenu
python deploy.py nginx   # vhost mon2027.fr
python deploy.py cert    # certificat Let's Encrypt (DNS déjà pointé)
python deploy.py contributor create <login> superadmin "<nom>"
```

## Vérifications après déploiement

`deploy.py player` et `deploy.py admin` vérifient déjà que le site répond.
Pour aller plus loin :

1. `https://mon2027.fr/` répond 200 avec les en-têtes de sécurité (`curl -I`).
2. `https://mon2027.fr/api/me` répond `{"user":null}`.
3. `https://mon2027.fr/admin` redirige vers `/admin/login`.
4. La question du jour s'affiche sur l'accueil.
5. Un lien `/q/[slug]` et un défi `/d/[code]` s'ouvrent en navigation privée.

## Historique

- **2026-11-07 — incident 502.** nginx figeait l'IP du conteneur player au
  chargement de sa conf ; un player recréé changeait d'IP → 502 sur tout le
  site jusqu'à un reload manuel. Corrigé : résolution à chaque requête
  (`resolver 127.0.0.11`) et `deploy.py` recharge nginx puis vérifie le site
  après chaque déploiement.
- **2026-11-07 — admin hydraté.** La CSP de l'admin bloquait les scripts
  inline de Next : en prod, aucune page de l'admin n'était interactive
  (formulaires en mode dégradé). Corrigé dans `admin/next.config.ts`.
- **2026-11-07 — migrations.** Les tables `User`, `Session`, `UserSnapshot`
  et deux colonnes de `Defi` n'existaient dans aucune migration (créées par
  `db push`) : une base neuve n'avait pas de comptes joueurs. Corrigé par la
  migration `20261107210000_rattrapage_comptes_joueurs`.
