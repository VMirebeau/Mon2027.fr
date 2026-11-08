import { requireContributor } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { logoutAction } from "@/lib/auth/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon compte · Mon2027 Contributeurs" };

export default async function AccountPage() {
  const me = await requireContributor({ allowPendingPassword: true });

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Mon compte</h1>

      {me.mustChangePassword && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Bienvenue, {me.displayName} !</p>
          <p className="mt-1">
            Ton mot de passe actuel est provisoire. Choisis ton mot de passe personnel pour accéder à
            l&apos;espace contributeurs.
          </p>
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 p-4 text-sm">
          <span className="text-muted-foreground">Identifiant</span>
          <span className="font-mono">{me.login}</span>
          <span className="text-muted-foreground">Nom affiché</span>
          <span>{me.displayName}</span>
          <span className="text-muted-foreground">Rôle</span>
          <span>{ROLE_LABELS[me.role]}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Changer de mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Au moins {MIN_PASSWORD_LENGTH} caractères. Une phrase de plusieurs mots est plus sûre et plus facile à
            retenir qu&apos;un mot compliqué. Changer de mot de passe déconnecte tes autres appareils.
          </p>
          <PasswordForm />
        </CardContent>
      </Card>

      {me.mustChangePassword && (
        <form action={logoutAction} className="mt-6">
          <button type="submit" className="text-sm text-muted-foreground underline">
            Se déconnecter
          </button>
        </form>
      )}
    </div>
  );
}
