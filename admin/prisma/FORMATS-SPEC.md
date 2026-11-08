# Mon2027 — Spec des formats de question

Document de référence pour les développeurs et les agents qui rédigent
des questions. Tenu à jour quand on ajoute / modifie un format.

État au **2026-05-17** — **les 9 formats** listés ci-dessous sont **jouables**
côté player (mobile + desktop) et éditables côté admin.

## Table de synthèse

| # | `format` DB | Player type | Joueur | Admin UI | Saisie | Score |
|---|---|---|---|---|---|---|
| 1 | `estimation_numerique` | `estimation` | ✅ | Champs dédiés | Curseur sur une plage | Distance à la vérité, seuils vert/orange |
| 2 | `vrai_faux` | `vraifaux` | ✅ | Payload | Tap V / F | Binaire 0/1 |
| 3 | `ab` | `ab` | ✅ | Payload | Tap A / B (+ barre comparative si `valeurs`) | Binaire 0/1 |
| 4 | `qcm` | `qcm` | ✅ | Payload | Tap parmi N choix (2-6) | Binaire 0/1 |
| 5 | `classement` | `classement` | ✅ | Payload (éditeur dédié, `_components/payload/`) | Drag-and-drop d'items à ordonner | Nombre d'items en position correcte / N |
| 6 | `vraifaux_multi` | `vraifaux_multi` | ✅ | Payload (éditeur dédié, `_components/payload/`) | V/F par affirmation (4-6 affirmations) | Nombre correctement classées / N |
| 7 | `curseur_multi` | `curseur_multi` | ✅ | Payload (éditeur dédié, `_components/payload/`) | Drag de N pastilles vers une ligne graduée | Distance moyenne par item, agrégée |
| 8 | `categorisation` | `categorisation` | ✅ | Payload (éditeur dédié, `_components/payload/`) | Drag d'étiquettes vers des cases | Nombre correctement classées / N |
| 9 | `pondere` | `pondere` | ✅ | Payload (éditeur dédié, `_components/payload/`) | Sliders qui répartissent N points entre catégories | Somme des écarts absolus / 2×total |

> **Convention** : le nom DB (`format`) est en français snake_case ; le nom
> côté player (`Question["format"]`) est plus court (pas de `_numerique`,
> pas de `vrai_`). Le mapping est dans `player/src/lib/content.ts` →
> `mapToPlayer`. Toujours utiliser la valeur DB côté admin/seed et la
> valeur player côté composants.

---

## 1. `estimation_numerique` — Format signature

Le joueur place un curseur sur une plage continue. C'est le format
privilégié par défaut, et celui dans lequel on convertit tous les
V/F ou A/B dont la réponse binaire serait évidente.

### Champs DB (colonnes dédiées, PAS dans `payload`)

| Champ | Type | Rôle |
|---|---|---|
| `unite` | `String?` | Affichée à droite du chiffre. Ex: `"%"`, `"€/mois"`, `"jours"`, `"personnes"` |
| `plageMin` | `Float` | Borne basse du curseur |
| `plageMax` | `Float` | Borne haute du curseur |
| `reponseNumerique` | `Float` | La bonne réponse |
| `toleranceVerte` | `Float?` | Écart pour être "très proche" (✓) |
| `toleranceOrange` | `Float?` | Écart pour être "proche" (≈) |
| `payload` | `null` | **Toujours `null`** pour ce format |

### Rendu player

`question-estimation.tsx` (mobile) / `question-estimation-dt.tsx` (desktop).
Slider tactile avec graduation. Au reveal, le slider disparaît : axe avec
3 marqueurs (Toi / Réalité / Moyenne joueurs).

### Choix éditoriaux

- `plageMin` / `plageMax` doivent encadrer la réponse mais laisser de la
  place pour se tromper dans les deux sens. Une plage trop serrée trahit
  la réponse.
- `toleranceVerte` ≈ 10-15 % de la plage ; `toleranceOrange` ≈ 30-40 %.
- `unite` court : `"%"`, `"M€"`, pas `"millions d'euros"`.

---

## 2. `vrai_faux` — Affirmation binaire

Une seule affirmation à valider. **À utiliser avec parcimonie** : si la
réponse est devinable d'avance, transformer en `estimation_numerique`.

### Payload JSON

```json
{ "reponseCorrecte": true }
```

### Rendu player

`question-vraifaux.tsx`. Deux gros boutons V / F. Au reveal, badge vert
ou rouge + explication.

---

## 3. `ab` — Choix entre deux options

Le joueur choisit entre A et B. Au reveal, barre comparative si on a
fourni `valeurs` + `unite`.

