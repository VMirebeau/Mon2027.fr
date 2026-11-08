"use client";

import { useId, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MODELS } from "./formats";
import { addQcmChoice, QCM_MAX, QCM_MIN, removeQcmChoice, type AbState, type Choice, type QcmState } from "./simple";
import { CorrectToggle, EditorFrame, Field, Messages, Notice, TrueFalseToggle, usePayloadEditor, type EditorApi } from "./ui";

const LETTERS = "ABCDEFGHIJ";

// ---------------------------------------------------------------------------
// Vrai ou faux
// ---------------------------------------------------------------------------

export function VraiFauxEditor({ initial }: { initial?: string | null }) {
  const api = usePayloadEditor(MODELS.vrai_faux, initial);
  const labelId = useId();
  const issues = api.shown("top.value", api.state.init !== undefined);
  return (
    <EditorFrame
      api={api}
      intro={
        <>
          Le joueur lit la question, formulée comme une affirmation, et répond Vrai ou Faux. L&apos;explication est
          affichée à la révélation.
        </>
      }
      notices={api.state.foreign && <Notice>Le format de la question a changé : choisis la bonne réponse.</Notice>}
    >
      <div className="space-y-1">
        <p id={labelId} className="text-sm font-medium">
          Bonne réponse
        </p>
        <TrueFalseToggle
          value={api.state.value}
          onChange={(v) => api.setState((s) => ({ ...s, value: v }))}
          labelledBy={labelId}
          describedBy={issues.length > 0 ? `${labelId}-msg` : undefined}
        />
        <Messages id={`${labelId}-msg`} issues={issues} />
      </div>
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// A ou B
// ---------------------------------------------------------------------------

export function ABEditor({ initial }: { initial?: string | null }) {
  const api = usePayloadEditor(MODELS.ab, initial);
  const s = api.state;
  const existing = s.orig !== undefined;
  const setChoice = (i: 0 | 1, text: string) =>
    api.setState((st) => {
      const choices: AbState["choices"] = [st.choices[0], st.choices[1]];
      choices[i] = { ...choices[i], text };
      return { ...st, choices };
    });
  const setValeur = (i: 0 | 1, v: string) =>
    api.setState((st) => {
      const valeurs: [string, string] = [st.valeurs[0], st.valeurs[1]];
      valeurs[i] = v;
      return { ...st, valeurs };
    });

  return (
    <EditorFrame
      api={api}
      intro={
        <>
          Le joueur choisit entre deux cartes, A et B. Si tu donnes une valeur chiffrée à chacune, la révélation affiche
          une barre qui les compare.
        </>
      }
      notices={s.foreign && <Notice>Le format de la question a changé : les deux premiers choix sont repris, vérifie-les.</Notice>}
    >
      <ul className="space-y-3" aria-label="Choix A et B">
        {([0, 1] as const).map((i) => {
          const c = s.choices[i];
          const letter = LETTERS[i];
          return (
            <li key={c.key}>
              <ChoiceBox correct={s.correct === c.key}>
                <Field
                  label={`Choix ${letter}`}
                  className="flex-1"
                  issues={api.shown(`${c.key}.text`, existing)}
                  onBlur={() => api.touch(`${c.key}.text`)}
                >
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="off"
                      value={c.text}
                      onChange={(e) => setChoice(i, e.target.value)}
                      placeholder={i === 0 ? "Ex. Plus que l'Allemagne" : "Ex. Moins que l'Allemagne"}
                    />
                  )}
                </Field>
                <Field
                  label="Valeur (facultative)"
                  className="w-full sm:w-40"
                  issues={api.shown(`o${i}.valeur`, existing)}
                  onBlur={() => api.touch(`o${i}.valeur`)}
                >
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="off"
                      value={s.valeurs[i]}
                      onChange={(e) => setValeur(i, e.target.value)}
                      placeholder={i === 0 ? "Ex. 97" : "Ex. 47"}
                    />
                  )}
                </Field>
                <div className="sm:pt-5">
                  <CorrectToggle
                    pressed={s.correct === c.key}
                    choiceLabel={`Choix ${letter}`}
                    onClick={() => api.setState((st) => ({ ...st, correct: c.key }))}
                  />
                </div>
              </ChoiceBox>
            </li>
          );
        })}
      </ul>
      <Messages issues={[...api.shown("list.correct", existing), ...api.shown("list.valeurs", true)]} />
      <Field
        label="Unité des valeurs (facultative)"
        hint="Affichée à côté de chaque valeur dans la barre comparative. Ex. €/hab/an, g CO₂/kWh, %."
        issues={api.shown("top.unite", existing)}
        onBlur={() => api.touch("top.unite")}
      >
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={s.unite}
            onChange={(e) => api.setState((st) => ({ ...st, unite: e.target.value }))}
            placeholder="Ex. €/hab/an"
          />
        )}
      </Field>
    </EditorFrame>
  );
}

