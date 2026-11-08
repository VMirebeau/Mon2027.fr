"use client";

import { Input } from "@/components/ui/input";
import { addCl, CL_ADVISED_MAX, CL_MIN, type ClFields, type ClRow, type ClState } from "./classement";
import { MODELS } from "./formats";
import { moveAt, updateRow } from "./shared";
import { EditorFrame, Field, Messages, Notice, RowList, usePayloadEditor, type EditorApi } from "./ui";

export function ClassementEditor({ initial }: { initial?: string | null }) {
  const api = usePayloadEditor(MODELS.classement, initial);
  const { state: s, setState } = api;
  const set = (key: string, patch: Partial<ClFields>) => setState((st) => ({ ...st, rows: updateRow(st.rows, key, patch) }));
  const n = s.rows.length;

  return (
    <EditorFrame
      api={api}
      intro={
        <>
          Saisis les éléments <strong>dans le bon ordre</strong>, du premier au dernier (monte ou descends-les avec
          les flèches). Le joueur les reçoit mélangés et doit retrouver cet ordre ; à la révélation, il voit l&apos;ordre
          correct et le chiffre de chaque élément.
        </>
      }
      notices={s.foreign && <Notice>Le format de la question a changé : saisis les éléments à remettre dans l&apos;ordre.</Notice>}
    >
      <RowList
        rows={s.rows}
        label="Éléments, dans le bon ordre"
        itemTitle={(_, i) => (i === 0 ? "Position 1 (en premier)" : i === n - 1 ? `Position ${i + 1} (en dernier)` : `Position ${i + 1}`)}
        addLabel="Ajouter un élément"
        minRows={CL_MIN}
        maxRows={CL_ADVISED_MAX}
        onAdd={() => {
          const next = addCl(s);
          setState(() => next);
          return next.rows[next.rows.length - 1].key;
        }}
        onRemove={(key) => setState((st) => ({ ...st, rows: st.rows.filter((r) => r.key !== key) }))}
        onMove={(i, dir) => setState((st) => ({ ...st, rows: moveAt(st.rows, i, dir) }))}
      >
        {(row) => <ItemFields api={api} row={row} set={set} />}
      </RowList>
      <Messages issues={api.shown("list.rows", true)} />
    </EditorFrame>
  );
}

function ItemFields({
  api,
  row,
  set,
}: {
  api: EditorApi<ClState>;
  row: ClRow;
  set: (key: string, patch: Partial<ClFields>) => void;
}) {
  const existing = row.init !== undefined;
  const at = (f: string) => `${row.key}.${f}`;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Field label="Élément" issues={api.shown(at("label"), existing)} onBlur={() => api.touch(at("label"))}>
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={row.f.label}
            onChange={(e) => set(row.key, { label: e.target.value })}
            placeholder="Ex. Éducation nationale"
          />
        )}
      </Field>
      <Field
        label="Chiffre (facultatif)"
        hint="Affiché à la révélation."
        issues={api.shown(at("figure"), existing)}
        onBlur={() => api.touch(at("figure"))}
      >
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={row.f.figure}
            onChange={(e) => set(row.key, { figure: e.target.value })}
            placeholder="Ex. 78 Md€"
          />
        )}
      </Field>
    </div>
  );
}
