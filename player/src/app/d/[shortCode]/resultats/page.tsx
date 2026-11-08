import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadDefi } from "@/lib/defi-loader";
import { computeIdentityTag } from "@/lib/defi-identity-server";
import { getDefiClientId } from "@/lib/defi-client-cookie";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { pageRateLimitOk } from "@/lib/page-rate-limit";
import { DefiResultsClient, type SerializableDefi } from "./defi-results-client";

function relativeAgo(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "moins d'1 heure";
  if (hours < 24) return `${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} jour${days > 1 ? "s" : ""}`;
}

export const dynamic = "force-dynamic";

/// Résultats : affichent les prénoms des amis qui ont joué → jamais indexés.
/// Canonical propre (sinon hérité de « / ») ; titre sans suffixe (ajouté par
/// le modèle du layout).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}): Promise<Metadata> {
  const { shortCode } = await params;
  return {
    title: "Résultats d'un défi",
    description: "Comparez vos réponses et lancez la conversation.",
    alternates: { canonical: `/d/${shortCode}/resultats` },
    robots: { index: false, follow: false },
  };
}

export default async function DefiResultsPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  if (!(await pageRateLimitOk("defi-results"))) notFound();
  const defi = await loadDefi(shortCode);
  if (!defi) {
    notFound();
  }

  // Sérialise le LoadedDefi en payload JSON-safe pour le client component
  // (les Date doivent passer en ISO string). On calcule aussi un label
  // relatif "il y a X jours" côté serveur, pour ne pas appeler Date.now()
  // dans le render client (impur). page.tsx est un Server Component
  // (async function), exécuté une fois par requête — la règle de pureté
  // ne s'applique pas, mais le linter ne fait pas la distinction.
  // eslint-disable-next-line react-hooks/purity
  const sentAgoLabel = relativeAgo(Date.now() - defi.createdAt.getTime());
  // Privacy : on n'expose pas les clientId raw au client (cf. defi-identity.ts).
  // Tag = sha256(shortCode + ":" + clientId) tronqué, salé par shortCode pour
  // empêcher la corrélation cross-défi. Le client calcule le même tag pour
  // son propre clientId localStorage et compare.
  //
  // En plus, on filtre ce qu'on expose selon le rôle du visiteur :
  //   - **créateur** (cookie defi_client matche creatorClientId) → tout
  //   - **ami répondeur** (cookie matche un amiClientId du défi) → ses
  //     propres réponses + celles du créateur (le but du défi : comparer)
  //   - **inconnu** (pas de cookie ou cookie pour un autre défi) → meta
  //     + scores agrégés, mais PAS le détail des réponses individuelles.
  // Auth dual : cookie clientId (mode anonyme / appareil habituel) ET session
  // user (depuis qu'un compte existe, le créateur peut se reconnecter sur un
  // autre appareil). On élargit la reconnaissance "créateur" à l'union des
  // deux preuves — même règle que /api/defis/mine et /api/defis/mine/unseen,
  // donc cohérence : un défi qui apparaît dans MyDefisList est aussi
  // reconnu comme "le sien" sur la page résultats.
  const [visitorClientId, user] = await Promise.all([
    getDefiClientId(),
    getCurrentUser(),
  ]);
  const isCreatorByClient =
    visitorClientId !== null && visitorClientId === defi.creatorClientId;
  const isCreatorByUser =
    user !== null && defi.creatorUserId !== null && user.id === defi.creatorUserId;
  const isCreator = isCreatorByClient || isCreatorByUser;
  // isResponder triplement reconnu :
  //   1. cookie clientId matche un amiClientId d'une réponse — couvre le cas
  //      same-device pour les amis anonymes ou connectés.
  //   2. user connecté + une réponse a amiUserId === user.id — couvre le cas
  //      cross-device : ami connecté qui revient depuis un autre appareil.
  // L'union des deux laisse la page fonctionner même si l'un des canaux
  // tombe (cookie purgé / non-connecté).
  const isResponderByClient =
    visitorClientId !== null &&
    defi.responses.some((r) => r.amiClientId === visitorClientId);
  const isResponderByUser =
    user !== null && defi.responses.some((r) => r.amiUserId === user.id);
  const isResponder = isResponderByClient || isResponderByUser;
  const showPrivate = isCreator || isResponder;

  // ─── Auto-claims ────────────────────────────────────────────────────────
  //
  // Quand l'utilisateur visite /resultats avec une preuve cookie ET une
  // session, on rattache le défi et/ou la réponse à son compte si ce n'était
  // pas déjà fait. Idempotent (UPDATE avec where contrainte sur le NULL),
  // fire-and-forget côté Server Component pour ne pas bloquer le rendu.
  //
  // **Pourquoi pas de garde "createdAt >= user.createdAt"** : on avait tenté
  // ce garde pour mitiger le shared-device ("PC familial" : Alice joue
  // anonyme, Bob signe up sur le même browser, cookie pointe encore sur le
  // clientId d'Alice). Mais ça cassait EXACTEMENT le flow visé par la CTA
  // "Crée un compte · Garde tes scores" : la réponse pré-date toujours
  // le compte créé via la CTA, donc le claim ne se ferait jamais. La promesse
  // "Garde tes scores" devenait mensongère. Tradeoff accepté : on prend le
  // risque marginal du shared-device (qui demande à Bob de connaître l'URL
  // du défi d'Alice ET d'être logged in pour déclencher) pour servir le cas
  // commun "play anonyme → signup → claim".
  //
  // Cas 1 : créateur anonyme qui s'est connecté après création. Le cookie
  // l'authentifie comme créateur ; on lie le défi à son nouveau compte pour
  // qu'il le retrouve depuis n'importe quel device.
  if (user !== null && isCreatorByClient && defi.creatorUserId === null) {
    void prisma.defi
      .updateMany({
        where: { shortCode, creatorUserId: null },
        data: { creatorUserId: user.id },
      })
      .catch(() => {
        // Échec silencieux : pas critique, la prochaine visite réessaiera.
      });
  }
  // Cas 2 : ami anonyme qui s'est connecté après avoir joué. Symétrique
  // au cas 1 mais sur la réponse correspondante (matchée par cookie).
  //
  // Gardes "no self-defi" :
  //   - Si le compte est déjà reconnu créateur en relationnel (`creatorUserId`),
  //     on ne se rattache pas comme responder de son propre défi.
  //   - Si le cookie courant matche aussi `creatorClientId`, c'est un
  //     auto-claim créateur en cours (Cas 1) — on n'attribue PAS la réponse
  //     en même temps pour éviter "Pierre et Pierre se sont défié·es".
  //     Ce check couvre le scénario "user crée anonyme + joue son défi sur
  //     le même device + signe up ensuite".
  if (
    user !== null &&
    visitorClientId !== null &&
    defi.creatorUserId !== user.id &&
    !isCreatorByClient
  ) {
    void prisma.defiResponse
      .updateMany({
        where: {
          defiShortCode: shortCode,
          amiClientId: visitorClientId,
          amiUserId: null,
        },
        data: { amiUserId: user.id },
      })
      .catch(() => {
        /* idem cas 1 */
      });
  }

  // Auto-mark seen : dès que le créateur ouvre cette page, on marque toutes
  // les responses non encore vues. Idempotent (updateMany sur where
  // `seenByCreatorAt IS NULL` — un second open de la page ne touche rien).
  // Fire-and-forget : on n'attend pas le résultat pour rendre la page, le
  // user verra le badge disparaître au prochain tick de polling (60 s) sans
  // qu'on bloque le SSR sur un write.
  //
  // Pas d'await intentionnel : Next.js permet de laisser des promesses
  // pendantes dans un Server Component tant que `dynamic = "force-dynamic"`.
  // Le write se termine après le response stream, ce qui est OK pour un
  // effet de bord non observable par cette requête.
  if (isCreator) {
    void prisma.defiResponse
      .updateMany({
        where: { defiShortCode: shortCode, seenByCreatorAt: null },
        data: { seenByCreatorAt: new Date() },
      })
      .catch(() => {
        // Swallow : un échec de mark-seen n'a aucun impact visible — la page
        // reste fonctionnelle, le badge restera juste un cycle de polling
        // de plus. Pas de log bruyant pour autant.
      });
  }

  const payload: SerializableDefi = {
    shortCode: defi.shortCode,
    creatorPseudo: defi.creatorPseudo,
    creatorTag: computeIdentityTag(defi.shortCode, defi.creatorClientId),
    // displayPseudo de l'utilisateur courant si une session Mon2027 est
    // active, sinon null. Côté ami non connecté, on s'en sert pour proposer
    // un CTA "Crée un compte · Garde tes scores" en post-jeu — l'utilisateur
    // qui a déjà un compte n'est pas relancé.
    currentUserPseudo: user?.displayPseudo ?? null,
    themeLabel: defi.themeLabel,
    title: defi.title,
    creatorScore: defi.creatorScore,
    // creatorAnswers détaillés seulement aux participants ; les inconnus
    // voient le score agrégé sans les détails.
    creatorAnswers: showPrivate ? defi.creatorAnswers : {},
    total: defi.total,
    questions: defi.questions,
    isExpired: defi.isExpired,
    expiresAt: defi.expiresAt.toISOString(),
    createdAt: defi.createdAt.toISOString(),
    responses: defi.responses.map((r) => {
      // L'ami est reconnu via cookie clientId OU compte connecté — les deux
      // canaux sont valides, l'un couvre le same-device anonyme, l'autre le
      // cross-device pour les amis connectés (cf. amiUserId).
      const isMineByClient =
        visitorClientId !== null && r.amiClientId === visitorClientId;
      const isMineByUser = user !== null && r.amiUserId === user.id;
      const isMine = isMineByClient || isMineByUser;
      return {
        amiLabel: r.amiLabel,
        amiTag: computeIdentityTag(defi.shortCode, r.amiClientId),
        // Réponses détaillées : créateur (toutes) ou ami lui-même (la sienne).
        answers: isCreator || isMine ? r.answers : {},
        score: r.score,
        createdAt: r.createdAt.toISOString(),
        // `seenByCreatorAt` est privacy-sensitive : exposé UNIQUEMENT au
        // créateur pour qu'il puisse voir quelles réponses n'ont pas encore
        // été ouvertes (pastille "nouveau" dans le sélecteur du switcher).
        // Pour ami / public on renvoie undefined : pas de leak, ils ne
        // sauraient pas qui a déjà été lu par le créateur.
        seenByCreatorAt: isCreator
          ? r.seenByCreatorAt?.toISOString() ?? null
          : undefined,
      };
    }),
    sentAgoLabel,
    viewerRole: isCreator ? "creator" : isResponder ? "responder" : "public",
  };

  return <DefiResultsClient defi={payload} />;
}
