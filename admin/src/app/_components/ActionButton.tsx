"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Result = { ok?: boolean; message?: string; error?: string } | null | void;

/// Bouton qui déclenche une server action (déjà liée à ses arguments côté
/// serveur) et affiche son résultat en toast.
export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "sm",
  confirm,
  className,
  blockedReason,
}: {
  action: () => Promise<Result>;
  children: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "xs";
  /// Message de confirmation (window.confirm) avant d'agir.
  confirm?: string;
  className?: string;
  /// Si défini, le clic n'agit pas et affiche ce motif (ex. formulaire voisin
  /// non enregistré).
  blockedReason?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      className={className}
      onClick={() => {
        if (blockedReason) {
          toast.error(blockedReason);
          return;
        }
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const res = await action();
          const msg = res?.error ?? res?.message;
          if (res && (res.ok === false || res.error)) toast.error(msg ?? "Action refusée");
          else if (msg) toast.success(msg);
        });
      }}
    >
      {pending ? "…" : children}
    </Button>
  );
}