### Payload JSON

```json
{
  "choix": ["Plus que l'Allemagne", "Moins que l'Allemagne"],
  "indexCorrect": 1,
  "valeurs": [97, 47],
  "unite": "€/hab/an"
}
```

- `choix` : tuple de 2 strings
- `indexCorrect` : `0` ou `1`
- `valeurs` : tuple `[number, number]`, **optionnel**. Si fourni, le
  reveal affiche une barre comparative.
- `unite` : string, **optionnel**. Affichée derrière les valeurs.

### Rendu player

`question-ab.tsx`. Deux cartes côte-à-côte. Au reveal, badge sur la bonne
option, barre comparative si `valeurs`.

---

## 4. `qcm` — Choix multiple parmi N

Le joueur lit la question et choisit une réponse parmi 2-6 options.
Format complémentaire d'`ab` quand il y a plus de deux candidats
plausibles ; complémentaire d'`estimation_numerique` quand on veut tester
la précision sur un ordre de grandeur (le curseur serait trop tolérant).

### Payload JSON

```json
{
  "choix": ["Moins de 10 %", "Environ 25 %", "Environ 50 %", "Plus de 80 %"],
  "indexCorrect": 2
}
```

- `choix` : 2-6 strings
- `indexCorrect` : entier entre 0 et `choix.length - 1`

### Rendu player

`question-qcm.tsx` (mobile + desktop unifié). Liste verticale d'options
A / B / C / D. Au reveal : couleur verte sur la bonne réponse, badge
✓ ou ✗ sur la sélection du joueur, indicateur "bonne rép." sur la
correcte si elle n'a pas été choisie.

### Choix éditoriaux

- **Distracteurs plausibles** : si trois options sur quatre sont
  manifestement absurdes, c'est un V/F déguisé. Chaque distracteur doit
  correspondre à une erreur commune crédible.
- **Ordre randomisable** : non implémenté pour l'instant, l'ordre du
  payload est l'ordre affiché. Si besoin, mélanger au runtime côté
  `mapToPlayer`.
- Préférer `curseur_multi` pour les comparaisons sur une même échelle
  numérique (mieux que QCM "Quel pays dépense le plus pour X ?").

---

## 5. `classement` — Ordonner N items

Le joueur reçoit les items mélangés et doit les remettre dans le bon
ordre par drag-and-drop.

### Payload JSON

```json
{
  "items": [
    { "id": "education", "label": "Éducation nationale", "figure": "78 Md€" },
    { "id": "dette",     "label": "Charge de la dette",  "figure": "52 Md€" },
    { "id": "defense",   "label": "Défense",             "figure": "50 Md€" },
    { "id": "recherche", "label": "Recherche",           "figure": "30 Md€" },
    { "id": "justice",   "label": "Justice",             "figure": "12 Md€" }
  ]
}
```

**Convention critique** : `items` est stocké dans **l'ordre correct**. Le
player shuffle au runtime. Le champ `ordreCorrect` historique (cf seed
ancien) est **ignoré** par `mapToPlayer` : ne pas l'écrire.

Chaque item :
- `id` : string stable (utilisé pour le drag-key)
- `label` : string affiché
- `figure` : string optionnelle (chiffre / annotation affiché en petit
  sous le label, ex. `"78 Md€"`)

Plage : **3-6 items**. Au-delà, le drag devient pénible et le score
chute trop vite.

### Rendu player

`question-classement.tsx`. Liste verticale avec poignées de drag (@dnd-kit).
Au reveal, badge ✓ ou ✗ par position + ordre correct affiché si erreur.

### Score

`scoreClassement(userOrder, correctOrder)` = nombre d'items en position
correcte. Affiché en chip "N / total correctes".

---

## 6. `vraifaux_multi` — Batch d'affirmations à classer V/F

Une question présente 4-6 affirmations, chacune doit être marquée V ou F.

### Payload JSON

```json
{
  "affirmations": [
    {
      "id": "s1",
      "texte": "La France accueille plus de réfugiés que l'Allemagne.",
      "vrai": false,
      "why": "L'Allemagne accueille ~2,5 M de réfugiés (UNHCR 2024), la France ~580 000."
    },
    {
      "id": "s2",
      "texte": "73 % des réfugiés sont accueillis dans des pays pauvres.",
      "vrai": true,
      "why": "Selon le HCR, 73 % des personnes déplacées vivent dans des pays à faible revenu."
    }
  ]
}
```

Chaque affirmation :
- `id` : string stable
- `texte` : la phrase (rester courte, idéalement < 100 caractères)
- `vrai` : boolean — la bonne réponse
- `why` : string optionnelle — explication par affirmation (dépliable au
  reveal via bouton "Pourquoi ?")

