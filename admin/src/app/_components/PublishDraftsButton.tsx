"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { publishDraftsAction } from "@/lib/collab-actions";

/// Bouton superadmin : publie d'un geste les brouillons affichés (tous, ou
/// ceux des filtres en cours). La liste exacte est figée au rendu de la page :
/// un brouillon ajouté entre-temps n'est pas publié à l'aveugle.
export function PublishDraftsButton({ draftIds, scope }: { draftIds: string[]; scope: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const n = draftIds.length;
  const label = scope ? `Publier ces ${n} brouillon${n > 1 ? "s" : ""}` : `Publier tous les brouillons (${n})`;

  const onConfirm = () => {
    start(async () => {
      const res = await publishDraftsAction(draftIds);
      if (res?.ok) toast.success(res.message ?? "Brouillons publiés", { duration: 12_000 });
      else toast.error(res?.message ?? "Publication refusée", { duration: 12_000 });
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={buttonVariants({ variant: "outline" })} title="Réservé au superadmin">
        <CheckCheck className="mr-1 h-4 w-4" /> {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Publier {n} brouillon{n > 1 ? "s" : ""}
            {scope ? ` (${scope})` : ""} ?
          </DialogTitle>
          <DialogDescription>
            Ils passent au statut « Publié » sans validation par un relecteur, sous ta responsabilité : ton nom est
            enregistré comme garant et chaque publication apparaît dans l’historique de la question. Les brouillons
            incomplets (champ requis manquant, réponse mal saisie, aucune source) restent en brouillon et te seront
            listés. Tu peux dépublier une question à tout moment en la repassant en brouillon.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Publication…" : `Publier ${n} brouillon${n > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
