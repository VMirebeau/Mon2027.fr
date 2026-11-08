"use client";

import { Input } from "@/components/ui/input";
import {
  addCategory,
  addEtiquette,
  CAT_ADVISED_MAX,
  CAT_MIN,
  ETQ_ADVISED_MAX,
  ETQ_MIN,
  type CatRow,
  type CatState,
  type EtqFields,
  type EtqRow,
} from "./categorisation";
import { MODELS } from "./formats";
import { moveAt, updateRow } from "./shared";
import {
  EditorFrame,
  Field,
  Messages,
  NativeSelect,
  Notice,
  RowList,
  SectionTitle,
  TEXTAREA_CLASS,
  usePayloadEditor,
  type EditorApi,
} from "./ui";

export function CategorisationEditor({ initial }: { initial?: string | null }) {
  const api = usePayloadEditor(MODELS.categorisation, initial);
  const { state: s, setState } = api;
  const setEtq = (key: string, patch: Partial<EtqFields>) =>
    setState((st) => ({ ...st, etqs: updateRow(st.etqs, key, patch) }));

  return (
    <EditorFrame
      api={api}
      intro={
        <>
          Le joueur voit les éléments dans l&apos;ordre de la liste et glisse chacun dans une des catégories. À la
          révélation, chaque élément montre sa bonne catégorie et sa précision. Pense à alterner les catégories dans
          la liste plutôt que de les regrouper.
        </>
      }
      notices={
        <>
          {s.legacy && (
            <Notice tone="warning">
              Cette question est enregistrée dans un ancien format que le jeu ne lit pas : elle n&apos;apparaît pas aux
              joueurs. Vérifie les catégories ci-dessous puis enregistre pour la convertir au format actuel (les
              identifiants internes sont conservés).
            </Notice>
          )}
          {s.foreign && <Notice>Le format de la question a changé : saisis les catégories et les éléments à classer.</Notice>}
        </>
      }
    >
      <section aria-labelledby="cat-cats" className="space-y-3">
        <SectionTitle id="cat-cats">Catégories</SectionTitle>
        <RowList
          rows={s.cats}
          label="Catégories"
          itemTitle={(_, i) => `Catégorie ${i + 1}`}
          addLabel="Ajouter une catégorie"
          minRows={CAT_MIN}
          maxRows={CAT_ADVISED_MAX}
          onAdd={() => {
            const next = addCategory(s);
            setState(() => next);
            return next.cats[next.cats.length - 1].key;
          }}
          onRemove={(key) => setState((st) => ({ ...st, cats: st.cats.filter((c) => c.key !== key) }))}
          onMove={(i, dir) => setState((st) => ({ ...st, cats: moveAt(st.cats, i, dir) }))}
        >
          {(row) => <CategoryFields api={api} row={row} />}
        </RowList>
        <Messages issues={api.shown("list.cats", true)} />
      </section>

      <section aria-labelledby="cat-etqs" className="space-y-3">
        <SectionTitle id="cat-etqs">Éléments à classer</SectionTitle>
        <RowList
          rows={s.etqs}
          label="Éléments à classer"
          itemTitle={(_, i) => `Élément ${i + 1}`}
          addLabel="Ajouter un élément"
          minRows={ETQ_MIN}
          maxRows={ETQ_ADVISED_MAX}
          onAdd={() => {
            const next = addEtiquette(s);
            setState(() => next);
            return next.etqs[next.etqs.length - 1].key;
          }}
          onRemove={(key) => setState((st) => ({ ...st, etqs: st.etqs.filter((e) => e.key !== key) }))}
          onMove={(i, dir) => setState((st) => ({ ...st, etqs: moveAt(st.etqs, i, dir) }))}
        >
          {(row) => <EtiquetteFields api={api} row={row} cats={s.cats} set={setEtq} />}
        </RowList>
        <Messages issues={api.shown("list.etqs", true)} />
      </section>
    </EditorFrame>
  );
}

function CategoryFields({ api, row }: { api: EditorApi<CatState>; row: CatRow }) {
  const at = `${row.key}.label`;
  return (
    <Field label="Nom de la catégorie" issues={api.shown(at, row.init !== undefined)} onBlur={() => api.touch(at)}>
      {(p) => (
        <Input
          {...p}
          autoComplete="off"
          value={row.f.label}
          onChange={(e) =>
            api.setState((st) => ({ ...st, cats: updateRow(st.cats, row.key, { label: e.target.value }) }))
          }
          placeholder="Ex. Possède des médias"
        />
      )}
    </Field>
  );
}

function EtiquetteFields({
  api,
  row,
  cats,
  set,
}: {
  api: EditorApi<CatState>;
  row: EtqRow;
  cats: CatRow[];
  set: (key: string, patch: Partial<EtqFields>) => void;
}) {
  const existing = row.init !== undefined;
  const at = (f: string) => `${row.key}.${f}`;
  const current = row.f.cat !== null && cats.some((c) => c.key === row.f.cat) ? row.f.cat : "";
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Élément" issues={api.shown(at("texte"), existing)} onBlur={() => api.touch(at("texte"))}>
          {(p) => (
            <Input
              {...p}
              autoComplete="off"
              value={row.f.texte}
              onChange={(e) => set(row.key, { texte: e.target.value })}
              placeholder="Ex. Bernard Arnault"
            />
          )}
        </Field>
        <Field label="Bonne catégorie" issues={api.shown(at("cat"), existing)} onBlur={() => api.touch(at("cat"))}>
          {(p) => (
            <NativeSelect {...p} value={current} onChange={(e) => set(row.key, { cat: e.target.value || null })}>
              <option value="">Choisir…</option>
              {cats.map((c, i) => (
                <option key={c.key} value={c.key}>
                  {c.f.label.trim() || `Catégorie ${i + 1} (sans nom)`}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <Field
        label="Précision (facultative)"
        hint="Détail affiché à la révélation (ex. la source ou le chiffre qui justifie la catégorie)."
        issues={api.shown(at("note"), existing)}
        onBlur={() => api.touch(at("note"))}
      >
        {(p) => (
          <textarea
            {...p}
            rows={1}
            className={TEXTAREA_CLASS}
            value={row.f.note}
            onChange={(e) => set(row.key, { note: e.target.value })}
            placeholder="Ex. le chiffre ou la règle qui justifie la catégorie"
          />
        )}
      </Field>
    </>
  );
}
