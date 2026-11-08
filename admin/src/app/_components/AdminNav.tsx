import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentContributor } from "@/lib/auth/session";
import { canManageContributors, canValidate, ROLE_LABELS } from "@/lib/auth/roles";
import { logoutAction } from "@/lib/auth/actions";
import { awaitingValidationIds } from "@/lib/validation-queue";

/// Barre de navigation de l'espace contributeurs. Rien n'est rendu hors
/// connexion (page de login). Le contrôle d'accès, lui, est fait par chaque
/// page : ce composant n'est qu'un affichage.
export async function AdminNav() {
  const me = await getCurrentContributor();
  if (!me || me.mustChangePassword) return null;
  // File « À valider » : seulement pour ceux qui peuvent valider.
  const [newSuggestions, toValidate] = await Promise.all([
    prisma.suggestion.count({ where: { status: "nouvelle" } }),
    canValidate(me.role) ? awaitingValidationIds().then((ids) => ids.size) : Promise.resolve(0),
  ]);

  return (
    <nav className="border-b bg-card">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 text-sm">
        <Link href="/" className="font-semibold">
          Mon2027 · Contributeurs
        </Link>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Questions
        </Link>
        {canValidate(me.role) && (
          <Link href="/?vue=a-valider" className="text-muted-foreground hover:text-foreground">
            À valider
            {toValidate > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-white">
                {toValidate}
              </span>
            )}
          </Link>
        )}
        <Link href="/suggestions" className="text-muted-foreground hover:text-foreground">
          Propositions des joueurs
          {newSuggestions > 0 && (
            <span className="ml-1.5 rounded-full bg-sky-600 px-1.5 py-0.5 text-xs font-medium text-white">
              {newSuggestions}
            </span>
          )}
        </Link>
        {canManageContributors(me.role) && (
          <Link href="/contributeurs" className="text-muted-foreground hover:text-foreground">
            Contributeurs
          </Link>
        )}
        <div className="flex-1" />
        <Link href="/compte" className="text-muted-foreground hover:text-foreground">
          {me.displayName} <span className="text-xs">({ROLE_LABELS[me.role]})</span>
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Déconnexion
          </button>
        </form>
      </div>
    </nav>
  );
}
