"use client";

import { useState, useTransition } from "react";
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
import { toast } from "sonner";
import { deleteQuestionAction } from "@/lib/actions";
import { Trash2 } from "lucide-react";

type Props = {
  id: string;
  label?: string;
  variant?: "ghost" | "destructive" | "outline";
  size?: "default" | "sm" | "icon";
  /// Question publiée (suppression réservée au superadmin) : avertissement
  /// renforcé, les données des joueurs y font référence.
  published?: boolean;
};

export function DeleteQuestionButton({
  id,
  label,
  variant = "ghost",
  size = "icon",
  published = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const onConfirm = () => {
    start(async () => {
      // En cas de succès l'action redirige ; on ne revient ici qu'en cas de refus.
      const res = await deleteQuestionAction(id);
      if (res && !res.ok) {
        toast.error(res.message ?? "Suppression refusée");
        setOpen(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ variant, size })}
        title="Supprimer"
      >
        <Trash2 className="h-4 w-4 text-rose-600" />
        {label && <span className="ml-2">{label}</span>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer cette question ?</DialogTitle>
          <DialogDescription>
            Cette action est définitive. La question, ses sources, son
            historique et sa discussion seront effacés de la base.
            {published && (
              <strong className="mt-2 block text-rose-700">
                Elle est publiée : des joueurs y ont peut-être répondu et des
                défis la contiennent. Passer son statut à « Retiré » est
                presque toujours préférable.
              </strong>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Suppression…" : "Supprimer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
