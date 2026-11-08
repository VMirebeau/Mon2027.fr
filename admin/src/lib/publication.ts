import { prisma } from "@/lib/db";
import type { CurrentContributor } from "@/lib/auth/session";
import { canPublishDirectly, countingValidations, publicationBlocker } from "@/lib/auth/roles";
import { publishMetaFrom, type PublishMeta } from "@/lib/validation-status";

/// Préparation d'une publication, commune au formulaire (statut « Publié »)
/// et aux boutons du panneau (« Publier », « Valider et publier ») : même
/// règle, mêmes colonnes renseignées, quel que soit le chemin.
///
/// Renvoie le motif de blocage, ou les colonnes à écrire (valideurs, dates).
export async function preparePublication(
  me: CurrentContributor,
  args: {
    contentHash: string;
    lastContentAuthorId: string | null;
    validations: ReadonlyArray<{ contributorId: string; contentHash: string; createdAt: Date }>;
  },
): Promise<{ blocker: string } | { meta: PublishMeta }> {
  const blocker = canPublishDirectly(me.role) ? null : publicationBlocker(args);
  if (blocker) return { blocker };
  const counted = countingValidations(args);
  const validators = await prisma.contributor.findMany({
    where: { id: { in: counted.map((v) => v.contributorId) } },
    select: { displayName: true },
  });
  return {
    meta: publishMetaFrom({
      counted,
      validatorNames: validators.map((v) => v.displayName),
      publisherName: me.displayName,
      now: new Date(),
    }),
  };
}
