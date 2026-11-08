/// Livret militant — vue imprimable des questions sélectionnées.
///
/// `?ids=Q-INS-001,Q-INS-002,...` : la liste des customIds à inclure, dans
/// l'ordre passé. Côté UI, l'utilisateur arrive ici depuis Recap, Favoris ou
/// Réviser (avec une multi-sélection). Le rendu est optimisé pour `Ctrl+P
/// → Enregistrer en PDF` — pas de lib PDF côté client, on s'appuie sur le
/// print stylesheet du navigateur (cf. styles inline + @media print).
///
/// Le `?from=` est purement décoratif (titre du livret).

import { notFound } from "next/navigation";
import { loadQuestionsByIds } from "@/lib/content";
import { qrSvg } from "@/lib/qr-svg";
import { factFigure } from "@/lib/recap-helpers";
import { slugForQuestion } from "@/lib/question-slug";
import { themeColor } from "@/lib/theme-colors";
import type { Question } from "@/lib/types";
import { PrintBar } from "./print-bar";
import { LivretStyles } from "./styles";

export const dynamic = "force-dynamic";

const FROM_LABEL: Record<string, string> = {
  session: "Ma session du jour",
  favorites: "Mes questions favorites",
  review: "Ma sélection",
};

function parseIds(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const s = Array.isArray(raw) ? raw.join(",") : raw;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && /^[A-Z0-9-]+$/.test(x))
    .slice(0, 200);
}

function shortContext(q: Question): string {
  // Le `why` est la phrase courte "pédagogique" la plus dense ; si elle
  // dépasse ~280 chars on coupe sur la fin de phrase la plus proche.
  // `explain` est plus long ; on l'utilise comme fallback si `why` est vide.
  const raw = (q.why?.trim() || q.explain?.trim() || "").replace(/\s+/g, " ");
  if (raw.length <= 280) return raw;
  const cut = raw.slice(0, 280);
  const lastSentence = cut.lastIndexOf(". ");
  return lastSentence > 120 ? cut.slice(0, lastSentence + 1) : cut + "…";
}

function groupByTheme(questions: Question[]): Map<string, Question[]> {
  const m = new Map<string, Question[]>();
  for (const q of questions) {
    const arr = m.get(q.theme) ?? [];
    arr.push(q);
    m.set(q.theme, arr);
  }
  return m;
}

export default async function LivretPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; from?: string; qr?: string }>;
}) {
  const { ids: rawIds, from, qr } = await searchParams;
  const ids = parseIds(rawIds);
  const withQr = qr !== "0";

  if (ids.length === 0) {
    notFound();
  }

  const loaded = await loadQuestionsByIds(ids);
  // Reorder to preserve user's URL order (loadQuestionsByIds returns in DB
  // order via `customId asc`). Without this, a session livret would print
  // questions in alphabetical Q-ID order instead of chronological play order.
  const orderMap = new Map(ids.map((id, i) => [id, i]));
  const questions = loaded
    .filter((q) => orderMap.has(q.id))
    .sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  if (questions.length === 0) {
    notFound();
  }

  const title = FROM_LABEL[from ?? ""] ?? "Mon livret civique";
  const byTheme = groupByTheme(questions);
  const themes = [...byTheme.keys()];
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Génère les QR codes côté serveur (sync à la requête) pour éviter une
  // boucle de génération client-side au mount. mon2027.fr en base : le QR
  // pointe vers la page publique /q/[slug] que le scanneur peut jouer sans
  // compte. Si `withQr=false`, on saute totalement la génération.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mon2027.fr";
  const qrMap = new Map<string, string>();
  if (withQr) {
    await Promise.all(
      questions.map(async (q) => {
        const slug = slugForQuestion(q);
        const url = `${baseUrl}/q/${slug}`;
        qrMap.set(q.id, await qrSvg(url, 64));
      }),
    );
  }

  // Préserve le toggle QR dans le href de "switch" rendu par PrintBar.
  // Si on est qr=on et qu'on veut qr=off, on génère l'URL inverse côté
  // serveur (plus simple que de manipuler URL côté client).
  const toggleHref =
    `/livret?ids=${ids.join(",")}` +
    (from ? `&from=${from}` : "") +
    (withQr ? "&qr=0" : "");

  return (
    <>
      <LivretStyles />
      <PrintBar
        count={questions.length}
        withQr={withQr}
        toggleHref={toggleHref}
      />

      <main className="livret">
        <Cover title={title} count={questions.length} themes={themes} dateStr={dateStr} />

        {themes.map((theme) => (
          <section key={theme} className="livret-theme">
            <ThemeHeader theme={theme} count={byTheme.get(theme)!.length} />
            {byTheme.get(theme)!.map((q, i) => (
              <QuestionBlock
                key={q.id}
                q={q}
                index={i + 1}
                qrSvgString={qrMap.get(q.id)}
              />
            ))}
          </section>
        ))}

        <Footer />
      </main>
    </>
  );
}

