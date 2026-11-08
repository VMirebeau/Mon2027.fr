# Mon2027 — PWA + TWA

## Décision

Le player est livré comme **PWA** (Progressive Web App) et distribué sur **Android via TWA** (Trusted Web Activity), publié sur le Play Store. iOS : installation "Ajouter à l'écran d'accueil" depuis Safari (pas de store envisagé). Pas de rewrite natif (pas de React Native, pas de Capacitor) — le site `mon2027.fr` reste l'unique base de code, le TWA n'est qu'une coquille Chrome plein écran qui pointe dessus.

**Pourquoi TWA plutôt qu'app native ?**
- Une seule base de code
- Updates instantanés sans repasser par la review du store
- Backend Prisma/SQLite + auth déjà en place → on ne dupliquerait rien à passer en natif
- Push notifs supportées (Web Push API, fonctionne aussi en TWA)

## Fichiers en place

Tout vit dans `player/` (et le schéma partagé `prisma/schema.prisma`).

### Manifest & icônes
- `public/icon.svg` — **source canonique** du logo (squircle jaune + bulle crème + 3 barres dont la droite en coral). Toute modif visuelle commence ici, puis se répercute dans `src/components/brand-icon.tsx`.
- `src/components/brand-icon.tsx` — JSX SVG partagé (variantes `BrandIcon` padded et `BrandIconMaskable` full-bleed), consommé par les routes metadata via Satori.
- `src/app/manifest.ts` — manifest PWA (name, theme/background `#FAF8F3`, display `standalone`, scope `/`, 4 entrées d'icônes : SVG `any`, PNG 512 `any`, PNG 512 `maskable`, apple-icon 180)
- `src/app/icon.tsx` — PNG 512×512 padded (squircle visible) pour `<link rel="icon">` et purpose `any`
- `src/app/icon1.tsx` — PNG 512×512 full-bleed pour purpose `maskable` (le squircle padded serait coupé par le masque circulaire/squircle d'Android)
- `src/app/apple-icon.tsx` — PNG 180×180 (Apple ne supporte pas le SVG en apple-touch-icon)
- `src/app/opengraph-image.tsx` — OG 1200×630 avec l'icône en haut à gauche + wordmark + tagline

### Service worker
- `public/sw.js` — handlers `push` et `notificationclick` (pas de cache offline pour l'instant)
- `src/components/pwa-register.tsx` — enregistre le SW au mount client, `updateViaCache: 'none'` pour ne pas servir un vieux SW
- `next.config.ts` — headers `Cache-Control: no-cache, no-store, must-revalidate` sur `/sw.js`

### Push notifications
- `prisma/schema.prisma` — modèle `PushSubscription` (relation `User`, `endpoint` unique)
- `src/lib/push.ts` — `sendPushToUser(userId, payload)`, configure VAPID en lazy, purge auto les subs HTTP 404/410
- `src/app/api/push/subscribe/route.ts` — `POST` upsert par endpoint, requiert session
- `src/app/api/push/unsubscribe/route.ts` — `POST`, requiert session
- `src/components/push-toggle.tsx` — composant opt-in (gère permission, sub, unsub) à placer dans le compte

### Layout
- `src/app/layout.tsx` — `viewport.themeColor: "#FAF8F3"`, `<PwaRegister />` monté dans `<body>`

### Env
- `.env.example` — `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Dépendance ajoutée : `web-push` + `@types/web-push`

## Étapes restantes (TODO)

1. **Migrer la DB pour `PushSubscription`** — dev servers à l'arrêt :
   ```
   cd player
   npx prisma generate
   npx prisma migrate dev --name add_push_subscription
   ```

2. **Générer les clés VAPID** et remplir `player/.env` :
   ```
   cd player
   npx web-push generate-vapid-keys
   ```
   `Public Key` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `Private Key` → `VAPID_PRIVATE_KEY`, et `VAPID_SUBJECT="mailto:..."` (mail technique).

3. **Intégrer `<PushToggle />`** dans `account-modal.tsx` (section "Notifications" sous le pseudo).

4. **Tester** sur `localhost:2028` (SW autorisé en HTTP sur localhost) puis via un tunnel HTTPS (`ngrok http 2028`) pour valider sur un vrai téléphone Android.

## Envoyer un push depuis le serveur

```ts
import { sendPushToUser } from "@/lib/push";

await sendPushToUser(userId, {
  title: "Nouvelle question publiée",
  body: "Une nouvelle question vient de sortir, viens la tester.",
  url: "/",
  tag: "new-question", // empêche l'empilement de notifs identiques
});
```

Retourne `{ sent, pruned }` — `pruned` compte les subs purgées car révoquées côté navigateur (HTTP 404/410). Tout autre code d'erreur est juste loggé.

Cas d'usage envisagés :
- Nouvelle question publiée
- Rappels avant échéances 2027 (premier tour, second tour)
- Post-débat télé : "Vérifie les chiffres entendus hier soir"

## Publier sur le Play Store (TWA, plus tard)

Prérequis :
- Site déployé en HTTPS sur `mon2027.fr` (Vercel ou autre)
- Compte développeur Google Play (25 $ unique)

Workflow Bubblewrap :
```
npx @bubblewrap/cli init --manifest=https://mon2027.fr/manifest.webmanifest
npx @bubblewrap/cli build
```

Bubblewrap génère :
- Le projet Android (Gradle)
- L'AAB signé prêt à uploader
- La **clé SHA-256** de la signing key

Cette SHA-256 doit être ajoutée dans `/.well-known/assetlinks.json` servi par `mon2027.fr`, sinon Chrome refuse de cacher la barre d'URL et l'app ressemble à un browser. Format :
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "fr.mon2027.app",
    "sha256_cert_fingerprints": ["<SHA-256 fournie par Bubblewrap>"]
  }
}]
```

Une fois l'AAB uploadé sur Play Console et validé, les updates du site se propagent sans rebuild de l'app.

## Limites à connaître

- **iOS push** : Web Push fonctionne uniquement si la PWA est installée sur l'écran d'accueil (iOS 16.4+). Pas de push si l'utilisateur reste dans Safari.
- **Permission notif** : ne pas la demander à la première visite. `<PushToggle />` n'est interactif qu'à l'opt-in volontaire de l'utilisateur (typiquement après une 1ʳᵉ session de quiz).
- **Notifs silencieuses interdites** : chaque push doit afficher une notif visible (`userVisibleOnly: true`), sinon le navigateur révoque la permission.
