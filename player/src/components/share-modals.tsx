"use client";

/// Modals de partage utilisées par le récap (desktop + mobile) :
///   - `ShareQuestionModal` : clic sur une carte → partage d'UNE question
///     via son URL /q/[slug]. Cf. lien public, pas de comparaison.
///   - `ShareSessionModal` : clic sur "Défier" → crée un défi côté serveur
///     (POST /api/defis avec source=session) et partage le /d/[shortCode]
///     pour faire rejouer la session entière. Le créateur peut comparer
///     ses scores avec l'ami une fois qu'il aura joué.
///
/// Avant : la modal de partage de question était inline dans
/// format-shared.tsx (sous le nom `ShareModal`) — accessible uniquement
/// depuis l'action bar pendant la phase reveal. Et le partage de session
/// passait par une scène entière (defi-create) avec wizard 4 étapes.
/// Ici on les met en commun pour le récap, qui a juste besoin de modales
/// légères (pas de wizard).

import { useState, type ReactNode } from "react";
import { useCanNativeShare } from "@/lib/use-client-only";
import { Modal } from "./modal";
import { FavoriteToggle } from "./favorite-toggle";
import { slugForQuestion } from "@/lib/question-slug";
import {
  type AnsweredItem,
  createSessionReplayDefi,
  factFigure,
} from "@/lib/recap-helpers";
import { closenessOf, CLOSENESS_COLOR } from "@/lib/closeness";
import { useAuth } from "@/lib/use-auth";
import { useProgress } from "@/lib/use-progress";
import { computeLevel, computeXp } from "@/lib/gamification";
import { copyToClipboard } from "@/lib/clipboard";
import { QrDisplay } from "./qr-display";
import type {
  CategorisationQuestion,
  ClassementQuestion,
  CurseurMultiQuestion,
  PondereQuestion,
  Question,
  VraiFauxMultiQuestion,
} from "@/lib/types";

/// Libellé eyebrow du bloc réponse, en fonction du format. Avant on
/// affichait "Chiffre-clé" partout — faux sens pour les V/F ("Faux" n'est
/// pas un chiffre), les A/B et QCM (un label texte) et les classements
/// (un Top-N). Cette fonction couvre les 3 formats single-value (estim/
/// vraifaux/ab/qcm), les composites passant par renderStructuredAnswer
/// avec leurs propres labels.
function answerKeyLabel(format: Question["format"]): string {
  switch (format) {
    case "estimation":
      return "Chiffre-clé";
    case "vraifaux":
      return "Réponse";
    case "ab":
    case "qcm":
      return "Bonne réponse";
    case "classement":
      return "Top 1";
    // Composites : ces formats sont gérés par renderStructuredAnswer qui
    // a ses propres en-têtes ("Bons appariements", "Allocation correcte",
    // etc.). Si on tombe ici en fallback, "Réponse" reste neutre.
    case "vraifaux_multi":
    case "curseur_multi":
    case "categorisation":
    case "pondere":
    default:
      return "Réponse";
  }
}

// ============================================================================
// ShareQuestionModal — partage d'UNE question (clic carte récap)
// ============================================================================

