"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/auth/actions";
import { submitWithoutReset } from "../_components/submit-without-reset";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Échec : l'identifiant reste (pas de réinitialisation, cf.
  // submit-without-reset) ; seul le mot de passe est vidé, prêt à retaper.
  useEffect(() => {
    const input = passwordRef.current;
    if (!state?.error || !input) return;
    input.value = "";
    input.focus();
  }, [state]);

  return (
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1">
        <Label htmlFor="login">Identifiant</Label>
        <Input id="login" name="login" autoComplete="username" autoCapitalize="none" required autoFocus />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          ref={passwordRef}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-rose-700">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
