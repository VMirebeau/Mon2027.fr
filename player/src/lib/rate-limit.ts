import "server-only";

/// Rate limiter in-memory à fenêtre glissante.
///
/// Vise les abus simples (brute-force MDP, bourrage de statistiques par bot)
/// sur un déploiement single-node. Pour du multi-instance il faudra passer
/// sur Redis / Upstash — l'API publique ne changera pas.
///
/// La fenêtre est implémentée par compteur + ts : si la fenêtre est expirée,
/// on remet count=1 ; sinon on incrémente. Pas de sliding window précis, mais
/// le compromis effort/efficacité est bon pour notre usage.
///
/// Le store est un `Map`, donc sa mémoire grandit avec le nombre de clés
/// actives. On purge périodiquement les entrées expirées via un compteur
/// d'opérations (toutes les 1000 invocations).
///
/// La clé est libre — convention : `${endpoint}:ip:${ip}`, `${endpoint}:user:${id}`…

const MIN = 60_000;

/// Politique de limitation, centralisée ici pour rester lisible d'un coup
/// d'œil. Deux principes :
///
/// 1. **Une IP n'est pas une personne.** Un local militant, un lycée, une box
///    familiale ou un opérateur mobile (CGNAT) placent des dizaines de
///    personnes derrière la même adresse. Les plafonds par IP sont donc
///    dimensionnés pour une salle d'une trentaine de joueurs actifs en même
///    temps, pas pour un individu.
/// 2. **Quand une identité vérifiée existe, on limite d'abord par identité**
///    (session utilisateur, cookie défi signé HMAC, pseudo ciblé au login).
///    L'IP reste un filet large contre le bourrage. On ne peut pas se passer
///    de l'IP : un attaquant peut toujours jeter son cookie ou en recréer un,
///    alors qu'il ne change pas d'IP aussi facilement.
///
/// Les réponses anonymes (`answers`) restent limitées par IP seule : les
/// rattacher à une session casserait la promesse d'anonymat d'Answer.
export const LIMITS = {
  /// Anti brute-force : borne les essais sur UN compte, quelle que soit la
  /// provenance (≈ 1 400 essais/jour max). Pire cas de blocage d'un compte
  /// visé par un tiers : 10 minutes.
  loginPerPseudo: { limit: 10, windowMs: 10 * MIN },
  loginPerIp: { limit: 60, windowMs: MIN },
  signupPerIp: { limit: 30, windowMs: 60 * MIN },
  answersPerIp: { limit: 300, windowMs: MIN },
  statsPerIp: { limit: 600, windowMs: MIN },
  communityPerIp: { limit: 240, windowMs: MIN },
  defiCreatePerIp: { limit: 30, windowMs: MIN },
  defiReadPerIp: { limit: 120, windowMs: MIN },
  defiRespondPerIp: { limit: 60, windowMs: MIN },
  defiDeletePerIp: { limit: 30, windowMs: MIN },
  /// Pages /d/… (invitation, résultats) : anti-énumération des codes.
  defiPagesPerIp: { limit: 120, windowMs: MIN },
  /// Propositions envoyées aux contributeurs : une salle entière peut en
  /// envoyer, un robot non (+ champ piège côté route).
  suggestionPerIp: { limit: 30, windowMs: 60 * MIN },
  /// Lectures « mes défis » (liste, pastille non-lus en polling, impact) :
  /// serrées par identité, large par IP.
  defiMinePerIdentity: { limit: 60, windowMs: MIN },
  defiUnseenPerIdentity: { limit: 120, windowMs: MIN },
  defiImpactPerIdentity: { limit: 60, windowMs: MIN },
  defiReadsPerIp: { limit: 600, windowMs: MIN },
  defiPlayedPerUser: { limit: 60, windowMs: MIN },
  meDeletePerUser: { limit: 5, windowMs: 60 * MIN },
  sessionsRevokePerUser: { limit: 5, windowMs: 60 * MIN },
  snapshotPerUser: { limit: 30, windowMs: MIN },
  pushSubscribePerUser: { limit: 20, windowMs: 60 * MIN },
  /// Dossiers du catalogue (un chargement par visite de l'accueil, souvent
  /// résolu en 304) : large, une salle partage la même IP.
  dossiersPerIp: { limit: 240, windowMs: MIN },
  /// Images d'aperçu générées à la volée (Satori + resvg, coûteux en CPU).
  ogImagesPerIp: { limit: 120, windowMs: MIN },
} as const satisfies Record<string, { limit: number; windowMs: number }>;

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();
let opsSinceLastSweep = 0;

function sweep(now: number) {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/// Tente d'enregistrer une "hit" pour la clé. Retourne `ok: false` si la
/// limite est dépassée pour la fenêtre courante.
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  opsSinceLastSweep++;
  if (opsSinceLastSweep > 1000) {
    sweep(now);
    opsSinceLastSweep = 0;
  }

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const entry: Entry = { count: 1, resetAt: now + opts.windowMs };
    store.set(key, entry);
    return { ok: true, remaining: opts.limit - 1, resetAt: entry.resetAt };
  }

  existing.count++;
  return {
    ok: existing.count <= opts.limit,
    remaining: Math.max(0, opts.limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/// Extrait l'IP du client réel à partir des headers, *de manière sûre*.
///
/// `x-forwarded-for` n'est PAS lisible aveuglément : n'importe quel client
/// peut le forger, donc lire la première IP revient à laisser le rate-limit
/// trivialement bypassable. La valeur n'est fiable que si on est derrière
/// un reverse-proxy de confiance qui *ajoute* sa pierre à la chaîne.
///
/// Comportement piloté par TRUST_PROXY :
///   - "cloudflare" : lit `cf-connecting-ip` (Cloudflare l'écrit toujours,
///     un client direct ne peut pas le poser car CF strip les headers du
///     même nom en entrée).
///   - "xff-last"   : prend la *dernière* IP de la chaîne XFF (celle que
///     notre proxy de confiance vient d'ajouter), pas la première qui est
///     la valeur fournie par le client.
///   - "none" / vide : aucune confiance dans les headers ; on retourne
///     "unknown" pour TOUS les clients. Effet : le rate-limit devient
///     global plutôt que par IP, ce qui est moins fin mais reste un
///     filet de sécurité contre les bourrages depuis une seule machine.
///
/// En dev local, mettre TRUST_PROXY="none" est OK ; les rate-limits
/// gêneront un peu mais c'est l'effet voulu.
export function getClientIp(headers: Headers): string {
  const mode = process.env.TRUST_PROXY ?? "none";
  if (mode === "cloudflare") {
    const cf = headers.get("cf-connecting-ip");
    if (cf) return cf.trim();
    return "unknown";
  }
  if (mode === "xff-last") {
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last;
    }
    return "unknown";
  }
  return "unknown";
}

/// Helper : retourne une Response 429 standard si rate-limit dépassé.
export function tooManyRequests(reset: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      error: { code: "rate_limited", message: "Trop de tentatives. Réessaie dans un instant." },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
