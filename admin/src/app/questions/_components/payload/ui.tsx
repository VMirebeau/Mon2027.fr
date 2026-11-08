"use client";

/// Briques d'interface partagées par les éditeurs de « Réponse attendue ».

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useMarkDirtyOnChange } from "../DirtyProvider";
import type { Model } from "./formats";
import { COLOR_OPTIONS, parsePayload, swatchOf, type Issue, type ParsedPayload } from "./shared";

// ---------------------------------------------------------------------------
// État d'un éditeur
// ---------------------------------------------------------------------------

export type EditorApi<S> = {
  state: S;
  setState: (fn: (s: S) => S) => void;
  payload: unknown;
  serialized: string;
  issues: Issue[];
  preserved: string[];
  parsed: ParsedPayload;
  /// Marque un champ comme visité (ses manques deviennent visibles).
  touch: (at: string) => void;
  /// Problèmes à afficher pour un champ. `existing` : contenu déjà enregistré,
  /// dont les manques s'affichent d'emblée.
  shown: (at: string, existing: boolean) => Issue[];
  revealAll: boolean;
  setRevealAll: (v: boolean) => void;
};

export function usePayloadEditor<S>(model: Model<S>, initial: string | null | undefined): EditorApi<S> {
  const [parsed] = useState(() => parsePayload(initial));
  const [state, setRaw] = useState<S>(() => model.parse(parsed.obj));
  const payload = useMemo(() => model.serialize(state), [model, state]);
  const serialized = useMemo(() => JSON.stringify(payload), [payload]);
  const issues = useMemo(() => model.validate(state), [model, state]);
  const preserved = useMemo(() => model.preserved(state), [model, state]);
  // Boutons, ajouts, suppressions : seul le champ caché change.
  useMarkDirtyOnChange(serialized);

  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [revealAll, setRevealAll] = useState(false);

  const touch = useCallback(
    (at: string) => setTouched((s) => (s.has(at) ? s : new Set(s).add(at))),
    [],
  );
  const shown = useCallback(
    (at: string, existing: boolean) =>
      issues.filter((i) => i.at === at && (!i.missing || revealAll || existing || touched.has(at))),
    [issues, revealAll, touched],
  );
  const setState = useCallback((fn: (s: S) => S) => setRaw(fn), []);

  return {
    state,
    setState,
    payload,
    serialized,
    issues,
    preserved,
    parsed,
    touch,
    shown,
    revealAll,
    setRevealAll,
  };
}

// ---------------------------------------------------------------------------
// Cadre commun : aide, avertissements, résumé, format technique, champ caché
// ---------------------------------------------------------------------------

export function EditorFrame<S>({
  api,
  intro,
  notices,
  children,
}: {
  api: EditorApi<S>;
  intro: ReactNode;
  notices?: ReactNode;
  children: ReactNode;
}) {
  const errors = api.issues.filter((i) => i.level === "error");
  const hidden = errors.some((i) => i.missing) && !api.revealAll;
  const inputRef = useRef<HTMLInputElement>(null);
  const { setRevealAll } = api;

  // Une tentative d'enregistrement révèle tous les champs à compléter.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onSubmit = () => setRevealAll(true);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [setRevealAll]);

  return (
    <div className="space-y-4">
      <input ref={inputRef} type="hidden" name="payload" value={api.serialized} />
      <p className="text-sm text-muted-foreground">{intro}</p>
      {api.parsed.status === "invalid" && (
        <Notice>
          La réponse enregistrée est illisible : l&apos;éditeur repart de zéro. Le contenu d&apos;origine
          reste visible dans « Voir le format technique » tant que tu n&apos;as pas enregistré.
        </Notice>
      )}
      {notices}
      {children}
      {errors.length > 0 && (
        <p className="text-xs text-muted-foreground" role="status">
          {errors.length === 1 ? "1 point à compléter ou corriger" : `${errors.length} points à compléter ou corriger`}{" "}
          avant de soumettre à la relecture.
          {hidden && (
            <>
              {" "}
              <button
                type="button"
                className="rounded-sm font-medium text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => api.setRevealAll(true)}
              >
                Les afficher
              </button>
            </>
          )}
        </p>
      )}
      <TechnicalView api={api} />
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <p
      className={cn(
        "rounded-md border p-3 text-sm",
        tone === "warning"
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200",
      )}
    >
      {children}
    </p>
  );
}

