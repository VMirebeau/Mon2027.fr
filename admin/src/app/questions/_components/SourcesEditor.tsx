"use client";

import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SOURCE_TYPES } from "@/lib/constants";
import { Trash2, Plus, ExternalLink } from "lucide-react";
import { useMarkDirtyOnChange } from "./DirtyProvider";
import type { SourceFieldErrors } from "./form-errors";

export type SourceRow = {
  nom: string;
  url: string;
  type: "primaire" | "triangulation";
};

type Props = {
  initial?: SourceRow[];
  /// Erreurs du dernier enregistrement, par ligne (`sources.N.champ`).
  errors?: Record<number, SourceFieldErrors>;
};

function RowError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-rose-600">{message}</p> : null;
}

export function SourcesEditor({ initial = [], errors = {} }: Props) {
  const [sources, setSources] = useState<SourceRow[]>(initial);
  const serialized = JSON.stringify(sources);
  // Type changé, ligne ajoutée ou supprimée : pas d'événement change sur le <form>.
  useMarkDirtyOnChange(serialized);

  const update = (i: number, patch: Partial<SourceRow>) => {
    setSources((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const add = () =>
    setSources((s) => [...s, { nom: "", url: "", type: "primaire" }]);
  const remove = (i: number) =>
    setSources((s) => s.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="sourcesJson"
        value={serialized}
      />

      {sources.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune source. Ajoute-en au moins une.
        </p>
      )}

      {sources.map((s, i) => {
        const err = errors[i] ?? {};
        const invalid = !!(err.nom || err.url || err.type || err.ligne);
        return (
        <div
          key={i}
          data-invalid={invalid ? "true" : undefined}
          className={`flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start ${
            invalid ? "border-rose-300 bg-rose-50/50 dark:bg-rose-950/20" : "bg-muted/30"
          }`}
        >
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Nom</Label>
            <Input
              value={s.nom}
              onChange={(e) => update(i, { nom: e.target.value })}
              placeholder="Ex: INSEE - Étrangers, immigrés"
              aria-invalid={err.nom ? true : undefined}
            />
            <RowError message={err.nom} />
          </div>
          <div className="flex-[2] space-y-1">
            <Label className="text-xs">URL</Label>
            <div className="flex gap-1">
              <Input
                value={s.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="https://www.insee.fr/..."
                type="url"
                aria-invalid={err.url ? true : undefined}
              />
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: "icon", variant: "outline" })}
                  title="Ouvrir la source"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            <RowError message={err.url} />
            <RowError message={err.ligne} />
          </div>
          <div className="w-full space-y-1 sm:w-44">
            <Label className="text-xs">Type</Label>
            <Select
              value={s.type}
              onValueChange={(v) =>
                update(i, { type: v as SourceRow["type"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RowError message={err.type} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
            title="Supprimer cette source"
            className="sm:mt-5"
          >
            <Trash2 className="h-4 w-4 text-rose-600" />
          </Button>
        </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-4 w-4" /> Ajouter une source
      </Button>
    </div>
  );
}
