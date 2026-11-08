"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createContributorAction,
  resetPasswordAction,
  setRoleAction,
  type FormState,
} from "@/lib/auth/actions";
import type { Role } from "@/lib/auth/roles";
import { submitWithoutReset } from "../_components/submit-without-reset";

type RoleOption = { value: Role; label: string };

/// Affiche un mot de passe provisoire une seule fois, avec copie.
function TempPassword({ state }: { state: NonNullable<FormState> }) {
  const [copied, setCopied] = useState(false);
  if (!state.tempPassword) return null;
  return (
    <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p>{state.message}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="rounded bg-white px-2 py-1 font-mono text-base select-all">{state.tempPassword}</code>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(state.tempPassword ?? "");
            setCopied(true);
          }}
        >
          {copied ? "Copié" : "Copier"}
        </Button>
      </div>
      <p className="mt-2 text-xs">Il ne sera plus affiché : transmets-le par un canal privé (Signal, en main propre…).</p>
    </div>
  );
}

export function CreateContributorForm({ roles }: { roles: RoleOption[] }) {
  const [state, formAction, pending] = useActionState(createContributorAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  // Compte créé : formulaire vidé pour le suivant. En cas d'erreur
  // (identifiant pris…), la saisie reste à corriger.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} onSubmit={submitWithoutReset(formAction)}>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="displayName">Nom affiché</Label>
          <Input id="displayName" name="displayName" placeholder="Camille D." required maxLength={60} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-login">Identifiant de connexion</Label>
          <Input id="new-login" name="login" placeholder="camille" required autoCapitalize="none" maxLength={32} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="role">Rôle</Label>
          <select
            id="role"
            name="role"
            defaultValue="contributeur"
            className="h-8 rounded-lg border bg-background px-2 text-sm"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Création…" : "Créer le compte"}
        </Button>
      </div>
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}
      {state?.ok && <TempPassword state={state} />}
    </form>
  );
}

export function RoleSelect({
  contributorId,
  current,
  roles,
}: {
  contributorId: string;
  current: Role;
  roles: RoleOption[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Rôle"
      defaultValue={current}
      disabled={pending}
      className="h-8 rounded-lg border bg-background px-2 text-sm"
      onChange={(e) => {
        const role = e.target.value as Role;
        start(async () => {
          const res = await setRoleAction(contributorId, role);
          if (res?.error) toast.error(res.error);
          else if (res?.message) toast.success(res.message);
        });
      }}
    >
      {roles.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

export function ResetPasswordButton({ contributorId }: { contributorId: string }) {
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  return (
    <div className="inline-block text-left">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Générer un nouveau mot de passe provisoire ? L'ancien ne fonctionnera plus.")) return;
          start(async () => {
            const res = await resetPasswordAction(contributorId);
            if (res?.error) toast.error(res.error);
            setState(res);
          });
        }}
      >
        Réinitialiser le mot de passe
      </Button>
      {state?.ok && <TempPassword state={state} />}
    </div>
  );
}
