"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  THEMES,
  FORMATS,
  STATUTS,
  SENSIBILITES,
  DIFFICULTES,
  type FormatValue,
} from "@/lib/constants";
import type { ActionResult } from "@/lib/actions";
import { SourcesEditor, type SourceRow } from "./SourcesEditor";
import { IndicatorsEditor, type IndicatorRow } from "./IndicatorsEditor";
import { PayloadEditor } from "./PayloadEditor";
import { PreviewButton } from "./PreviewButton";
import { EmDashNotice } from "./EmDashNotice";
import { useDirty, useMarkDirtyOnChange } from "./DirtyProvider";
import { GuardedLink } from "./GuardedLink";
import { indicatorsError, sourceErrors, unplacedErrors } from "./form-errors";
import { submitWithoutReset } from "../../_components/submit-without-reset";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";

type Props = {
  initial?: {
    id?: string;
    customId?: string | null;
    slug?: string | null;
    theme: string;
    sousTheme?: string | null;
    format: FormatValue;
    statut: string;
    sensibilite: string;
    difficulte: number;
    question: string;
    precisions?: string | null;
    explication: string;
    contextePedagogique?: string | null;
    unite?: string | null;
    plageMin?: number | null;
    plageMax?: number | null;
    reponseNumerique?: number | null;
    toleranceVerte?: number | null;
    toleranceOrange?: number | null;
    payload?: string | null;
    dateDonnee?: number | null;
    auteur: string;
    valideurs?: string | null;
    sources: SourceRow[];
    miseEnPerspective?: string | null;
    indicators?: IndicatorRow[];
  };
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  /// updatedAt (ms) de la version chargée : le serveur refuse d'enregistrer
  /// si quelqu'un a modifié la question entre-temps (verrou optimiste).
  baseVersion?: string;
  /// Statuts que le rôle courant peut choisir (les autres sont grisés).
  statutOptions?: readonly string[];
  /// Si défini, formulaire en lecture seule avec cette explication.
  readOnlyReason?: string;
  /// Si défini, code et adresse courte grisés avec cette explication (question
  /// déjà publiée : les réponses et défis des joueurs y font référence).
  identifiersLockedReason?: string;
  reviewNav?: {
    label: string;
    current: number | null;
    total: number;
    outOfFilter: boolean;
    prevHref: string | null;
    nextHref: string | null;
    exitHref: string;
  };
};

/// Attributs à poser sur la saisie d'un champ : lien avec son libellé, son
/// aide et son erreur (lecteurs d'écran), état invalide.
type ControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const hintId = hint ? `${id}-aide` : undefined;
  const errorId = error ? `${id}-erreur` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5" data-invalid={error ? "true" : undefined}>
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-muted-foreground">(facultatif)</span>}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && (
        <p id={errorId} className="text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-titre`} className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
      <div className="space-y-1">
        <h2 id={`${id}-titre`} className="text-base font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/// Bordure rouge sur les saisies d'un bloc marqué `data-invalid` (éditeur
/// des réponses, qui ne passe pas par <Field>).
const INVALID_FIELD =
  "data-[invalid=true]:[&_input]:border-rose-500 data-[invalid=true]:[&_textarea]:border-rose-500 data-[invalid=true]:[&_[data-slot=select-trigger]]:border-rose-500";

const LOCKED_INPUT = "cursor-not-allowed bg-muted text-muted-foreground";

const THEME_ITEMS = THEMES.map((t) => ({ value: t, label: t }));

/// Amène la personne au premier bloc en erreur et y place le curseur : sur un
/// long formulaire, l'erreur était souvent hors de l'écran. Les réglages
/// avancés repliés sont ouverts s'ils contiennent l'erreur.
function scrollToFirstError(form: HTMLFormElement | null) {
  const target = form?.querySelector<HTMLElement>('[data-invalid="true"]');
  if (!target) return;
  const details = target.closest("details");
  if (details && !details.open) details.open = true;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target
    .querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button')
    ?.focus({ preventScroll: true });
}

/// Valideurs stockés en JSON (liste de noms) ou, pour les anciennes
/// questions, en texte libre.
function formatValideurs(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.join(", ") : String(parsed);
  } catch {
    return raw;
  }
}

