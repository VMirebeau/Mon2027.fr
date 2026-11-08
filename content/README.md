# Contenu éditorial

`questions.json` contient les **582 questions publiées** de
Mon2027 et leurs **1380 sources** (export du 2026-11-08). Il ne
contient que les tables `Question` et `Source` : aucune donnée de joueur ou
de contributeur. Les champs `auteur` et `valideurs` sont neutralisés.

## Charger dans une base locale

Après `npx prisma migrate deploy` (cf. README racine), depuis `admin/` :

```bash
DATABASE_URL="file:./dev.db" node ../scripts/content-sync.cjs replace ../content/questions.json          # aperçu
DATABASE_URL="file:./dev.db" node ../scripts/content-sync.cjs replace ../content/questions.json --apply  # écriture
```

`replace` remplace toutes les questions et sources de la base locale. Il
refuse de tourner si les migrations de la base diffèrent de la liste
`migrations` du fichier.

## Format

`{ "migrations": [...], "Question": [...], "Source": [...] }` : une entrée par
ligne de table, colonnes du schéma `prisma/schema.prisma`, dates en
millisecondes depuis 1970. `Source.questionId` renvoie à `Question.id`.
Structure du champ `payload` selon le format : `admin/prisma/FORMATS-SPEC.md`.

## Répartition

| Thème | Questions |
|---|---|
| Économie | 52 |
| Santé | 51 |
| Sécurité | 48 |
| École | 47 |
| Climat | 46 |
| Immigration | 46 |
| Numérique & IA | 46 |
| Institutions | 43 |
| Logement | 43 |
| Égalités | 43 |
| Travail | 41 |
| Services publics | 39 |
| International | 37 |

| Format | Questions |
|---|---|
| `vrai_faux` | 160 |
| `estimation_numerique` | 130 |
| `ab` | 76 |
| `qcm` | 54 |
| `curseur_multi` | 44 |
| `vraifaux_multi` | 41 |
| `classement` | 30 |
| `categorisation` | 24 |
| `pondere` | 23 |

## Licence

Comme le reste du dépôt : [AGPL-3.0](../LICENSE).
