import { prisma } from "@/lib/db";
import { requireContributor } from "@/lib/auth/session";
import { assignableRoles, canManageAccount, isRole, ROLE_LABELS } from "@/lib/auth/roles";
import { setDisabledAction } from "@/lib/auth/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "../_components/ActionButton";
import { formatDateTime } from "../_components/format";
import { CreateContributorForm, ResetPasswordButton, RoleSelect } from "./ContributorControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contributeurs · Mon2027" };

export default async function ContributorsPage() {
  const me = await requireContributor({ minRole: "superadmin" });
  const roleOptions = assignableRoles(me.role).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  const contributors = await prisma.contributor.findMany({
    orderBy: [{ disabledAt: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { revisions: true, validations: true, comments: true } } },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Contributeurs</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        <strong>Contributeur</strong> : crée et améliore les questions non publiées, discute, traite les propositions.{" "}
        <strong>Relecteur</strong> : valide, publie, retire et modifie les questions publiées.{" "}
        <strong>Admin</strong> : supprime en plus les questions non publiées.{" "}
        <strong>Superadmin</strong> : publie directement, supprime et modifie tout, et seul à gérer les comptes ;
        ce rôle ne s&apos;attribue qu&apos;en ligne de commande. Pour tous les autres, une publication exige la
        validation d&apos;un relecteur autre que l&apos;auteur de la dernière modification.
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Nouveau compte</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateContributorForm roles={roleOptions} />
        </CardContent>
      </Card>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Identifiant</TableHead>
              <TableHead className="w-44">Rôle</TableHead>
              <TableHead>Activité</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contributors.map((c) => {
              const self = c.id === me.id;
              const role = isRole(c.role) ? c.role : "contributeur";
              const manageable = !self && canManageAccount(me.role, role);
              return (
                <TableRow key={c.id} className={c.disabledAt ? "opacity-50" : undefined}>
                  <TableCell>
                    {c.displayName}
                    {self && <span className="ml-1 text-xs text-muted-foreground">(toi)</span>}
                    {c.disabledAt && <Badge variant="secondary" className="ml-2">Désactivé</Badge>}
                    {c.mustChangePassword && !c.disabledAt && (
                      <Badge variant="outline" className="ml-2">Mot de passe provisoire</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.login}</TableCell>
                  <TableCell>
                    {manageable ? (
                      <RoleSelect contributorId={c.id} current={role} roles={roleOptions} />
                    ) : (
                      ROLE_LABELS[role]
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c._count.revisions} modif. · {c._count.validations} valid. · {c._count.comments} messages
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.lastLoginAt ? formatDateTime(c.lastLoginAt) : "jamais"}
                  </TableCell>
                  <TableCell className="text-right">
                    {manageable && (
                      <div className="flex justify-end gap-1">
                        <ResetPasswordButton contributorId={c.id} />
                        <ActionButton
                          action={setDisabledAction.bind(null, c.id, !c.disabledAt)}
                          variant="ghost"
                          confirm={
                            c.disabledAt
                              ? undefined
                              : `Désactiver le compte de ${c.displayName} ? Il sera déconnecté immédiatement (son historique est conservé).`
                          }
                        >
                          {c.disabledAt ? "Réactiver" : "Désactiver"}
                        </ActionButton>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