function ChoiceBox({ correct, children }: { correct: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-3 transition-colors sm:flex-row sm:items-start ${
        correct
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
          : "bg-muted/30"
      }`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QCM
// ---------------------------------------------------------------------------

export function QCMEditor({ initial }: { initial?: string | null }) {
  const api = usePayloadEditor(MODELS.qcm, initial);
  const s = api.state;
  const existing = s.orig !== undefined;
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const focusLater = (fn: () => void) => requestAnimationFrame(fn);
  const remove = (i: number, key: string) => {
    api.setState((st) => removeQcmChoice(st, key));
    const next = s.choices[i + 1]?.key ?? s.choices[i - 1]?.key;
    focusLater(() => {
      const el = next ? listRef.current?.querySelector<HTMLElement>(`[data-row="${next}"] input`) : null;
      (el ?? addRef.current)?.focus();
    });
  };
  const add = () => {
    const next = addQcmChoice(s);
    api.setState(() => next);
    const key = next.choices[next.choices.length - 1].key;
    focusLater(() => listRef.current?.querySelector<HTMLElement>(`[data-row="${key}"] input`)?.focus());
  };

  return (
    <EditorFrame
      api={api}
      intro={
        <>
          Le joueur voit les choix dans cet ordre (A, B, C…) et en sélectionne un seul. Chaque mauvais choix doit
          correspondre à une erreur crédible.
        </>
      }
      notices={
        <>
          {s.foreign && <Notice>Le format de la question a changé : les choix sont repris, vérifie-les.</Notice>}
          {existing && (
            <p className="text-xs text-muted-foreground">
              Les réponses déjà données renvoient à la position des choix : sur une question déjà jouée, corrige le
              texte d&apos;un choix plutôt que d&apos;en supprimer un.
            </p>
          )}
        </>
      }
    >
      <ul ref={listRef} className="space-y-3" aria-label="Choix">
        {s.choices.map((c, i) => (
          <li key={c.key} data-row={c.key}>
            <QcmChoice
              api={api}
              choice={c}
              letter={LETTERS[i] ?? String(i + 1)}
              existing={existing && c.init !== undefined}
              onRemove={s.choices.length > QCM_MIN ? () => remove(i, c.key) : undefined}
            />
          </li>
        ))}
      </ul>
      {s.choices.length < QCM_MAX && (
        <Button ref={addRef} type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Ajouter un choix
        </Button>
      )}
      <Messages issues={[...api.shown("list.correct", existing), ...api.shown("list.choix", true)]} />
      <p className="text-xs text-muted-foreground">
        Entre {QCM_MIN} et {QCM_MAX} choix, dont une seule bonne réponse.
      </p>
    </EditorFrame>
  );
}

function QcmChoice({
  api,
  choice,
  letter,
  existing,
  onRemove,
}: {
  api: EditorApi<QcmState>;
  choice: Choice;
  letter: string;
  existing: boolean;
  onRemove?: () => void;
}) {
  const correct = api.state.correct === choice.key;
  const at = `${choice.key}.text`;
  return (
    <ChoiceBox correct={correct}>
      <Field label={`Choix ${letter}`} className="flex-1" issues={api.shown(at, existing)} onBlur={() => api.touch(at)}>
        {(p) => (
          <Input
            {...p}
            autoComplete="off"
            value={choice.text}
            onChange={(e) =>
              api.setState((st) => ({
                ...st,
                choices: st.choices.map((c) => (c.key === choice.key ? { ...c, text: e.target.value } : c)),
              }))
            }
            placeholder="Texte du choix"
          />
        )}
      </Field>
      <div className="flex items-center gap-2 sm:pt-5">
        <CorrectToggle
          pressed={correct}
          choiceLabel={`Choix ${letter}`}
          onClick={() => api.setState((st) => ({ ...st, correct: choice.key }))}
        />
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={`Supprimer le choix ${letter}`}
            title="Supprimer ce choix"
          >
            <Trash2 className="h-4 w-4 text-rose-600" />
          </Button>
        )}
      </div>
    </ChoiceBox>
  );
}
