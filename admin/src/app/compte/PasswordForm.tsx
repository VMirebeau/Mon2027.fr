"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction } from "@/lib/auth/actions";
import { submitWithoutReset } from "../_components/submit-without-reset";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  // Vidé seulement après un changement réussi : en cas d'erreur (confirmation
  // différente, mot de passe trop court…), la saisie reste à corriger.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="current">Mot de passe actuel</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="next">Nouveau mot de passe</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-rose-700">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-emerald-700">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Enregistrement…" : "Changer le mot de passe"}
      </Button>
    </form>
  );
}