**Contraintes** :
- 4-6 affirmations.
- Au moins une `vrai: true` et une `vrai: false` (sinon trivial).
- L'`explication` globale de la question peut faire la synthèse, mais le
  vrai détail va dans le `why` de chaque affirmation.

### Rendu player

`question-vraifaux-multi.tsx`. Pour chaque affirmation, ligne avec
texte + pilule V/F. Au reveal : couleur de fond verte si réponse user
correcte, rouge sinon ; bouton "Pourquoi ?" qui déplie le `why`.

### Score

Nombre d'affirmations correctement classées sur N. Chip `N / total correctes`.

---

## 7. `curseur_multi` — Placer N items sur une échelle

Plusieurs items à positionner sur une même ligne graduée (échelle unique).

### Payload JSON

```json
{
  "echelle": { "min": 0, "max": 50, "unite": "" },
  "labelMin": "Plus égalitaire",
  "labelMax": "Plus inégalitaire",
  "items": [
    { "id": "dk", "label": "Danemark", "valeur": 27 },
    { "id": "fr", "label": "France",   "valeur": 32 },
    { "id": "us", "label": "USA",      "valeur": 41 }
  ]
}
```

- `echelle.min` / `echelle.max` : bornes numériques de l'axe (Number)
- `echelle.unite` : string optionnelle (`""`, `"%"`, `"€"`, etc.)
- `labelMin` / `labelMax` : optionnels, affichés aux deux extrémités
  pour donner le sens de l'échelle
