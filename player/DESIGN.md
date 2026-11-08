# Mon2027 — design system

Référentiel des contrôles visuels du player. Ne couvre pas la palette (palette = `--cream`, `--coral`, `--yellow`, `--teal`, `--ink…` dans `globals.css`), mais **comment combiner border / radius / ombre / hover** pour rester cohérent.

> Tout est dans `player/src/app/globals.css` : tokens `--pop-*` `--radius-*` `--t-*` et utilitaires `.pop-card` `.soft-card` `.pill` `.icon-btn`. **Aucun composant ne doit poser à la main une ombre offset, un radius, ou un hover** — on attache la classe et on laisse le CSS faire.

---

## 1 · Deux familles de surfaces

L'app a **deux** langages visuels et un seul critère pour choisir :

| Famille | Quand l'utiliser | Visuel | Hover |
|---|---|---|---|
| **`pop`** (neo-brutalist) | CTA principal de l'écran, hero card, card thématique colorée. **Max 1-2 par écran.** | bord ink 1.5 px + ombre offset 4 px ink | translate -2 / -2, ombre 6 px |
| **`soft`** | Tout le reste : rows de liste, ModeCard, search input, upcoming themes, defi secondary | bord rule-soft, fond cream-warm, pas d'ombre | bord → ink, lift -1 px |

**Règle simple** : si tu hésites, c'est `soft`. `pop` se gagne — c'est ce qui doit attirer l'œil.

### Exemples