const versionKey = (p: Props) => `${p.initial?.id ?? "nouvelle"}@${p.baseVersion ?? ""}`;

/// Le formulaire suit la version de la question chargée par la page.
///
/// - Sans modification locale en cours, une nouvelle version côté serveur
///   (publication depuis le panneau, changement d'un autre contributeur
///   révélé par un rafraîchissement) recharge le formulaire. Sans ça, le
///   statut affiché restait « En revue » après « Valider et publier », et un
///   simple « Enregistrer » dépubliait la question.
/// - Avec des modifications en cours, on garde la version de départ ET sa
///   base de verrou : l'enregistrement signale alors le conflit au lieu
///   d'écraser le travail de l'autre. (Avant, `baseVersion` suivait la page :
///   le moindre rafraîchissement — un message posté — désarmait le verrou.)
/// - Après son propre enregistrement, la base devient la version renvoyée
///   par le serveur, sans recharger ni perdre le message « Enregistré ».
export function QuestionForm(props: Props) {
  const { dirty } = useDirty();
  const [loaded, setLoaded] = useState(props);
  const [base, setBase] = useState(props.baseVersion);
  const [seen, setSeen] = useState(() => versionKey(props));

  const incoming = versionKey(props);
  if (incoming !== seen) {
    setSeen(incoming);
    const otherQuestion = props.initial?.id !== loaded.initial?.id;
    if (otherQuestion || (props.baseVersion !== base && !dirty)) {
      setLoaded(props);
      setBase(props.baseVersion);
    }
  }

  const serverAction = props.action;
  const action = useCallback(
    async (prev: ActionResult | null, formData: FormData) => {
      const res = await serverAction(prev, formData);
      if (res.ok && res.version) setBase(res.version);
      return res;
    },
    [serverAction],
  );

  return (
    <QuestionFormBody
      key={versionKey(loaded)}
      {...loaded}
      action={action}
      baseVersion={base}
      reviewNav={props.reviewNav}
      statutOptions={props.statutOptions}
      identifiersLockedReason={props.identifiersLockedReason}
      liveValideurs={props.initial?.valideurs ?? null}
    />
  );
}

/// Navigation de la revue (questions filtrées) : reste en haut de l'écran.
function ReviewBar({ nav }: { nav: NonNullable<Props["reviewNav"]> }) {
  const arrow = (href: string | null, label: string, icon: ReactNode) =>
    href ? (
      <GuardedLink
        href={href}
        className={buttonVariants({ variant: "outline", size: "icon-sm" })}
        aria-label={label}
      >
        {icon}
      </GuardedLink>
    ) : (
      <span
        aria-disabled="true"
        className={`${buttonVariants({ variant: "outline", size: "icon-sm" })} pointer-events-none opacity-40`}
      >
        {icon}
      </span>
    );
  return (
    <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 text-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <span className="font-medium text-amber-900 dark:text-amber-300">{nav.label}</span>
      <span className="text-muted-foreground">
        {nav.outOfFilter
          ? `hors filtre · ${nav.total} restant${nav.total > 1 ? "es" : "e"}`
          : `${nav.current} / ${nav.total}`}
      </span>
      <div className="ml-1 flex items-center gap-1">
        {arrow(nav.prevHref, "Question précédente", <ChevronLeft className="h-4 w-4" />)}
        {arrow(nav.nextHref, "Question suivante", <ChevronRight className="h-4 w-4" />)}
        <GuardedLink
          href={nav.exitHref}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label="Quitter la revue"
        >
          <X className="mr-1 h-4 w-4" /> Quitter
        </GuardedLink>
      </div>
    </div>
  );
}

