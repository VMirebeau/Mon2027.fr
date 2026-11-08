"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { useAuth } from "@/lib/use-auth";
import {
  GENERAL_SUGGESTION_KINDS,
  QUESTION_SUGGESTION_KINDS,
  SUGGESTION_LIMITS,
} from "@/lib/suggestions";
import styles from "./suggestion-modal.module.css";

type Target = { id: string; question: string };

/// « insee.fr » → « https://insee.fr » : on complète le schéma au lieu de
/// laisser le navigateur bloquer l'envoi avec « Veuillez saisir une URL ».
/// Vide reste vide ; un schéma déjà présent (« http:// », « https:// »…)
/// est conservé.
function withScheme(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  return /^[a-z][a-z0-9+.-]*:[/][/]/i.test(v) ? v : `https://${v.replace(/^[/]+/, "")}`;
}
type SendState = { k: "idle" } | { k: "sending" } | { k: "sent" } | { k: "error"; message: string };

/// Fenêtre « proposer une amélioration ». Avec `target`, la proposition porte
/// sur cette question (erreur, source, formulation) ; sans, c'est une idée de
/// nouvelle question ou une remarque générale. Rien n'est publié : la
/// proposition part dans la file de l'espace contributeurs.
export function SuggestionModal({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target?: Target;
}) {
  const kinds = target ? QUESTION_SUGGESTION_KINDS : GENERAL_SUGGESTION_KINDS;
  const [kind, setKind] = useState<string>(kinds[0].value);
  const [message, setMessage] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<SendState>({ k: "idle" });
  const { user } = useAuth();

  function close() {
    onClose();
    if (state.k === "sent") {
      setMessage("");
      setSourceUrl("");
      setKind(kinds[0].value);
      setState({ k: "idle" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = withScheme(sourceUrl);
    if (url !== sourceUrl) setSourceUrl(url);
    setState({ k: "sending" });
    try {
      const r = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, questionId: target?.id, message, sourceUrl: url, website }),
      });
      if (r.ok) {
        setState({ k: "sent" });
        return;
      }
      const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      setState({ k: "error", message: j?.error?.message ?? "Envoi impossible pour le moment. Réessaie plus tard." });
    } catch {
      setState({ k: "error", message: "Pas de connexion. Réessaie quand tu es en ligne." });
    }
  }

  const tooShort = message.trim().length < SUGGESTION_LIMITS.messageMin;
  const placeholder =
    kind === "nouvelle_question"
      ? "Quelle idée reçue mériterait une question ? Si tu l'as, donne le vrai chiffre et sa source."
      : kind === "source"
        ? "Quelle source ajouter ou corriger, et pourquoi ?"
        : "Qu'est-ce qui te semble faux ou discutable ? Plus c'est précis, plus c'est vite corrigé.";

  return (
    <Modal open={open} onClose={close} ariaLabel="Proposer une amélioration" size="md">
      <div className="share-modal-body">
        <div className="share-modal-eyebrow">{target ? "Cette question" : "Contribuer"}</div>
        {state.k === "sent" ? (
          <>
            <h3 className="share-modal-title">Merci !</h3>
            <p className="share-modal-sub">
              Ta proposition est arrivée chez les contributeurs. Ils la vérifient source en main avant de corriger quoi
              que ce soit : c&apos;est ce qui garantit la fiabilité des chiffres.
            </p>
            <div className="share-modal-actions">
              <button type="button" className="share-modal-primary" onClick={close}>
                Fermer
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <h3 className="share-modal-title">
              {target ? "Signaler une erreur ou proposer mieux" : "Proposer une question"}
            </h3>
            {target ? (
              <p className={`share-modal-sub ${styles.quote}`}>« {target.question} »</p>
            ) : (
              <p className="share-modal-sub">
                Pour une erreur sur une question précise, utilise plutôt le lien sous ses sources : la question sera
                jointe automatiquement.
              </p>
            )}

            <fieldset className={styles.kinds}>
              <legend className={styles.legend}>De quoi s&apos;agit-il ?</legend>
              {kinds.map((k) => (
                <label key={k.value} className={styles.kind} data-checked={kind === k.value || undefined}>
                  <input
                    type="radio"
                    name="kind"
                    value={k.value}
                    checked={kind === k.value}
                    onChange={() => setKind(k.value)}
                  />
                  {k.label}
                </label>
              ))}
            </fieldset>

            <label className="share-modal-field">
              <span>Ton message</span>
              <textarea
                className={styles.textarea}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={placeholder}
                rows={5}
                maxLength={SUGGESTION_LIMITS.messageMax}
                required
              />
            </label>

            <label className="share-modal-field">
              <span>Lien vers une source · facultatif</span>
              {/* type="text" + inputMode="url" : clavier d'URL sur mobile,
                  sans la validation native qui refusait « insee.fr ». Le
                  schéma est complété à la sortie du champ et à l'envoi. */}
              <input
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                onBlur={() => setSourceUrl((v) => withScheme(v))}
                placeholder="insee.fr/…"
                maxLength={SUGGESTION_LIMITS.urlMax}
              />
            </label>

            {/* Piège à robots : invisible et ignoré par les humains. */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className={styles.trap}
            />

            <p className={styles.identity}>
              {user
                ? `Envoyé avec ton pseudo « ${user.displayPseudo} ».`
                : "Envoi anonyme : aucune donnée personnelle n'est enregistrée."}
            </p>

            {state.k === "error" && (
              <p role="alert" className={styles.error}>
                {state.message}
              </p>
            )}

            <div className="share-modal-actions">
              <button
                type="submit"
                className="share-modal-primary"
                disabled={tooShort || state.k === "sending"}
                data-loading={state.k === "sending" || undefined}
                aria-describedby={tooShort ? "suggestion-min-hint" : undefined}
              >
                {state.k === "sending" ? "Envoi…" : "Envoyer aux contributeurs"}
              </button>
              {/* Dit pourquoi le bouton est grisé (avant : rien ne
                  l'expliquait, et il avait l'air actif). */}
              {tooShort ? (
                <p id="suggestion-min-hint" className={styles.hint}>
                  Écris au moins {SUGGESTION_LIMITS.messageMin} caractères pour
                  envoyer.
                </p>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

/// Lien discret qui ouvre la fenêtre. À placer sous les sources d'une
/// question (avec `target`) ou sur la page Méthode (sans).
export function SuggestionTrigger({
  target,
  label,
  className,
}: {
  target?: Target;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? styles.trigger} onClick={() => setOpen(true)}>
        {label ?? "Une erreur ? Une source à ajouter ? Propose une amélioration"}
      </button>
      <SuggestionModal open={open} onClose={() => setOpen(false)} target={target} />
    </>
  );
}