- **Découvrir** : la tuile jaune « 5 questions mélangées » + les theme cards (Immigration, Sécurité, Économie) = `pop`. Les `upcoming` = `soft`.
- **Question du jour** : `DailyHero` variant `answer` = `pop`. Variant `review` = `soft`.
- **Réviser** : les question rows = `soft`. Pas de `pop` (la liste est l'objet).
- **Défier** : `ModeCard` favori / thème = `soft`. Le bouton `Défi Primary` jaune = `pop`. Les cards de défis envoyés = `soft`.

---

## 2 · Tokens

```css
/* Élévations */
--pop-shadow-sm: 3px 3px 0 var(--ink);   /* mobile compact */
--pop-shadow-md: 4px 4px 0 var(--ink);   /* défaut */
--pop-shadow-lg: 6px 6px 0 var(--ink);   /* desktop hero */

/* Rayons */
--radius-xs: 8px;      /* tag inline */
--radius-sm: 12px;     /* icon-button, input, badge interne ink */
--radius-md: 16px;     /* row, soft card */
--radius-lg: 20px;     /* hero, pop card */
--radius-xl: 28px;     /* hero desktop */
--radius-pill: 999px;  /* tabs, chips */

/* Transitions — toujours ces deux-là. Pas d'autres durées. */
--t-fast: 0.12s var(--ease-out);   /* feedback tactile : scale, opacity */
--t-base: 0.18s var(--ease-out);   /* transitions visuelles : transform, color, border */
```

### Palette de rayons : ne jamais sortir de cette liste

`8 / 12 / 16 / 20 / 28 / 999`. Si tu te retrouves à écrire `18` ou `14`, c'est qu'il y a un trou : utilise `16` ou `20`. Tabs et chips = toujours `pill` (999).

---

## 3 · Utilitaires CSS

### `.pop-card`

CTA hero / theme card / DailyHero answer.

```tsx
<button className="pop-card" style={{ background: "var(--yellow)", padding: "18px 20px" }}>
  …
</button>
```

Variantes :
- `.pop-card.pop-card--sm` → offset 3 px, radius `md` (mobile compact).
- `.pop-card.pop-card--lg` → offset 6 px, radius `xl` (desktop hero).

Le composant fournit **seulement** : `background`, `color`, `padding`, contenu. Pas de `border`, `borderRadius`, `boxShadow`, `transition` inline.

### `.soft-card` / `.soft-row`

`.soft-card` lift au hover (clickable cards). `.soft-row` ne lift pas (rows denses dans une liste).

```tsx
<button className="soft-card" style={{ padding: "18px 20px" }}>
  …
</button>

<div className="soft-row" style={{ padding: "14px 16px", borderLeft: "4px solid var(--coral)" }}>
  …
</div>
```

> `soft-row` accepte un border-left coloré (accent par catégorie : todo = coral, done = signal-good, all = rule). C'est le **seul** endroit où l'on dépasse le bord 1.5 px.

### `.pill`

Tabs (Réviser), chips de filtre (filter-bar). Toujours `borderRadius: pill`.

```tsx
<button className={`pill ${active ? "pill--active" : ""}`} style={{ padding: "8px 14px" }}>
  {label}
  <span style={{ color: active ? "var(--yellow)" : "var(--ink-mute)" }}>{count}</span>
</button>
```

L'état actif n'a pas de hover (il EST le contraste).

### `.icon-btn`

Étoile favori, retour, user menu, close. Carré, hover bg neutre, active scale.

```tsx
<button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="…">
  <svg…/>
</button>
```

Pour un état "rempli" (favori actif, menu ouvert) : ajouter `.icon-btn--on` ou poser `style={{ color: "var(--yellow-deep)" }}` — la couleur prime.

---

## 4 · Anti-patterns

À **bannir** dans les nouveaux composants :

```tsx
// ❌ ombre offset inline
boxShadow: "4px 4px 0 var(--ink)"
// ✅
className="pop-card"

// ❌ radius hors palette
borderRadius: 18
// ✅ — 16 ou 20
borderRadius: "var(--radius-md)"

// ❌ hover en JS handler
onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
// ✅ — classe CSS, hover géré
className="soft-card"

// ❌ transition custom
transition: "all 0.2s ease"
// ✅
transition: "var(--t-base)"  // ou laisser la classe poser la sienne
```

---

## 5 · Couleurs de thème — une seule source

`player/src/lib/theme-colors.ts` est la **source unique** pour la couleur de chaque thème (Immigration jaune, Sécurité coral, Climat vert, etc.). À utiliser via :

```tsx
import { themeColor } from "@/lib/theme-colors";

<div style={{ background: themeColor(q.theme) }} />        // card thème
<div style={{ boxShadow: `inset 4px 0 0 ${themeColor(q.theme)}` }} /> // accent row
```

**Ne jamais** poser une couleur de thème en dur dans un composant : si `Climat` passe de vert à bleu, on veut qu'il change PARTOUT. Avant cette migration, il y avait deux mappings divergents (`HOME_THEMES` côté serveur + `THEME_ACCENTS` côté client) — résultat : Climat tombait sur le fallback jaune au lieu de vert sur la page question. Si jamais tu as besoin d'une nouvelle clé (ex. surfeur, défis), ajoute-la dans `theme-colors.ts` et tous les composants l'ont automatiquement.

`format-shared.tsx > themeAccent` est un simple alias de `themeColor` pour compat — préférer `themeColor` dans les nouveaux composants.

---

## 6 · Cas particuliers documentés

- **`DailyHero` variant `review`** : `soft-row` (pas `soft-card`) car non-cliquable comme bloc (le CTA est interne).
- **`ScoreBadge` PersonScore** : `soft-row` même si non-interactif — donne la même densité visuelle que les rows de Réviser.
- **`UserMenu` dropdown** : exception, ombre standard `var(--shadow-card)` car c'est un panneau flottant (pas un CTA dans le flux).
- **`bottom-tab-bar`** : géré par sa propre CSS (animation indicator framer-motion), n'utilise pas `.pill`.

---

## 7 · Pour les futurs ajouts

Quand tu ajoutes un contrôle, demande-toi :

1. **C'est cliquable ?** Sinon, pas de classe ; juste un `style` avec `--rule-soft`.
2. **C'est le CTA principal de l'écran ?** Oui → `pop-card`. Non → `soft-*`.
3. **C'est dans une liste de filtres/tabs ?** → `pill`.
4. **C'est un bouton icône carré ?** → `icon-btn`.

Si rien ne correspond, ouvre une PR pour ajouter une nouvelle classe dans `globals.css`. **Ne pas multiplier les inline-styles** : la dette visuelle qu'on vient de payer.