- `items` : 3-5 items, chacun avec `id`, `label`, `valeur` (position
  correcte sur l'échelle)

### Rendu player

`question-curseur-multi.tsx`. Bac à pastilles en haut ; le joueur drague
chaque pastille sur l'axe. Au reveal : pastilles user + marqueurs réels
sur l'axe + écart affiché.

**Mécaniques drag** (complexes, cf composant) :
- Drag depuis le bac = pastille flottante sous le pointeur jusqu'au relâcher
- Drag depuis l'axe = la pastille suit le pointeur en X (réordonnable)
- Drop vertical à hauteur de l'axe = placement ; drop ailleurs = retour bac
- Couleurs stables par item (palette dérivée de l'index dans `items`)

### Score

Pour chaque item, distance `|placé - réel| / span`. Agrégée en moyenne,
seuils vert/orange/rouge.

---

## 8. `categorisation` — Étiquettes vers catégories

N étiquettes à glisser dans M catégories. Plus simple cognitivement que
le `classement` (pas d'ordre), idéal pour des oui/non multiples.

### Payload JSON

```json
{
  "categories": [
    { "id": "yes", "label": "Possède des médias" },
    { "id": "no",  "label": "N'en possède pas" }
  ],
  "etiquettes": [
    {
      "id": "arnault",
      "texte": "Bernard Arnault",
      "categorie": 0,
      "note": "Les Échos, Le Parisien (LVMH)"
    },
    {
      "id": "pinault",
      "texte": "François Pinault",
      "categorie": 1,
      "note": "Désengagé du Point en 2022"
    }
  ]
}
```

- `categories` : 2-4 cases. Chaque case `{id, label}`.
- `etiquettes` : 4-8 cartes. Chaque carte :
  - `id` : string stable
  - `texte` : libellé court (nom propre, expression)
  - `categorie` : **index** dans `categories` (0, 1, 2…) = la bonne case
  - `note` : string optionnelle, affichée au reveal en détail

**Contraintes** :
- Au moins 1 étiquette par catégorie (sinon catégorie morte).
- Si 2 catégories : viser ~équilibré (pas 7 vs 1).

### Rendu player

`question-categorisation.tsx`. Drag-and-drop @dnd-kit/core mobile ET
desktop. Étiquettes en haut, cases en dessous. Au reveal, badge couleur
par étiquette + note dépliable.

### Score

Nombre d'étiquettes correctement placées sur N.

---

## 9. `pondere` — Distribuer N points

Le joueur distribue 100 points (ou autre `total`) entre 3-5 catégories,
via sliders. Contrainte : la somme ne peut pas dépasser le pool. Si on
arrête avant 100, le score est calculé sur la répartition actuelle.

### Payload JSON

```json
{
  "total": 100,
  "step": 5,
  "parts": [
    { "id": "tva",    "label": "TVA",                  "valeur": 45 },
    { "id": "ir",     "label": "Impôt sur le revenu",  "valeur": 25 },
    { "id": "is",     "label": "Impôt sur les sociétés", "valeur": 15 },
    { "id": "autres", "label": "Autres taxes",         "valeur": 15 }
  ]
}
```

- `total` : le pool de points à distribuer (Number, par défaut 100)
- `step` : granularité des sliders (Number, par défaut 5)
- `parts` : 3-5 catégories. Chacune :
  - `id` : string stable
  - `label` : libellé (peut être long)
  - `valeur` : la vraie répartition (Number, somme des `valeur` == `total`)
  - `color` : string optionnelle (sinon palette auto par index)

**Contrainte stricte** : `Σ valeur === total`. À vérifier dans le rapport
de batch.

### Rendu player

`question-pondere.tsx`. Pour chaque catégorie, un slider qui ne peut
dépasser `total - somme des autres`. Banner d'état "X / 100 distribués"
qui devient vert ✓ quand tout est alloué. Au reveal : écart par
catégorie affiché.

### Score

`scorePondere(userAlloc, correctAlloc, total)` = `1 - L1distance / (2*total)`.
0 = parfait, 1 = totalement inversé. Seuils vert/orange/rouge classiques.

---

## Conventions de nommage scènes (player)

Pour chaque format, une scène dans `SceneId` (`player/src/lib/types.ts`)
sert d'entry-point dans le mode `?dev=1` :

| `SceneId` | Format |
|---|---|
| `q-estim` | estimation |
| `q-tf` | vraifaux |
| `q-ab` | ab |
| `q-qcm` | qcm |
| `q-classement` | classement |
| `q-vftf-multi` | vraifaux_multi |
| `q-curseur-multi` | curseur_multi |
| `q-cat` | categorisation |
| `q-pondere` | pondere |

---

## Pattern d'implémentation pour un nouveau format

(Liste exhaustive — à respecter si l'on ajoute un 10e format.)

1. **`player/src/lib/types.ts`** : nouveau type `XxxQuestion` + ajout
   dans l'union `Question`.
2. **`player/src/lib/content.ts`** : branche `if (q.format === "xxx")`
   dans `mapToPlayer`.
3. **`player/src/lib/correctness.ts`** : `isCorrect(q, answer)` et
   `formatUserAnswer(q, answer)`.
4. **`admin/src/lib/constants.ts`** : ajout dans `FORMATS`.
5. **`admin/src/lib/schema.ts`** : ajout dans `z.enum([...])` et
   éventuel `superRefine` pour valider le payload.
6. **`admin/src/app/questions/_components/payload/`** : éditeur dédié
   (conversion JSON ↔ formulaire en fonctions pures, testées sur des
   payloads réels), branché dans `PayloadEditor.tsx`. Pas de saisie JSON
   pour les contributeurs.
7. **`player/src/components/formats/question-xxx.tsx`** : composant
   joueur unifié mobile + desktop (préférer ce pattern depuis les
   nouveaux formats, plutôt que mobile + desktop séparés).
8. **`player/src/components/question-runner.tsx`** et
   **`question-runner-dt.tsx`** : ajout d'une branche.
9. **`player/src/components/screens/reveal.tsx`** et
   **`reveal-dt.tsx`** : ajout d'une branche pour le contenu du dossier.
10. **`player/src/components/scene-nav.tsx`** : ajout du sample dans la
    section "Nouveaux formats composite".
11. **`SceneId`** dans `types.ts` + branche dans `app-shell.tsx`
    (`sceneToSoloQuestion`).
12. **Une question `Q-TST-00N`** (créée dans l'admin) qui sert
    d'échantillon dev.

---

## Règles éditoriales par format (rappel)

- **`estimation_numerique`** : c'est le format par défaut. Préfère-le
  dès qu'un chiffre précis est intéressant.
- **`vrai_faux`** / **`ab`** : à éviter si la réponse est devinable. Si
  c'est vraiment contre-intuitif (ex: « il y a moins d'homicides
  aujourd'hui qu'en 2000 »), ça passe — sinon, convertir en estimation.
- **`classement`** / **`pondere`** : excellents pour révéler la
  hiérarchie réelle d'un sujet vs la hiérarchie médiatique (ex: causes
  de mortalité, recettes fiscales).
- **`vraifaux_multi`** : idéal pour démonter un faisceau d'idées reçues
  liées (immigration, médias, sécurité…).
- **`curseur_multi`** : excellent pour les comparaisons internationales
  ou inter-secteurs sur une même échelle (Gini, RAC, dépenses publiques).
- **`categorisation`** : pour les questions "qui est qui" (milliardaires
  / médias possédés, taxes / qui les paie, mesures / quel quinquennat).
