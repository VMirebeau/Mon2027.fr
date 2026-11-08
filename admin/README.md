# Mon2027 — Admin

Espace contributeurs de Mon2027 : élaboration collective des questions (comptes individuels, historique, validations, discussion, propositions des joueurs). Déployé en prod sous `mon2027.fr/admin` ; la base de prod fait référence pour le contenu (cf. [DEPLOY.md](../DEPLOY.md)).

> Pour la vision projet, voir le [README racine](../README.md).

## Lancer en local

Prérequis : Node 22 LTS (via [fnm](https://github.com/Schniz/fnm) ou installeur direct).

```powershell
# Une fois pour toutes : profil PowerShell qui charge fnm automatiquement
Add-Content $PROFILE 'fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression'

# Au démarrage d'un nouveau terminal
fnm use 22
cd admin
npm install
npx prisma migrate deploy        # applique le schéma à dev.db
# Contenu : questions publiées de content/questions.json
$env:DATABASE_URL="file:./dev.db"; node ../scripts/content-sync.cjs replace ../content/questions.json --apply
# Premier compte (local) — seul moyen de créer un superadmin :
$env:DATABASE_URL="file:./dev.db"; node ../scripts/contributor.cjs create <login> superadmin "Ton nom"
npm run dev                      # http://localhost:2027 — connexion avec le mot de passe provisoire affiché
```

En prod, même chose via `python deploy.py contributor create <login> superadmin "Nom"`. Les autres comptes se créent ensuite depuis la page **Contributeurs** (réservée au superadmin).

## Rôles et règles

| Rôle | Peut |
|---|---|
| Contributeur | créer et améliorer les questions non publiées, discuter, traiter les propositions des joueurs |
| Relecteur | + valider une version, publier, retirer, modifier une question publiée |
| Admin | + supprimer une question non publiée |
| Superadmin | tout : publication directe sans validation, suppression même d'une question publiée, **seul à gérer les comptes** ; ne se crée qu'en ligne de commande |

- **Publication** : une validation suffit, par un relecteur autre que l'auteur de la dernière modification du contenu. Toute modification ultérieure du contenu rend la validation caduque (empreinte du contenu, cf. `src/lib/content-hash.ts`). Le superadmin peut publier sans validation.
- **Circuit** : « Demander une relecture » fait passer un brouillon « En revue » ; la file « À valider » (`/?vue=a-valider`, compteur dans la barre pour les relecteurs) liste les questions en revue sans validation qui compte ; un relecteur autorisé publie d'un geste avec « Valider et publier ». Le code et l'adresse courte (slug) d'une question publiée sont figés, sauf pour le superadmin ; l'export JSON est réservé aux admins.
- **Historique** : chaque enregistrement crée une révision (qui, quand, quels champs, avant/après), visible sur la page de la question.
- **Prévisualiser** : joue la question telle qu'elle est dans le formulaire, même non enregistrée, avec l'interface réelle du player, dans un nouvel onglet (`/apercu/<jeton>` côté player, valable deux heures, jamais indexé). L'aperçu ne compte ni dans les statistiques ni dans la progression. En local, `PLAYER_URL` (cf. `.env.example`) indique où tourne le player ; en production, rien à régler.
- **Modifications simultanées** : si quelqu'un a enregistré la question pendant que tu l'éditais, ton enregistrement est refusé au lieu d'écraser son travail.
- **Sécurité** : chaque page et chaque server action vérifie la session (`requireContributor`) — ne jamais s'appuyer sur `proxy.ts`, que Next 16.2.6 ne charge pas en build standalone. Sessions en cookie httpOnly limité à `/admin`, jeton haché en base, 7 jours ; mots de passe scrypt.

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Dev server sur port **2027** (port choisi pour éviter les conflits avec d'autres apps) |
| `npm run build` | Build production |
| `npm run start` | Production sur port 2027 |
| `npm run typecheck` | `tsc --noEmit` — vérification de types |
| `npm test` | Vitest run (tests unitaires) |
| `npm run test:watch` | Vitest en mode watch |
| `npx prisma studio` | Interface graphique Prisma sur la base SQLite locale |
| `npx prisma migrate dev --name <nom>` | Nouvelle migration interactive |
| `node ../scripts/content-sync.cjs replace ../content/questions.json --apply` | Remplace les questions locales par celles de `content/` (avec `DATABASE_URL`) |

## Stack

- **Next.js 16** App Router (Turbopack en dev). Lire les docs locales dans `node_modules/next/dist/docs/` avant d'écrire du code Next — APIs récentes (params/searchParams = Promise, server actions).
- **Prisma 6.19.3** + SQLite. Volontairement *pas* Prisma 7 (trop immature sur SQLite et nouvelle config datasource).
- **shadcn/ui (Base UI)** — pas Radix. Donc pas de `asChild` ; utiliser `buttonVariants({...})` sur Link/anchor, et toujours `<Select>` contrôlé (`value` + `onValueChange`).
- **Tailwind 4** avec syntaxe `@theme` inline.
- **Vitest 3.x** (`vitest.config.mts` en ESM) + **@testing-library/react** + **jsdom**.
- **zod** pour validation des FormData côté server actions.

## Structure des sources

```
admin/
├── prisma/
│   ├── schema.prisma         # source de vérité du modèle de données
│   ├── migrations/           # migrations versionnées
│   ├── seed.ts               # questions de seed initial (Q-IMM-001, Q-SEC-002)
│   └── dev.db                # base SQLite locale (gitignore)
├── src/
│   ├── app/
│   │   ├── page.tsx          # liste avec filtres/tri + bouton « Réviser ces N »
│   │   ├── api/export/route.ts  # endpoint JSON pour l'app joueur future
│   │   ├── questions/
│   │   │   ├── new/page.tsx     # création
│   │   │   ├── [id]/page.tsx    # édition (avec mode revue si search params actifs)
│   │   │   └── _components/
│   │   │       ├── QuestionForm.tsx       # formulaire complet, sticky bar
│   │   │       ├── PayloadEditor.tsx      # UI dédiée par format (V/F, A/B, QCM, classement)
│   │   │       ├── SourcesEditor.tsx      # liste dynamique de sources
│   │   │       ├── DirtyProvider.tsx      # contexte + modal de confirmation au navigation
│   │   │       ├── GuardedLink.tsx        # Link guarded par le dirty state
│   │   │       └── DeleteQuestionButton.tsx
│   │   └── _components/FilterSelect.tsx   # select de filtre côté client
│   └── lib/
│       ├── db.ts             # singleton Prisma
│       ├── schema.ts         # zod schemas
│       ├── actions.ts        # server actions CRUD
│       ├── constants.ts      # THEMES, FORMATS, STATUTS, SENSIBILITES
│       └── queries.ts        # helpers de filtre/tri partagés liste & édition
└── README.md             # ce fichier
```

## Modèle de données

Une **Question** a quatre champs textuels distincts dont les rôles sont **non interchangeables** :

| Champ | Rôle |
|---|---|
| `question` | Phrase punchy, lisible en 5 secondes par un non-expert. **Zéro jargon, zéro parenthèse-définition.** |
| `precisions` | Clarifications affichées *sous* la question si nécessaire (unité, période, périmètre). Très court. Optionnel. |
| `explication` | Affichée **après** la réponse — méthodo, valeurs exactes, nuances, limites. C'est le moment pédagogique. |
| `contextePedagogique` | Pourquoi cette question importe (perception/biais médiatique). Optionnel. |

Test de simplicité de la question : « Mon oncle boulanger qui écoute RTL peut-il comprendre la question sans dictionnaire et tenter une réponse en 5 secondes ? » Si non, réécrire.

**Formats** (nom vu par les joueurs, puis valeur technique) : Estimation (`estimation_numerique`, le format-signature), Vrai ou faux (`vrai_faux`), A ou B (`ab`), QCM (`qcm`), Remettre dans l'ordre (`classement`), Plusieurs vrai/faux (`vraifaux_multi`), Placer sur une échelle (`curseur_multi`), Classer dans des catégories (`categorisation`), Répartir des points (`pondere`). Structure détaillée : `prisma/FORMATS-SPEC.md`.

**Statuts** : `brouillon` → `revue` → `publie` (→ `retire`). Voir « Rôles et règles » plus haut pour qui peut faire quoi.

**Sensibilités** : `standard`, `haute`, `critique`. L'outil exige une validation par un relecteur pour toutes (choix du 2026-11-07). Pour `critique`, la consigne éditoriale est de solliciter plusieurs relectures (discussion de la question) avant de valider.

## Workflow éditorial

**Hybride IA-drafts-puis-humain-valide** :

1. Claude (ou autre IA) propose des brouillons à partir d'un thème, avec sources candidates
2. **L'humain clique chaque URL**, ouvre le PDF si besoin, valide la valeur exacte, reformule
3. Les questions `sensibilite=critique` gagnent à être relues par plusieurs personnes avant validation, dont une de sensibilité politique différente (ex : un relecteur d'EELV pour la question nucléaire/CO2) — consigne éditoriale, l'outil n'exige qu'une validation
4. Errata public visible sur la page « Méthode »

**Hiérarchie des sources autorisées** :

1. INSEE, Eurostat, OCDE, DREES, SSMSI, France Stratégie, Banque de France
2. Cour des comptes, IGAS, IGF, Conseil d'analyse économique
3. Peer-reviewed (CEPII, OFCE, CNRS)
4. Organismes internationaux (ONU, GIEC, FMI, BIT)

**Interdits comme source primaire** : think tanks (Jean Jaurès, Montaigne, Terra Nova, IFRAP, Concorde), articles de presse, Wikipédia, ONG en source unique sur leur sujet de plaidoyer.

## Notes Windows / PowerShell

- Le harness PowerShell ne charge **pas** automatiquement le profil → toujours préfixer `fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression; fnm use 22` dans les scripts d'agent.
- Pour les migrations Prisma qui détectent une perte de données : passer en `--create-only`, éditer manuellement le SQL (ex: `ALTER TABLE ... RENAME COLUMN ...`), puis `npx prisma migrate deploy`.