/// Accès en lecture seule au JSON envoyé, pour un cas imprévu.
function TechnicalView<S>({ api }: { api: EditorApi<S> }) {
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Voir le format technique
      </summary>
      <div className="mt-2 space-y-2">
        <p>Lecture seule : c&apos;est ce qui sera enregistré.</p>
        <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
          {JSON.stringify(api.payload, null, 2)}
        </pre>
        {api.preserved.length > 0 && (
          <p>
            Données non utilisées par le jeu, conservées telles quelles :{" "}
            {api.preserved.map((k, i) => (
              <span key={k}>
                {i > 0 && ", "}
                <code>{k}</code>
              </span>
            ))}
            .
          </p>
        )}
        {api.parsed.status === "invalid" && (
          <>
            <p>Contenu d&apos;origine (illisible) :</p>
            <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px]">
              {api.parsed.raw}
            </pre>
          </>
        )}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Champs
// ---------------------------------------------------------------------------

export type FieldProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function Field({
  label,
  hint,
  issues,
  onBlur,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  issues: Issue[];
  onBlur?: () => void;
  className?: string;
  children: (p: FieldProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-aide`;
  const msgId = `${id}-msg`;
  const describedBy = [issues.length > 0 ? msgId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className={cn("space-y-1", className)} onBlur={onBlur}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children({
        id,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": issues.some((i) => i.level === "error") || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <Messages id={msgId} issues={issues} />
    </div>
  );
}

export function Messages({ id, issues }: { id?: string; issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <div id={id} className="space-y-0.5">
      {issues.map((i) => (
        <p
          key={i.message}
          className={cn(
            "text-xs",
            i.level === "error" ? "text-rose-600 dark:text-rose-400" : "text-amber-700 dark:text-amber-400",
          )}
        >
          {i.message}
        </p>
      ))}
    </div>
  );
}

/// <select> natif : accessible au clavier sans effort, et sans `name` (seul
/// le champ caché `payload` est envoyé).
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30",
        className,
      )}
    />
  );
}

export const TEXTAREA_CLASS =
  "flex field-sizing-content min-h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30";

/// Choix de couleur : « Automatique » (palette du jeu selon la position) ou
/// une couleur nommée. Une valeur enregistrée hors palette reste proposée.
export function ColorSelect({
  value,
  autoColor,
  onChange,
  ...p
}: FieldProps & { value: string; autoColor: string; onChange: (v: string) => void }) {
  const custom = value !== "" && !COLOR_OPTIONS.some((c) => c.value === value);
  const autoLabel = COLOR_OPTIONS.find((c) => c.value === autoColor)?.label.toLowerCase();
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block size-4 shrink-0 rounded-full border"
        style={{ background: swatchOf(value || autoColor) }}
      />
      <NativeSelect {...p} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Automatique{autoLabel ? ` (${autoLabel})` : ""}</option>
        {COLOR_OPTIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
        {custom && <option value={value}>Personnalisée ({value})</option>}
      </NativeSelect>
    </div>
  );
}

/// Vrai / Faux : deux boutons bascule (Tab puis Entrée ou Espace).
export function TrueFalseToggle({
  value,
  onChange,
  labelledBy,
  describedBy,
  size = "default",
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  labelledBy: string;
  describedBy?: string;
  size?: "default" | "sm";
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex gap-2">
      {[true, false].map((v) => (
        <Button
          key={String(v)}
          type="button"
          size={size}
          variant={value === v ? "default" : "outline"}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className="min-w-20 flex-1 sm:flex-none"
        >
          {value === v && <Check className="mr-1 h-4 w-4" aria-hidden />}
          {v ? "Vrai" : "Faux"}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listes éditables
// ---------------------------------------------------------------------------

type ListRow = { key: string };

/// Liste d'éléments avec ajout, suppression et réordonnancement. Le focus
/// clavier suit l'élément déplacé, passe à l'élément suivant après une
/// suppression et au premier champ d'un élément ajouté.
export function RowList<R extends ListRow>({
  rows,
  label,
  itemTitle,
  addLabel,
  onAdd,
  onRemove,
  onMove,
  minRows,
  maxRows,
  reorder = true,
  badge,
  children,
}: {
  rows: readonly R[];
  /// Nom de la liste pour les lecteurs d'écran (ex. « Affirmations »).
  label: string;
  /// Titre d'un élément (ex. « Affirmation 2 »).
  itemTitle: (row: R, index: number) => string;
  addLabel: string;
  /// Ajoute un élément et renvoie sa clé.
  onAdd: () => string;
  onRemove: (key: string) => void;
  onMove?: (index: number, dir: -1 | 1) => void;
  minRows: number;
  maxRows?: number;
  reorder?: boolean;
  /// Mention courte affichée en pastille et lue avec le titre (ex. « repère »).
  badge?: (row: R, index: number) => string | null;
  children: (row: R, index: number) => ReactNode;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<null | (() => void)>(null);

  // Le focus se replace une fois le DOM mis à jour.
  useEffect(() => {
    if (!pending.current) return;
    const run = pending.current;
    pending.current = null;
    run();
  });

  const focusIn = (key: string, selector: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${key}"] ${selector}`);
    el?.focus();
    return !!el;
  };

  const move = (i: number, dir: -1 | 1, key: string) => {
    onMove?.(i, dir);
    const action = dir === -1 ? "up" : "down";
    const other = dir === -1 ? "down" : "up";
    pending.current = () => {
      const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-row="${key}"] [data-action="${action}"]`);
      if (btn && !btn.disabled) btn.focus();
      else focusIn(key, `[data-action="${other}"]`);
    };
  };

  const remove = (i: number, key: string) => {
    onRemove(key);
    const next = rows[i + 1]?.key ?? rows[i - 1]?.key;
    pending.current = () => {
      if (!next || !focusIn(next, `[data-action="remove"]`)) {
        if (next) focusIn(next, "input, textarea, select");
        else addRef.current?.focus();
      }
    };
  };

  const add = () => {
    const key = onAdd();
    pending.current = () => focusIn(key, "input, textarea, select");
  };

  const canRemove = rows.length > minRows;
  return (
    <div className="space-y-3">
      <ol ref={listRef} aria-label={label} className="space-y-3">
        {rows.map((row, i) => {
          const title = itemTitle(row, i);
          const tag = badge?.(row, i) ?? null;
          return (
            <li key={row.key} data-row={row.key} className="rounded-md border bg-muted/30 p-3">
              <fieldset className="m-0 min-w-0 space-y-3 border-0 p-0">
                <legend className="sr-only">{tag ? `${title}, ${tag}` : title}</legend>
                <div className="flex items-center justify-between gap-2">
                  <p aria-hidden className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {title}
                    {tag && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                        {tag}
                      </span>
                    )}
                  </p>
                  <div className="flex gap-1">
                    {reorder && onMove && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={i === 0}
                          data-action="up"
                          onClick={() => move(i, -1, row.key)}
                          aria-label={`Monter : ${title}`}
                          title="Monter"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={i === rows.length - 1}
                          data-action="down"
                          onClick={() => move(i, 1, row.key)}
                          aria-label={`Descendre : ${title}`}
                          title="Descendre"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {canRemove && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        data-action="remove"
                        onClick={() => remove(i, row.key)}
                        aria-label={`Supprimer : ${title}`}
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    )}
                  </div>
                </div>
                {children(row, i)}
              </fieldset>
            </li>
          );
        })}
      </ol>
      {(maxRows === undefined || rows.length < maxRows) && (
        <Button ref={addRef} type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> {addLabel}
        </Button>
      )}
    </div>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-sm font-semibold">
      {children}
    </h3>
  );
}

/// Bouton « bonne réponse » d'un choix (A/B, QCM) : bascule exclusive.
export function CorrectToggle({
  pressed,
  onClick,
  choiceLabel,
}: {
  pressed: boolean;
  onClick: () => void;
  choiceLabel: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "outline"}
      aria-pressed={pressed}
      aria-label={`${choiceLabel} : bonne réponse`}
      onClick={onClick}
      className="min-w-[9.5rem] flex-1 sm:flex-none"
    >
      {pressed ? (
        <>
          <Check className="mr-1 h-4 w-4" aria-hidden /> Bonne réponse
        </>
      ) : (
        "Marquer bonne réponse"
      )}
    </Button>
  );
}
