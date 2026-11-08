"use client";

import { useId } from "react";
import { MODELS } from "./formats";
import { moveAt, updateRow } from "./shared";
import {
  EditorFrame,
  Field,
  Messages,
  Notice,
  RowList,
  TEXTAREA_CLASS,
  TrueFalseToggle,
  usePayloadEditor,
  type EditorApi,
} from "./ui";
import { addVfm, VFM_ADVISED_MAX, VFM_MIN, type VfmFields, type VfmRow, type VfmState } from "./vraifaux-multi";

export function VraiFauxMultiEditor({ initial }: { initial?: string | null }) {
  const api = usePayloadEditor(MODELS.vraifaux_multi, initial);
  const { state: s, setState } = api;
  const set = (key: string, patch: Partial<VfmFields>) => setState((st) => ({ ...st, rows: updateRow(st.rows, key, patch) }));

  return (
    <EditorFrame
      api={api}
      intro={
        <>
          Le joueur voit les affirmations dans cet ordre et juge chacune vraie ou fausse. À la révélation, il découvre
          les bonnes réponses et peut déplier l&apos;explication de chaque affirmation (« Pourquoi ? »).
        </>
      }
      notices={s.foreign && <Notice>Le format de la question a changé : saisis les affirmations pour ce format.</Notice>}
    >
      <RowList
        rows={s.rows}
        label="Affirmations"
        itemTitle={(_, i) => `Affirmation ${i + 1}`}
        addLabel="Ajouter une affirmation"
        minRows={VFM_MIN}
        maxRows={VFM_ADVISED_MAX}
        onAdd={() => {
          const next = addVfm(s);
          setState(() => next);
          return next.rows[next.rows.length - 1].key;
        }}
        onRemove={(key) => setState((st) => ({ ...st, rows: st.rows.filter((r) => r.key !== key) }))}
        onMove={(i, dir) => setState((st) => ({ ...st, rows: moveAt(st.rows, i, dir) }))}
      >
        {(row) => <AffirmationFields api={api} row={row} set={set} />}
      </RowList>
      <Messages issues={api.shown("list.rows", true)} />
    </EditorFrame>
  );
}

function AffirmationFields({
  api,
  row,
  set,
}: {
  api: EditorApi<VfmState>;
  row: VfmRow;
  set: (key: string, patch: Partial<VfmFields>) => void;
}) {
  const existing = row.init !== undefined;
  const at = (f: string) => `${row.key}.${f}`;
  const answerId = useId();
  const answerIssues = api.shown(at("vrai"), existing);
  return (
    <>
      <Field label="Affirmation" issues={api.shown(at("texte"), existing)} onBlur={() => api.touch(at("texte"))}>
        {(p) => (
          <textarea
            {...p}
            rows={2}
            className={TEXTAREA_CLASS}
            value={row.f.texte}
            onChange={(e) => set(row.key, { texte: e.target.value })}
            placeholder="Ex. La France accueille plus de réfugiés que l'Allemagne."
          />
        )}
      </Field>
      <div className="space-y-1">
        <p id={answerId} className="text-xs font-medium">
          Réponse
        </p>
        <TrueFalseToggle
          size="sm"
          value={row.f.vrai}
          onChange={(v) => set(row.key, { vrai: v })}
          labelledBy={answerId}
          describedBy={answerIssues.length > 0 ? `${answerId}-msg` : undefined}
        />
        <Messages id={`${answerId}-msg`} issues={answerIssues} />
      </div>
      <Field
        label="Explication courte (facultative)"
        hint="Affichée quand le joueur touche « Pourquoi ? » à la révélation."
        issues={api.shown(at("why"), existing)}
        onBlur={() => api.touch(at("why"))}
      >
        {(p) => (
          <textarea
            {...p}
            rows={2}
            className={TEXTAREA_CLASS}
            value={row.f.why}
            onChange={(e) => set(row.key, { why: e.target.value })}
            placeholder="Ex. L'Allemagne accueille environ 2,5 millions de réfugiés (HCR 2024), la France environ 580 000."
          />
        )}
      </Field>
    </>
  );
}
