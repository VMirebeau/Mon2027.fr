import { prisma } from "@/lib/db";

/// Ménage périodique de la base, sans tâche cron : déclenché au fil des
/// requêtes (cf. maybePurge), au plus une fois toutes les PURGE_EVERY_MS par
/// processus. Toutes les suppressions passent par des index (expiresAt).
///
/// Ce qui est supprimé :
///   - sessions joueurs et contributeurs expirées (elles n'étaient effacées
///     que si leur jeton revenait, donc jamais pour un appareil abandonné) ;
///   - défis expirés depuis plus de DEFI_GRACE_MS, avec leurs réponses
///     (cascade). Un défi expire à J+30 et reste affiché « expiré » au
///     créateur, qui peut le relancer : on le garde donc encore ~11 mois
///     avant de l'effacer, soit environ un an après sa création. Les prénoms
///     des amis ne sont ainsi pas conservés indéfiniment.
///
/// Ce qui est gardé : les réponses anonymes (Answer), qui font les
/// statistiques communautaires, et tout le contenu.

const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;
export const DEFI_GRACE_MS = 335 * 24 * 60 * 60 * 1000;

let lastRunAt = 0;
let running: Promise<void> | null = null;

export async function purgeExpired(now: Date = new Date()): Promise<{
  sessions: number;
  contributorSessions: number;
  defis: number;
}> {
  const [sessions, contributorSessions, defis] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.contributorSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.defi.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - DEFI_GRACE_MS) } },
    }),
  ]);
  // Aperçus contributeurs expirés (deux heures de vie, cf. QuestionPreview).
  await prisma.questionPreview.deleteMany({ where: { expiresAt: { lt: now } } });
  return {
    sessions: sessions.count,
    contributorSessions: contributorSessions.count,
    defis: defis.count,
  };
}

/// À appeler sans attendre (`void maybePurge()`) depuis une route
/// fréquente : ne coûte rien hors de la fenêtre, et un échec (base occupée)
/// est simplement retenté à la fenêtre suivante.
export function maybePurge(): Promise<void> {
  const now = Date.now();
  if (running || now - lastRunAt < PURGE_EVERY_MS) return running ?? Promise.resolve();
  lastRunAt = now;
  running = purgeExpired(new Date(now))
    .then((r) => {
      if (r.sessions + r.contributorSessions + r.defis > 0) {
        console.info(
          `[maintenance] purge : ${r.sessions} session(s), ${r.contributorSessions} session(s) contributeur, ${r.defis} défi(s)`,
        );
      }
    })
    .catch((e) => {
      console.warn("[maintenance] purge échouée, nouvel essai plus tard :", e);
    })
    .finally(() => {
      running = null;
    });
  return running;
}
