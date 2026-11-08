"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CollabResult } from "@/lib/collab-actions";
import { submitWithoutReset } from "./submit-without-reset";

export function CommentForm({
  action,
}: {
  action: (prev: CollabResult, formData: FormData) => Promise<CollabResult>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Le formulaire n'est vidé qu'après un envoi réussi : un message refusé
  // (trop long, question supprimée…) reste dans le champ.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
    else if (state?.message) toast.error(state.message);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} onSubmit={submitWithoutReset(formAction)} className="space-y-2">
      <Textarea
        name="body"
        rows={3}
        maxLength={5000}
        placeholder="Écrire un message aux autres contributeurs…"
        aria-label="Nouveau message"
        required
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Envoi…" : "Envoyer"}
        </Button>
      </div>
    </form>
  );
}
