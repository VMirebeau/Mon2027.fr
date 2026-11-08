"use client";

import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MODELS } from "./formats";
import {
  addPd,
  pdEffective,
  pdSum,
  PD_ADVISED_MAX,
  PD_DEFAULT_STEP,
  PD_DEFAULT_TOTAL,
  PD_MIN,
  type PdFields,
  type PdRow,
  type PdState,
  type PdTop,
} from "./pondere";
import { fmtNum, moveAt, updateRow } from "./shared";
import {
  ColorSelect,
  EditorFrame,
  Field,
  Messages,
  Notice,
  RowList,
  SectionTitle,
  usePayloadEditor,
  type EditorApi,
} from "./ui";

/// Palette automatique du player (content.ts, format pondere), par position.
const AUTO_PALETTE = ["var(--yellow)", "var(--coral)", "var(--teal)", "var(--plum)", "var(--ink-mute)"];

export function PondereEditor({ initial }: { initial?: string | null }) {
  const api = usePayloadEditor(MODELS.pondere, initial);
  const { state: s, setState } = api;
  const existingTop = s.init !== undefined;
  const setTop = (patch: Partial<PdTop>) => setState((st) => ({ ...st, top: { ...st.top, ...patch } }));
  const set = (key: string, patch: Partial<PdFields>) => setState((st) => ({ ...st, rows: updateRow(st.rows, key, patch) }));
  const { total, step } = pdEffective(s);

  return (
    <EditorFrame
      api={api}
      intro={
        <>
          Le joueur répartit {total !== null ? fmtNum(total) : "les"} points entre les catégories avec un curseur par
          catégorie{step !== null && step > 1 ? `, par tranches de ${fmtNum(step)}` : ""}. À la révélation, il compare
          sa répartition à la vraie, catégorie par catégorie.
        </>
      }
      notices={s.foreign && <Notice>Le format de la question a changé : saisis le total et les catégories.</Notice>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Total à répartir"
          hint={`Vide : ${PD_DEFAULT_TOTAL}.`}
          issues={api.shown("top.total", existingTop)}
          onBlur={() => api.touch("top.total")}
        >
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              autoComplete="off"
              value={s.top.total}
              onChange={(e) => setTop({ total: e.target.value })}
              placeholder={String(PD_DEFAULT_TOTAL)}
            />
          )}
        </Field>
        <Field
          label="Pas des curseurs"
          hint={`Le joueur avance par tranches de ce nombre de points. Vide : ${PD_DEFAULT_STEP}.`}
          issues={api.shown("top.step", existingTop)}
          onBlur={() => api.touch("top.step")}
        >
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              autoComplete="off"
              value={s.top.step}
              onChange={(e) => setTop({ step: e.target.value })}
              placeholder={String(PD_DEFAULT_STEP)}
            />
          )}
        </Field>
      </div>

      <section aria-labelledby="pd-parts" className="space-y-3">
        <SectionTitle id="pd-parts">Catégories et vraie répartition</SectionTitle>
        <RowList
          rows={s.rows}
          label="Catégories"
          itemTitle={(_, i) => `Catégorie ${i + 1}`}
          addLabel="Ajouter une catégorie"
          minRows={PD_MIN}
          maxRows={PD_ADVISED_MAX}
          onAdd={() => {
            const next = addPd(s);
            setState(() => next);
            return next.rows[next.rows.length - 1].key;
          }}
          onRemove={(key) => setState((st) => ({ ...st, rows: st.rows.filter((r) => r.key !== key) }))}
          onMove={(i, dir) => setState((st) => ({ ...st, rows: moveAt(st.rows, i, dir) }))}
        >
          {(row, i) => <PartFields api={api} row={row} index={i} total={total} set={set} />}
        </RowList>
        <Messages issues={api.shown("list.rows", true)} />
        <SumCounter state={s} total={total} />
      </section>
    </EditorFrame>
  );
}

function SumCounter({ state, total }: { state: PdState; total: number | null }) {
  const { sum, unreadable } = pdSum(state);
  const ok = total !== null && unreadable === 0 && sum === total;
  const diff = total !== null ? Math.round((total - sum) * 1e9) / 1e9 : 0;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2 rounded-md border px-3 py-2 text-sm",
        ok
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200",
      )}
    >
      {ok && <Check className="h-4 w-4" aria-hidden />}
      <span className="font-medium tabular-nums">
        Somme des vraies parts : {fmtNum(sum)} / {total !== null ? fmtNum(total) : "?"}
      </span>
      <span>
        {total === null
          ? "· total illisible"
          : unreadable > 0
            ? `· ${unreadable === 1 ? "1 part à compléter" : `${unreadable} parts à compléter`}`
            : ok
              ? "· le compte est bon"
              : diff > 0
                ? `· il manque ${fmtNum(diff)}`
                : `· ${fmtNum(-diff)} de trop`}
      </span>
    </div>
  );
}

function PartFields({
  api,
  row,
  index,
  total,
  set,
}: {
  api: EditorApi<PdState>;
  row: PdRow;
  index: number;
  total: number | null;
  set: (key: string, patch: Partial<PdFields>) => void;
}) {
  const existing = row.init !== undefined;
  const at = (f: string) => `${row.key}.${f}`;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Field label="Nom de la catégorie" issues={api.shown(at("label"), existing)} onBlur={() => api.touch(at("label"))}>
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={row.f.label}
            onChange={(e) => set(row.key, { label: e.target.value })}
            placeholder="Ex. TVA"
          />
        )}
      </Field>
      <Field
        label={`Vraie part${total !== null ? ` (sur ${fmtNum(total)})` : ""}`}
        issues={api.shown(at("valeur"), existing)}
        onBlur={() => api.touch(at("valeur"))}
      >
        {(p) => (
          <Input
            {...p}
            inputMode="decimal"
            autoComplete="off"
            value={row.f.valeur}
            onChange={(e) => set(row.key, { valeur: e.target.value })}
            placeholder="Ex. 45"
          />
        )}
      </Field>
      <Field label="Couleur" issues={[]}>
        {(p) => (
          <ColorSelect
            {...p}
            value={row.f.color}
            autoColor={AUTO_PALETTE[index % AUTO_PALETTE.length]}
            onChange={(v) => set(row.key, { color: v })}
          />
        )}
      </Field>
    </div>
  );
}