function Cover({
  title,
  count,
  themes,
  dateStr,
}: {
  title: string;
  count: number;
  themes: string[];
  dateStr: string;
}) {
  return (
    <div className="livret-cover">
      <div className="livret-cover-eyebrow">Mon2027 · livret</div>
      <h1 className="livret-cover-title">{title}</h1>
      <div className="livret-cover-meta">
        {count} question{count > 1 ? "s" : ""} · {themes.length} thème
        {themes.length > 1 ? "s" : ""}
        <br />
        <span style={{ color: "var(--ink-mute, #8A877E)" }}>{dateStr}</span>
      </div>
      <div className="livret-cover-themes">
        {themes.map((t) => (
          <span
            key={t}
            className="livret-chip"
            style={{ background: themeColor(t), color: "#1A1A1A" }}
          >
            {t}
          </span>
        ))}
      </div>
      <p className="livret-cover-intro">
        Des données civiques sourcées sur INSEE, DREES, Cour des comptes, OCDE,
        Eurostat et autres organismes publics. À lire, à débattre, à
        transmettre.
      </p>
    </div>
  );
}

function ThemeHeader({ theme, count }: { theme: string; count: number }) {
  const col = themeColor(theme);
  return (
    <div className="livret-theme-header" style={{ borderColor: col }}>
      <span
        className="livret-chip livret-chip-lg"
        style={{ background: col, color: "#1A1A1A" }}
      >
        {theme}
      </span>
      <span className="livret-theme-count">
        {count} question{count > 1 ? "s" : ""}
      </span>
    </div>
  );
}

function QuestionBlock({
  q,
  index,
  qrSvgString,
}: {
  q: Question;
  index: number;
  /// SVG inline du QR code pointant vers /q/[slug], pré-rendu serveur.
  /// undefined quand l'utilisateur a désactivé les QR (?qr=0).
  qrSvgString?: string;
}) {
  const answer = factFigure(q);
  const ctx = shortContext(q);

  return (
    <article className="livret-q">
      <div className="livret-q-number">{String(index).padStart(2, "0")}</div>
      <div className="livret-q-body">
        <h3 className="livret-q-question">{q.question}</h3>
        {q.precisions ? (
          <p className="livret-q-precisions">{q.precisions}</p>
        ) : null}
        {/* Pas de chiffre-clé pour certains formats composites
            (catégorisation, vrai/faux multiple) : pas de bloc vide. */}
        {answer ? (
          <div className="livret-q-answer">
            <span className="livret-q-answer-label">Réponse</span>
            <span className="livret-q-answer-value">{answer}</span>
          </div>
        ) : null}
        {ctx ? <p className="livret-q-ctx">{ctx}</p> : null}
        {/* Mise en perspective : si elle existe, on l'ajoute en bloc serif
            distinct sous le contexte. Utile en livret papier où le lecteur
            doit pouvoir situer le chiffre d'un coup d'œil sans rebasculer
            sur l'app pour lire les comparaisons internationales/temporelles. */}
        {q.miseEnPerspective ? (
          <p className="livret-q-perspective">{q.miseEnPerspective}</p>
        ) : null}
        {q.sources.length > 0 ? (
          <ul className="livret-q-sources">
            {q.sources.map((s, i) => (
              <li key={i}>
                <span className="livret-q-source-tag">{s.tag}</span>
                <span className="livret-q-source-name">{s.name}</span>
                <span className="livret-q-source-url">{s.url}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {qrSvgString ? (
        <div
          className="livret-q-qr"
          title="Scanner pour jouer cette question"
          aria-label="QR code de la question"
          dangerouslySetInnerHTML={{ __html: qrSvgString }}
        />
      ) : null}
    </article>
  );
}

function Footer() {
  return (
    <div className="livret-footer">
      <div>Mon2027, quiz civique sourcé · mon2027.fr</div>
      <div className="livret-footer-note">
        Toutes les sources sont publiques et vérifiables. Ce livret est conçu
        pour être imprimé, partagé, et discuté.
      </div>
    </div>
  );
}
