"use client";

import { Input } from "@/components/ui/input";
import { addCm, cmAnchors, CM_ADVISED_MAX, CM_MIN, type CmFields, type CmRow, type CmState, type CmTop } from "./curseur-multi";
import { MODELS } from "./formats";
import { moveAt, updateRow } from "./shared";
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

/// Palette automatique du player (question-curseur-multi.tsx), par position.
const AUTO_PALETTE = ["#7BB069", "var(--coral)", "var(--plum)", "var(--teal)", "var(--yellow)"];

export function CurseurMultiEditor({ initial }: { initial?: string | null }) {
  const api = usePayloadEditor(MODELS.curseur_multi, initial);
  const { state: s, setState } = api;
  const existingTop = s.init !== undefined;
  const setTop = (patch: Partial<CmTop>) => setState((st) => ({ ...st, top: { ...st.top, ...patch } }));
  const set = (key: string, patch: Partial<CmFields>) => setState((st) => ({ ...st, rows: updateRow(st.rows, key, patch) }));
  const anchors = cmAnchors(s);
  const unit = s.top.unite.trim();

  const topField = (name: keyof CmTop, label: string, placeholder: string, hint?: string) => (
    <Field
      label={label}
      hint={hint}
      issues={api.shown(`top.${name}`, existingTop)}
      onBlur={() => api.touch(`top.${name}`)}
    >
      {(p) => (
        <Input
          {...p}
          autoComplete="off"
          value={s.top[name]}
          onChange={(e) => setTop({ [name]: e.target.value } as Partial<CmTop>)}
          placeholder={placeholder}
        />
      )}
    </Field>
  );

  return (
    <EditorFrame
      api={api}
      intro={
        <>
          Le joueur voit une ligne graduée et des étiquettes à glisser dessus. Environ une étiquette sur quatre est
          posée d&apos;office à sa vraie place, comme repère. À la révélation, il compare ses positions aux vraies
          valeurs.
        </>
      }
      notices={s.foreign && <Notice>Le format de la question a changé : saisis l&apos;échelle et les étiquettes.</Notice>}
    >
      <section aria-labelledby="cm-echelle" className="space-y-3">
        <SectionTitle id="cm-echelle">Échelle</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {topField("min", "Début de l'échelle", "Ex. 0")}
          {topField("max", "Fin de l'échelle", "Ex. 50")}
          {topField("unite", "Unité (facultative)", "Ex. %, €, ans", "Affichée après chaque valeur.")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {topField(
            "labelMin",
            "Libellé du côté début (facultatif)",
            "Ex. Plus égalitaire",
            "Écrit sous l'extrémité gauche, pour donner le sens de l'échelle.",
          )}
          {topField("labelMax", "Libellé du côté fin (facultatif)", "Ex. Plus inégalitaire", "Écrit sous l'extrémité droite.")}
        </div>
      </section>

      <section aria-labelledby="cm-items" className="space-y-3">
        <SectionTitle id="cm-items">Étiquettes à placer</SectionTitle>
        <RowList
          rows={s.rows}
          label="Étiquettes à placer"
          itemTitle={(_, i) => `Étiquette ${i + 1}`}
          addLabel="Ajouter une étiquette"
          minRows={CM_MIN}
          maxRows={CM_ADVISED_MAX}
          badge={(row) => (anchors?.has(row.key) ? "repère" : null)}
          onAdd={() => {
            const next = addCm(s);
            setState(() => next);
            return next.rows[next.rows.length - 1].key;
          }}
          onRemove={(key) => setState((st) => ({ ...st, rows: st.rows.filter((r) => r.key !== key) }))}
          onMove={(i, dir) => setState((st) => ({ ...st, rows: moveAt(st.rows, i, dir) }))}
        >
          {(row, i) => <ItemFields api={api} row={row} index={i} unit={unit} set={set} />}
        </RowList>
        <Messages issues={api.shown("list.rows", true)} />
        <p className="text-xs text-muted-foreground" role="status">
          <AnchorsLine state={s} anchors={anchors} />
        </p>
      </section>
    </EditorFrame>
  );
}

function AnchorsLine({ state, anchors }: { state: CmState; anchors: Set<string> | null }) {
  const n = state.rows.length;
  if (n < 4) return <>Avec moins de 4 étiquettes, aucune n&apos;est posée d&apos;office : le joueur les place toutes.</>;
  if (anchors === null) return <>Les repères posés d&apos;office seront indiqués ici une fois toutes les valeurs remplies.</>;
  const names = state.rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => anchors.has(r.key))
    .map(({ r, i }) => r.f.label.trim() || `Étiquette ${i + 1}`);
  return (
    <>
      Posée{names.length > 1 ? "s" : ""} d&apos;office comme repère{names.length > 1 ? "s" : ""} :{" "}
      {names.map((name, i) => (
        <span key={name + i}>
          {i > 0 && ", "}« {name} »
        </span>
      ))}{" "}
      ({names.length} sur {n}, au milieu des vraies valeurs). Le joueur place les autres.
    </>
  );
}

function ItemFields({
  api,
  row,
  index,
  unit,
  set,
}: {
  api: EditorApi<CmState>;
  row: CmRow;
  index: number;
  unit: string;
  set: (key: string, patch: Partial<CmFields>) => void;
}) {
  const existing = row.init !== undefined;
  const at = (f: string) => `${row.key}.${f}`;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Field label="Texte de l'étiquette" issues={api.shown(at("label"), existing)} onBlur={() => api.touch(at("label"))}>
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={row.f.label}
            onChange={(e) => set(row.key, { label: e.target.value })}
            placeholder="Ex. Danemark"
          />
        )}
      </Field>
      <Field
        label={`Vraie valeur${unit ? ` (${unit})` : ""}`}
        issues={api.shown(at("valeur"), existing)}
        onBlur={() => api.touch(at("valeur"))}
      >
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={row.f.valeur}
            onChange={(e) => set(row.key, { valeur: e.target.value })}
            placeholder="Ex. 27"
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