export function ShareQuestionModal({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  /// `null` quand la modal est fermée (transition CSS) — on garde la modal
  /// montée pour éviter le flash de contenu pendant la fermeture.
  item: AnsweredItem | null;
}) {
  const [copied, setCopied] = useState(false);
  const hasNativeShare = useCanNativeShare();

  if (!open || !item) return null;
  const { q, answer } = item;
  const slug = slugForQuestion(q);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/q/${slug}`
      : `/q/${slug}`;
  // Couleur de proximité (proche / tiède / loin) pour teinter la pastille
  // d'affichage de la réponse — donne du contexte au coup d'œil sur ce qui
  // s'est passé pour cette question.
  const closeness = closenessOf(q, answer);
  const closenessColor = CLOSENESS_COLOR[closeness];
  // Format composite (plusieurs sous-réponses dans le bloc Réponse) → on
  // élargit la modal. Sans ça, "vrai/faux multi 4 affirmations", la grille
  // de catégorisation ou un classement de 6 items rendaient un mur de
  // texte qui retournait à la ligne à chaque mot. Le seuil `md` (460px)
  // suffit pour V/F/AB/QCM/estimation qui n'ont qu'une valeur unique.
  const isComposite =
    q.format === "vraifaux_multi" ||
    q.format === "curseur_multi" ||
    q.format === "categorisation" ||
    q.format === "pondere" ||
    q.format === "classement";
  const modalSize = isComposite ? "lg" : "md";

  async function copyLink() {
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
    // En cas d'échec (très rare avec le fallback execCommand), on laisse
    // l'utilisateur sélectionner manuellement le `.share-modal-url` qui a
    // `user-select: all`.
  }

  async function nativeShare() {
    try {
      await navigator.share({
        title: q.question,
        text: "Un chiffre civique sourcé sur Mon2027 :",
        url,
      });
      onClose();
    } catch {
      /* user a annulé ou erreur : on reste sur la modal */
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Partager cette question"
      size={modalSize}
    >
      <div className="share-modal-body">
        <div className="share-modal-eyebrow">Cette question</div>
        {/* Titre + étoile favori en row : l'étoile reste collée au titre
            qu'elle qualifie (« marquer cette question en favori ») plutôt
            qu'à l'eyebrow de section. `padding-right` réserve l'espace du
            bouton × close absolu du modal parent. */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            paddingRight: 32,
          }}
        >
          <h3 className="share-modal-title" style={{ flex: 1, minWidth: 0 }}>
            {q.question}
          </h3>
          <FavoriteToggle
            questionId={q.id}
            size="md"
            ariaLabel="Ajouter aux favoris pour la retrouver dans Réviser"
          />
        </div>

        {/* Affichage de la réponse correcte : pastille colorée par la
            closeness (vert/orange/rouge selon ta perf). Le label "Réponse"
            est en mono discret au-dessus pour que la valeur soit ce qui
            saute aux yeux. Avant on cachait la réponse — pas une bonne
            idée puisque l'utilisateur l'a déjà vue en jouant et qu'elle
            sert ici de "carte mémoire" de la question.
            Pour les formats composites (categorisation, pondere,
            classement, vraifaux_multi, curseur_multi), `factFigure` ne
            donne au mieux qu'UN chiffre de la question (le n°1, la plus
            grosse part, la plage des valeurs), voire rien : ce n'est pas
            toute la réponse. `renderStructuredAnswer` produit alors un bloc
            structuré (mapping bin→items, allocation par catégorie, etc.)
            à la place de la pastille single-value. */}
        {renderStructuredAnswer(q, closenessColor.bg, closenessColor.border) ?? (
          <div
            className="share-modal-answer"
            style={{
              background: closenessColor.bg,
              borderColor: closenessColor.border,
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
              }}
            >
              {answerKeyLabel(q.format)}
            </div>
            <div
              style={{
                marginTop: 4,
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 28,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
                fontVariantNumeric: "tabular-nums",
                wordBreak: "break-word",
              }}
            >
              {factFigure(q)}
            </div>
          </div>
        )}

        <p className="share-modal-sub">
          Le lien envoie tes proches direct sur cette question : ils peuvent
          jouer puis voir l&apos;explication.
        </p>

        <div className="share-modal-url" title={url}>
          {url}
        </div>

        <div className="share-modal-actions">
          <button
            type="button"
            className="share-modal-primary"
            onClick={copyLink}
            data-copied={copied ? "true" : "false"}
          >
            {copied ? "Lien copié ✓" : "Copier le lien"}
          </button>
          {hasNativeShare ? (
            <button
              type="button"
              className="share-modal-secondary"
              onClick={nativeShare}
            >
              Partager via…
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

/// Dispatch : pour les formats composites, retourne un bloc « réponse »
/// structuré (mapping/allocation/liste) qui remplace la pastille
/// single-value de factFigure. Pour les formats simples (estimation, ab,
/// vraifaux, qcm), retourne null → le caller affiche la pastille
/// standard avec factFigure(q).
function renderStructuredAnswer(
  q: Question,
  bg: string,
  borderColor: string,
): ReactNode | null {
  if (q.format === "categorisation") {
    return <CategorisationAnswerBlock q={q} bg={bg} borderColor={borderColor} />;
  }
  if (q.format === "pondere") {
    return <PondereAnswerBlock q={q} bg={bg} borderColor={borderColor} />;
  }
  if (q.format === "classement") {
    return <ClassementAnswerBlock q={q} bg={bg} borderColor={borderColor} />;
  }
  if (q.format === "vraifaux_multi") {
    return <VraiFauxMultiAnswerBlock q={q} bg={bg} borderColor={borderColor} />;
  }
  if (q.format === "curseur_multi") {
    return <CurseurMultiAnswerBlock q={q} bg={bg} borderColor={borderColor} />;
  }
  return null;
}

/// Wrapper commun pour tous les blocs structurés : reprend exactement le
/// style de la pastille `.share-modal-answer` (background teinté
/// closeness, border colorée) avec l'eyebrow « Réponse » en mono. Les
/// blocs spécifiques par format y rendent leur liste d'items.
function StructuredAnswerWrap({
  bg,
  borderColor,
  children,
}: {
  bg: string;
  borderColor: string;
  children: ReactNode;
}) {
  return (
    <div
      className="share-modal-answer"
      style={{ background: bg, borderColor }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
        }}
      >
        Réponse
      </div>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/// Ligne d'item utilisée par tous les blocs structurés : un eyebrow mono
/// (label de catégorie/bin/position…) au-dessus d'une valeur serif
/// (l'item lui-même ou la valeur réelle). Garde une grammaire visuelle
/// commune entre les 5 formats composites.
function StructuredRow({
  eyebrow,
  value,
}: {
  eyebrow: string;
  value: ReactNode;
}) {
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          fontWeight: 600,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          marginTop: 2,
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          lineHeight: 1.35,
          color: "var(--ink)",
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/// Bloc « réponse » spécifique au format categorisation : remplace la
/// pastille single-value « 5 items ». On groupe les items par bin (chaque
/// bin devient une ligne avec sa liste d'items), ce qui correspond à la
/// vraie réponse de la question. Conserve la pastille teintée par la
/// closeness pour rester visuellement cohérent avec les autres formats.
function CategorisationAnswerBlock({
  q,
  bg,
  borderColor,
}: {
  q: CategorisationQuestion;
  bg: string;
  borderColor: string;
}) {
  return (
    <StructuredAnswerWrap bg={bg} borderColor={borderColor}>
      {q.bins.map((bin) => {
        const items = q.items.filter((it) => it.correct === bin.id);
        if (items.length === 0) return null;
        return (
          <StructuredRow
            key={bin.id}
            eyebrow={bin.label}
            value={items.map((it) => it.label).join(" · ")}
          />
        );
      })}
    </StructuredAnswerWrap>
  );
}

/// Pondéré : factFigure ne donne que la plus grosse part réelle. On
/// affiche à la place l'allocation réelle par
/// catégorie — c'est ÇA la réponse attendue. Catégories triées par
/// allocation décroissante : ce qui « pèse le plus » se lit en premier.
function PondereAnswerBlock({
  q,
  bg,
  borderColor,
}: {
  q: PondereQuestion;
  bg: string;
  borderColor: string;
}) {
  const sorted = [...q.categories].sort((a, b) => b.real - a.real);
  return (
    <StructuredAnswerWrap bg={bg} borderColor={borderColor}>
      {sorted.map((cat) => (
        <StructuredRow
          key={cat.id}
          eyebrow={cat.label}
          value={
            <>
              {cat.real}
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-soft)",
                  fontWeight: 500,
                  marginLeft: 4,
                  fontFamily: "var(--font-mono)",
                }}
              >
                pts
              </span>
            </>
          }
        />
      ))}
    </StructuredAnswerWrap>
  );
}

/// Classement : factFigure ne donne que le chiffre du n°1 (quand il
/// existe). On affiche l'ordre réel, numéroté, comme dans le reveal.
function ClassementAnswerBlock({
  q,
  bg,
  borderColor,
}: {
  q: ClassementQuestion;
  bg: string;
  borderColor: string;
}) {
  return (
    <StructuredAnswerWrap bg={bg} borderColor={borderColor}>
      {q.correctOrder.map((id, i) => {
        const item = q.items.find((x) => x.id === id);
        if (!item) return null;
        return (
          <StructuredRow
            key={id}
            eyebrow={`Position ${i + 1}`}
            value={
              <>
                {item.label}
                {item.figure ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--ink-soft)",
                      fontWeight: 500,
                      marginLeft: 6,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {item.figure}
                  </span>
                ) : null}
              </>
            }
          />
        );
      })}
    </StructuredAnswerWrap>
  );
}

/// Vrai/Faux multi : factFigure ne renvoie rien (pas de chiffre dans la
/// question). On affiche chaque énoncé avec son verdict V/F à droite — la mémoire
/// utile est de savoir QUELLE affirmation est vraie/fausse.
function VraiFauxMultiAnswerBlock({
  q,
  bg,
  borderColor,
}: {
  q: VraiFauxMultiQuestion;
  bg: string;
  borderColor: string;
}) {
  return (
    <StructuredAnswerWrap bg={bg} borderColor={borderColor}>
      {q.statements.map((s, i) => (
        <div
          key={s.id}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="mono"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-mute)",
                fontWeight: 600,
              }}
            >
              Affirmation {String.fromCharCode(65 + i)}
            </div>
            <div
              style={{
                marginTop: 2,
                fontFamily: "var(--font-serif)",
                fontSize: 13.5,
                lineHeight: 1.35,
                color: "var(--ink)",
                fontWeight: 500,
              }}
            >
              {s.text}
            </div>
          </div>
          <span
            className="mono"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              // La vérité de l'affirmation, en encre : la couleur rouge/verte
              // est réservée à juste/faux du joueur, pas à la valeur Vrai/Faux.
              color: "var(--ink)",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {s.correct ? "Vrai" : "Faux"}
          </span>
        </div>
      ))}
    </StructuredAnswerWrap>
  );
}

/// Curseur multi : factFigure retourne la plage min–max (informative
/// mais incomplète). On affiche chaque item avec sa valeur réelle — c'est
/// l'info que le joueur cherche à retenir question par question.
function CurseurMultiAnswerBlock({
  q,
  bg,
  borderColor,
}: {
  q: CurseurMultiQuestion;
  bg: string;
  borderColor: string;
}) {
  const unit = q.unit ?? "";
  return (
    <StructuredAnswerWrap bg={bg} borderColor={borderColor}>
      {q.items.map((it) => (
        <StructuredRow
          key={it.id}
          eyebrow={it.label}
          value={
            <>
              {it.real.toLocaleString("fr-FR")}
              {unit ? (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--ink-soft)",
                    fontWeight: 500,
                    marginLeft: 4,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {unit}
                </span>
              ) : null}
            </>
          }
        />
      ))}
    </StructuredAnswerWrap>
  );
}

// ============================================================================
// ShareSessionModal — création d'un défi "replay session"
// ============================================================================

type SessionState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ready"; shortCode: string; url: string }
  | { kind: "error"; message: string };

export function ShareSessionModal({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  /// Items répondus de la session (cf. `getAnsweredItems`). Le POST
  /// /api/defis exige 3..10 questions ; on suppose que le call site ne
  /// rend ce composant qu'au-dessus de ce seuil (cf. recap-dt.tsx qui
  /// gate sur `>=3`).
  items: AnsweredItem[];
}) {
  const { user } = useAuth();
  const { progress, hydrated } = useProgress();
  const [state, setState] = useState<SessionState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [pseudoOverride, setPseudoOverride] = useState("");
  /// Pour un utilisateur connecté, l'input du pseudo est replié par défaut
  /// (on connaît déjà son displayPseudo, pas la peine de redemander). Il
  /// peut le déplier via le lien "modifier" pour personnaliser ce défi-ci.
  /// Pour un anonyme, l'input est toujours visible (le pseudo est requis
  /// avant d'avoir un fallback côté serveur).
  const [pseudoExpanded, setPseudoExpanded] = useState(false);
  /// Titre libre facultatif. Aide le militant à classer ses défis dans
  /// "Tes défis" et donne un contexte au destinataire (s'affiche en
  /// citation sous le bandeau de la page welcome).
  const [title, setTitle] = useState("");
  const hasNativeShare = useCanNativeShare();

  // À la fermeture, on reset l'état pour qu'une réouverture ne montre pas
  // le résultat du défi précédent (qui pourrait correspondre à une autre
  // session si l'utilisateur a relancé une partie entre temps). Ajusté
  // pendant le rendu quand `open` change (motif React recommandé).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setState({ kind: "idle" });
      setCopied(false);
      setPseudoOverride("");
      setPseudoExpanded(false);
      setTitle("");
    }
  }

  if (!open) return null;

  async function generate() {
    setState({ kind: "creating" });
    const pseudo = pseudoOverride.trim() || user?.displayPseudo;
    const levelRank = hydrated
      ? computeLevel(computeXp(progress)).current.rank
      : null;
    const result = await createSessionReplayDefi(items, pseudo, title, levelRank);
    if (!result) {
      setState({
        kind: "error",
        message:
          "Création du lien impossible (réseau, validation, ou rate-limit). Réessaie dans une minute.",
      });
      return;
    }
    setState({ kind: "ready", ...result });
  }

  async function copyLink() {
    if (state.kind !== "ready") return;
    const ok = await copyToClipboard(state.url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  async function nativeShare() {
    if (state.kind !== "ready") return;
    try {
      await navigator.share({
        title: "Un défi Mon2027",
        text: `${pseudoOverride.trim() || user?.displayPseudo || "Quelqu'un"} t'a préparé ${items.length} questions sourcées sur la France :`,
        url: state.url,
      });
      onClose();
    } catch {
      /* user a annulé ou erreur : on reste sur la modal */
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Défier un proche"
      size="md"
    >
      <div className="share-modal-body">
        <div className="share-modal-eyebrow">Défier un proche</div>
        <h3 className="share-modal-title">
          {items.length} questions, le même test.
        </h3>
        <p className="share-modal-sub">
          On crée un lien personnel : ton proche joue exactement les mêmes
          questions que toi, puis tu pourras comparer vos réponses.
        </p>

        {state.kind === "idle" ? (
          <>
            {/* Pseudo : si connecté ET non-déplié, on affiche juste un
                récap "Tu envoies comme X · modifier" pour éviter la friction
                de redemander un champ déjà connu. Sinon (anonyme OU déplié),
                input éditable plein format. */}
            {user && !pseudoExpanded ? (
              <div className="share-modal-identity">
                <span>
                  Tu envoies sous le nom de{" "}
                  <strong>{user.displayPseudo}</strong>
                </span>
                <button
                  type="button"
                  className="share-modal-link"
                  onClick={() => setPseudoExpanded(true)}
                >
                  modifier
                </button>
              </div>
            ) : (
              <label className="share-modal-field">
                <span>Ton prénom (affiché à ton proche)</span>
                <input
                  type="text"
                  value={pseudoOverride}
                  placeholder={user?.displayPseudo ?? "Anonyme"}
                  onChange={(e) => setPseudoOverride(e.target.value)}
                  maxLength={30}
                  autoFocus={!user}
                />
              </label>
            )}
            {/* Titre libre : facultatif. Vide → on n'envoie rien, seul le
                label thématique calculé côté serveur parlera. Cap 60 chars
                en miroir de defi.ts MAX_TITLE. */}
            <label className="share-modal-field">
              <span>Titre du défi · facultatif</span>
              <input
                type="text"
                value={title}
                placeholder="Ex. Pour ma sœur sceptique sur le climat"
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
              />
            </label>
            <div className="share-modal-actions">
              <button
                type="button"
                className="share-modal-primary"
                onClick={generate}
              >
                Créer le lien
              </button>
            </div>
          </>
        ) : null}

        {state.kind === "creating" ? (
          <div className="share-modal-actions">
            <button
              type="button"
              className="share-modal-primary"
              disabled
              data-loading="true"
            >
              Création du lien…
            </button>
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <>
            <div className="share-modal-url" title={state.url}>
              {state.url}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                margin: "8px 0 4px",
              }}
            >
              <QrDisplay
                value={state.url}
                size={140}
                label="Scanner pour ouvrir le défi"
              />
            </div>
            <div className="share-modal-actions">
              <button
                type="button"
                className="share-modal-primary"
                onClick={copyLink}
                data-copied={copied ? "true" : "false"}
              >
                {copied ? "Lien copié ✓" : "Copier le lien"}
              </button>
              {hasNativeShare ? (
                <button
                  type="button"
                  className="share-modal-secondary"
                  onClick={nativeShare}
                >
                  Partager via…
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {state.kind === "error" ? (
          <>
            <p className="share-modal-error">{state.message}</p>
            <div className="share-modal-actions">
              <button
                type="button"
                className="share-modal-primary"
                onClick={generate}
              >
                Réessayer
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
