"use client";

import { useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INDICATORS,
  MAX_INDICATORS_PER_QUESTION,
  type FormatValue,
  type IndicatorId,
} from "@/lib/constants";
import { Trash2, Plus } from "lucide-react";
import { useMarkDirtyOnChange } from "./DirtyProvider";
import { polarityWording, type Polarity } from "./indicator-wording";

export type IndicatorRow = {
  id: IndicatorId;
  polarity: Polarity;
};

type Props = {
  initial?: IndicatorRow[];
  /// Format de la question : le sens d'un indicateur se formule autrement
  /// pour une estimation (trop haut / trop bas) que pour un vrai/faux.
  format: FormatValue;
  /// Lecture seule : les choix de sens (radios base-ui, des <span>) ne sont
  /// pas désactivés par le <fieldset disabled> englobant.
  disabled?: boolean;
};

const AXIS_ITEMS = INDICATORS.map((i) => ({ value: i.value, label: i.label }));
const POLARITIES: Polarity[] = [1, -1];

/// Indicateurs du portrait : sur quels axes la question pèse et dans quel
/// sens. Le formulaire envoie toujours `indicatorsJson` = [{ id, polarity }].
export function IndicatorsEditor({ initial = [], format, disabled = false }: Props) {
  const [rows, setRows] = useState<IndicatorRow[]>(initial);
  const serialized = JSON.stringify(rows);
  // Les selects ne déclenchent pas d'événement change sur le <form>.
  useMarkDirtyOnChange(serialized);

  const update = (i: number, patch: Partial<IndicatorRow>) => {
    setRows((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const add = () => {
    if (rows.length >= MAX_INDICATORS_PER_QUESTION) return;
    /// Premier indicateur non encore tagué : évite les doublons à l'ajout
    /// (la validation Zod refuserait au save, autant guider dès la saisie).
    const taken = new Set(rows.map((r) => r.id));
    const next = INDICATORS.find((i) => !taken.has(i.value));
    if (!next) return;
    setRows((s) => [...s, { id: next.value, polarity: 1 }]);
  };
  const remove = (i: number) => setRows((s) => s.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      <input type="hidden" name="indicatorsJson" value={serialized} />

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun axe pour l&apos;instant : la question ne compte pas dans le portrait.
        </p>
      )}

      {rows.map((row, i) => {
        const meta = INDICATORS.find((t) => t.value === row.id) ?? INDICATORS[0];
        const wording = polarityWording(format, meta.subject);
        const takenByOthers = new Set(rows.filter((_, idx) => idx !== i).map((r) => r.id));
        const base = `indicateur-${i}`;
        return (
          <div key={i} role="group" aria-label={`Axe ${i + 1} : ${meta.label}`} className="space-y-3 rounded-lg border bg-background p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor={`${base}-axe`}>Axe</Label>
                <Select
                  items={AXIS_ITEMS}
                  value={row.id}
                  onValueChange={(v) => {
                    if (v) update(i, { id: v as IndicatorId });
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger id={`${base}-axe`} aria-describedby={`${base}-def`} className="w-full sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INDICATORS.map((t) => (
                      <SelectItem key={t.value} value={t.value} disabled={takenByOthers.has(t.value)}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id={`${base}-def`} className="text-xs text-muted-foreground">
                  Compte sur cet axe : {meta.description}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(i)}
                aria-label={`Retirer l'axe ${meta.label}`}
              >
                <Trash2 className="h-4 w-4 text-rose-600" aria-hidden />
                <span className="hidden sm:inline">Retirer</span>
              </Button>
            </div>

            <div className="space-y-1.5">
              <p id={`${base}-sens`} className="text-sm font-medium">
                {wording.prompt}
              </p>
              <RadioGroup
                aria-labelledby={`${base}-sens`}
                value={row.polarity}
                onValueChange={(v) => update(i, { polarity: v === -1 ? -1 : 1 })}
                disabled={disabled}
                className="grid gap-2 sm:grid-cols-2"
              >
                {POLARITIES.map((p) => (
                  <label
                    key={p}
                    className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-data-checked:border-foreground/40 has-data-checked:bg-muted has-data-disabled:cursor-not-allowed has-data-disabled:opacity-60"
                  >
                    <Radio.Root
                      value={p}
                      className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-foreground"
                    >
                      <Radio.Indicator className="size-2 rounded-full bg-foreground" />
                    </Radio.Root>
                    <span>{wording.choice(p)}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs" aria-live="polite">
              {wording.summary(row.polarity)}
            </p>
          </div>
        );
      })}

      {rows.length < MAX_INDICATORS_PER_QUESTION && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Ajouter un axe
        </Button>
      )}
    </div>
  );
}