function QuestionFormBody({
  initial,
  action,
  submitLabel,
  reviewNav,
  baseVersion,
  statutOptions,
  readOnlyReason,
  identifiersLockedReason,
  liveValideurs,
}: Props & { liveValideurs: string | null }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null
  );
  const [theme, setTheme] = useState<string>(initial?.theme ?? "");
  const [format, setFormat] = useState<FormatValue>(initial?.format ?? "estimation_numerique");
  const [statut, setStatut] = useState<string>(initial?.statut ?? "brouillon");
  const [sensibilite, setSensibilite] = useState<string>(initial?.sensibilite ?? "standard");
  const [difficulte, setDifficulte] = useState<string>(String(initial?.difficulte ?? 3));
  const errors = state?.errors ?? {};
  const errorCount = Object.keys(errors).length;
  const unplaced = unplacedErrors(errors, format);
  const indicatorsErr = indicatorsError(errors);
  const formRef = useRef<HTMLFormElement>(null);
  const readOnly = !!readOnlyReason;

  const { dirty, setDirty } = useDirty();

  // Les selects contrôlés ne déclenchent pas onChange sur le <form>.
  useMarkDirtyOnChange(`${theme}|${format}|${statut}|${sensibilite}|${difficulte}`);

  // Reset dirty après save réussi.
  useEffect(() => {
    if (state?.ok) setDirty(false);
  }, [state, setDirty]);

  // Enregistrement refusé : déplier les réglages avancés s'ils contiennent
  // une erreur, puis aller au premier champ à corriger.
  useEffect(() => {
    if (!state || state.ok) return;
    formRef.current?.querySelectorAll("details").forEach((d) => {
      if (d.querySelector('[data-invalid="true"]')) d.open = true;
    });
    scrollToFirstError(formRef.current);
  }, [state]);

  const formatMeta = FORMATS.find((f) => f.value === format);
  const statutMeta = STATUTS.find((s) => s.value === statut);
  const sensibiliteMeta = SENSIBILITES.find((s) => s.value === sensibilite);
  const canPublishHere = !statutOptions || statutOptions.includes("publie");
  const isEstimation = format === "estimation_numerique";

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={() => setDirty(true)}
      // Pas de réinitialisation par React après l'action : un enregistrement
      // refusé ne doit pas effacer la saisie (cf. submit-without-reset).
      onSubmit={submitWithoutReset(formAction)}
      className="space-y-6"
    >
      {baseVersion && <input type="hidden" name="baseVersion" value={baseVersion} />}
      {reviewNav && <ReviewBar nav={reviewNav} />}
      {readOnlyReason && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {readOnlyReason}
        </p>
      )}

      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-6 border-0 p-0">
        {unplaced.length > 0 && (
          <div
            data-invalid="true"
            className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
          >
            <ul className="list-disc space-y-1 pl-5">
              {unplaced.map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 1. Contenu : ce que le joueur lit et joue. */}
        <Section id="question" title="La question" description="Ce que le joueur lit, et comment il répond.">
          <Field
            id="q-format"
            label="Type de question"
            error={errors.format}
            hint={`${formatMeta?.hint ?? ""} Le bloc « Réponse attendue » s'adapte au type choisi.`}
          >
            {(control) => (
              <Select
                name="format"
                items={FORMATS}
                value={format}
                onValueChange={(v) => setFormat(v as FormatValue)}
              >
                <SelectTrigger {...control} className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field
            id="q-question"
            label="Question"
            error={errors.question}
            hint="Le texte que le joueur lit en grand. Une phrase courte, compréhensible en 5 secondes, sans jargon ni parenthèse."
          >
            {(control) => (
              <Textarea
                {...control}
                name="question"
                defaultValue={initial?.question ?? ""}
                rows={2}
                placeholder="Ex : Quel pourcentage de la population française est immigré ?"
              />
            )}
          </Field>
          <Field
            id="q-precisions"
            label="Précisions"
            optional
            error={errors.precisions}
            hint="Le joueur peut les ouvrir sous la question (bouton « ⓘ Précisions ») : définition d'un terme, période, périmètre, unité. Sert à garder la question courte."
          >
            {(control) => (
              <Textarea {...control} name="precisions" defaultValue={initial?.precisions ?? ""} rows={2} />
            )}
          </Field>
        </Section>

        <Section
          id="reponse"
          title="Réponse attendue"
          description={
            isEstimation
              ? "Le curseur proposé au joueur et la vraie valeur, révélée après sa réponse."
              : "Les choix proposés au joueur et la bonne réponse."
          }
        >
          {isEstimation ? (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="q-reponse"
                label="Vraie valeur"
                error={errors.reponseNumerique}
                hint="La bonne réponse, montrée au joueur après son choix."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    step="any"
                    name="reponseNumerique"
                    defaultValue={initial?.reponseNumerique ?? ""}
                    placeholder="10.3"
                  />
                )}
              </Field>
              <Field
                id="q-unite"
                label="Unité"
                optional
                error={errors.unite}
                hint="Affichée à côté des chiffres. Court : %, M€, jours."
              >
                {(control) => (
                  <Input {...control} name="unite" defaultValue={initial?.unite ?? ""} placeholder="%" />
                )}
              </Field>
              <Field
                id="q-plage-min"
                label="Bas du curseur"
                error={errors.plageMin}
                hint="Plus petite valeur que le joueur peut choisir."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    step="any"
                    name="plageMin"
                    defaultValue={initial?.plageMin ?? ""}
                    placeholder="0"
                  />
                )}
              </Field>
              <Field
                id="q-plage-max"
                label="Haut du curseur"
                error={errors.plageMax}
                hint="Plus grande valeur. Laisse de la marge des deux côtés de la vraie valeur : une plage trop serrée trahit la réponse."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    step="any"
                    name="plageMax"
                    defaultValue={initial?.plageMax ?? ""}
                    placeholder="50"
                  />
                )}
              </Field>
              <Field
                id="q-tolerance-verte"
                label="Marge « Bien vu »"
                optional
                error={errors.toleranceVerte}
                hint="Écart à la vraie valeur jusqu'auquel le joueur lit « Bien vu ». Vide : 5 % de la largeur du curseur."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    step="any"
                    name="toleranceVerte"
                    defaultValue={initial?.toleranceVerte ?? ""}
                    placeholder="2"
                  />
                )}
              </Field>
              <Field
                id="q-tolerance-orange"
                label="Marge « Pas loin »"
                optional
                error={errors.toleranceOrange}
                hint="Écart jusqu'auquel le joueur lit « Pas loin ». Vide : 15 % de la largeur du curseur."
              >
                {(control) => (
                  <Input
                    {...control}
                    type="number"
                    step="any"
                    name="toleranceOrange"
                    defaultValue={initial?.toleranceOrange ?? ""}
                    placeholder="5"
                  />
                )}
              </Field>
            </div>
          ) : (
            <div className={`space-y-2 ${INVALID_FIELD}`} data-invalid={errors.payload ? "true" : undefined}>
              <PayloadEditor key={format} format={format} initial={initial?.payload ?? null} />
              {errors.payload && <p className="text-xs font-medium text-rose-600">{errors.payload}</p>}
            </div>
          )}
        </Section>

        <Section
          id="explications"
          title="Explications"
          description="Ce que le joueur lit après avoir répondu, dans le dossier de la question."
        >
          <Field
            id="q-explication"
            label="Explication"
            error={errors.explication}
            hint="Première section du dossier (« Le chiffre, en détail ») : ce que dit la donnée, comment elle est mesurée, ses limites. C'est le moment pédagogique."
          >
            {(control) => (
              <Textarea {...control} name="explication" defaultValue={initial?.explication ?? ""} rows={4} />
            )}
          </Field>
          <Field
            id="q-perspective"
            label="Mise en perspective"
            optional
            error={errors.miseEnPerspective}
            hint="1 à 3 phrases courtes pour situer le chiffre dans le temps (vs 1990, dernière décennie) ou l'espace (vs Allemagne, UE, OCDE). Section « Mise en perspective » du dossier."
          >
            {(control) => (
              <Textarea
                {...control}
                name="miseEnPerspective"
                defaultValue={initial?.miseEnPerspective ?? ""}
                rows={3}
              />
            )}
          </Field>
          <Field
            id="q-contexte"
            label="Contexte pédagogique"
            optional
            error={errors.contextePedagogique}
            hint="Note pour l'équipe : pourquoi la question compte (idée reçue, biais médiatique…). Pas montrée aux joueurs."
          >
            {(control) => (
              <Textarea
                {...control}
                name="contextePedagogique"
                defaultValue={initial?.contextePedagogique ?? ""}
                rows={3}
              />
            )}
          </Field>
        </Section>

        <Section
          id="sources"
          title="Sources"
          description="Listées en bas du dossier, cliquables par le joueur. Au moins une source primaire (INSEE, Eurostat, OCDE, ministère, Cour des comptes, recherche à comité de lecture) ; jamais un think tank orienté."
        >
          <SourcesEditor initial={initial?.sources ?? []} errors={sourceErrors(errors)} />
          <div className="sm:w-64">
            <Field
              id="q-date-donnee"
              label="Année de la donnée"
              optional
              error={errors.dateDonnee}
              hint="Année à laquelle le chiffre se rapporte. Sert à repérer les chiffres à actualiser ; pas affichée aux joueurs."
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  name="dateDonnee"
                  defaultValue={initial?.dateDonnee ?? ""}
                  placeholder="2023"
                  min={1900}
                  max={2100}
                />
              )}
            </Field>
          </div>
        </Section>

        {/* 2. Rangement : où la question se range. */}
        <Section id="rangement" title="Rangement" description="Où la question se range, dans le jeu et dans la banque.">
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Field
              id="q-theme"
              label="Thème"
              error={errors.theme}
              hint="Affiché au joueur avec la question ; sert aussi à filtrer la banque."
            >
              {(control) => (
                <Select name="theme" items={THEME_ITEMS} value={theme} onValueChange={(v) => setTheme(v ?? "")}>
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue placeholder="Choisir…" />
                  </SelectTrigger>
                  <SelectContent>
                    {THEMES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field
              id="q-sous-theme"
              label="Sous-thème"
              optional
              error={errors.sousTheme}
              hint="Pour s'y retrouver dans la banque. Pas affiché aux joueurs."
            >
              {(control) => (
                <Input
                  {...control}
                  name="sousTheme"
                  defaultValue={initial?.sousTheme ?? ""}
                  placeholder="Ex : Démographie"
                />
              )}
            </Field>
            <Field
              id="q-difficulte"
              label="Difficulté"
              error={errors.difficulte}
              hint="Affichée au joueur (points sur 5). Les débutants reçoivent surtout des questions faciles."
            >
              {(control) => (
                <Select
                  name="difficulte"
                  items={DIFFICULTES}
                  value={difficulte}
                  onValueChange={(v) => setDifficulte(v ?? "3")}
                >
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field
              id="q-sensibilite"
              label="Sensibilité"
              error={errors.sensibilite}
              hint={`${sensibiliteMeta?.hint ?? ""} Indication pour l'équipe, pas montrée aux joueurs.`}
            >
              {(control) => (
                <Select
                  name="sensibilite"
                  items={SENSIBILITES}
                  value={sensibilite}
                  onValueChange={(v) => setSensibilite(v ?? "standard")}
                >
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENSIBILITES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
        </Section>

        <Section
          id="suivi"
          title="Statut et suivi"
          description={
            initial?.id
              ? "Où en est la question. La validation par un relecteur se fait dans le panneau « Validation de cette version »."
              : "Où en est la question. Une fois la question créée, un relecteur la valide depuis sa fiche."
          }
        >
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
            <Field
              id="q-statut"
              label="Statut"
              error={errors.statut}
              hint={
                <>
                  {statutMeta?.hint}
                  {!canPublishHere &&
                    " Pour publier : passe la question « En revue », un relecteur la valide puis la publie."}
                </>
              }
            >
              {(control) => (
                <Select
                  name="statut"
                  items={STATUTS}
                  value={statut}
                  onValueChange={(v) => setStatut(v ?? "brouillon")}
                >
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUTS.map((s) => (
                      <SelectItem
                        key={s.value}
                        value={s.value}
                        disabled={
                          !!statutOptions && !statutOptions.includes(s.value) && s.value !== initial?.statut
                        }
                      >
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field
              id="q-auteur"
              label="Auteur"
              error={errors.auteur}
              hint="Qui a rédigé la question. Pour l'équipe, pas affiché aux joueurs."
            >
              {(control) => (
                <Input {...control} name="auteur" defaultValue={initial?.auteur ?? ""} placeholder="pseudo" />
              )}
            </Field>
            <Field id="q-valideurs" label="Valideurs" hint="Rempli automatiquement à la publication.">
              {(control) => (
                <Input {...control} value={formatValideurs(liveValideurs)} placeholder="–" readOnly disabled />
              )}
            </Field>
          </div>
        </Section>

        {/* 3. Réglages avancés, repliés : rarement utiles à la rédaction.
            Le contenu replié reste envoyé avec le formulaire. */}
        <details className="group rounded-xl border border-dashed bg-muted/30">
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-6 [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
              aria-hidden
            />
            <span>
              <span className="block text-base font-semibold">Réglages avancés</span>
              <span className="block text-sm text-muted-foreground">
                Code de la question, adresse courte, indicateurs du portrait.
              </span>
            </span>
          </summary>
          <div className="space-y-6 border-t border-dashed px-4 pt-5 pb-6 sm:px-6">
            {/* readOnly et non disabled : un champ disabled n'est pas envoyé,
                et le serveur y verrait une suppression du code. */}
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <Field
                id="q-code"
                label="Code de la question"
                optional
                error={errors.customId}
                hint={
                  identifiersLockedReason ??
                  "Identifiant stable, ex. Q-IMM-001. Les réponses des joueurs, les défis et les propositions y font référence."
                }
              >
                {(control) => (
                  <Input
                    {...control}
                    name="customId"
                    defaultValue={initial?.customId ?? ""}
                    placeholder="Q-XXX-NNN"
                    readOnly={!!identifiersLockedReason}
                    className={identifiersLockedReason ? LOCKED_INPUT : undefined}
                  />
                )}
              </Field>
              <Field
                id="q-slug"
                label="Adresse courte"
                optional
                error={errors.slug}
                hint={
                  identifiersLockedReason ??
                  "Adresse publique de la question : mon2027.fr/q/… Minuscules et tirets. Vide : fabriquée à partir du texte de la question."
                }
              >
                {(control) => (
                  <Input
                    {...control}
                    name="slug"
                    defaultValue={initial?.slug ?? ""}
                    placeholder="ex. pourcentage-immigres-france"
                    readOnly={!!identifiersLockedReason}
                    className={identifiersLockedReason ? LOCKED_INPUT : undefined}
                  />
                )}
              </Field>
            </div>

            <div className="space-y-3" data-invalid={indicatorsErr ? "true" : undefined}>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Indicateurs du portrait</h3>
                <p className="text-sm text-muted-foreground">
                  Le portrait du joueur résume ses erreurs sur 9 axes qui traversent les thèmes (par
                  exemple « Tu surestimes la précarité des plus modestes »). Indique sur quels axes cette
                  question pèse, 3 au plus, et dans quel sens.
                </p>
              </div>
              <IndicatorsEditor initial={initial?.indicators ?? []} format={format} disabled={readOnly} />
              {indicatorsErr && <p className="text-xs font-medium text-rose-600">{indicatorsErr}</p>}
            </div>
          </div>
        </details>
      </fieldset>

      {/* Barre d'actions : reste en bas de l'écran pendant la saisie. Hors du
          <fieldset> : l'aperçu reste possible en lecture seule. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:bottom-4 sm:mx-0 sm:rounded-xl sm:border sm:shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            {statutMeta && (
              <Badge className={statutMeta.color}>
                <span className="sr-only">Statut : </span>
                {statutMeta.label}
              </Badge>
            )}
            <div aria-live="polite" className="min-w-0">
              {state && !state.ok ? (
                errorCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => scrollToFirstError(formRef.current)}
                    className="inline-flex items-center gap-1.5 rounded-sm text-left font-medium text-rose-700 underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-rose-400"
                    title="Aller au premier champ à corriger"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    Enregistrement impossible : {errorCount} champ{errorCount > 1 ? "s" : ""} à corriger
                  </button>
                ) : (
                  <span role="alert" className="inline-flex max-w-2xl items-start gap-1.5 text-rose-700 dark:text-rose-400">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    {state.message ?? "Enregistrement impossible"}
                  </span>
                )
              ) : readOnly ? (
                <span className="text-muted-foreground">Lecture seule</span>
              ) : dirty ? (
                <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Modifications non enregistrées
                </span>
              ) : state?.ok ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {state.message ?? "Enregistré"}
                </span>
              ) : (
                <span className="text-muted-foreground">À jour</span>
              )}
            </div>
            <EmDashNotice />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <GuardedLink href="/" className={buttonVariants({ variant: "ghost" })}>
              Annuler
            </GuardedLink>
            <PreviewButton />
            <Button type="submit" disabled={pending || readOnly}>
              {pending ? "Enregistrement…" : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
