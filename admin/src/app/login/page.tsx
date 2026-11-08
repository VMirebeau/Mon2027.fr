import { redirect } from "next/navigation";
import { getCurrentContributor } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/guard";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion · Mon2027 Contributeurs" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  if (await getCurrentContributor()) redirect(next);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="mb-1 text-2xl font-bold">Espace contributeurs</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Réservé aux contributeurs de Mon2027. Les comptes sont créés par le superadmin.
      </p>
      <LoginForm next={next} />
    </div>
  );
}
