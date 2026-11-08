// Charge le contenu validé depuis la base partagée et le projette dans le
// modèle attendu par les écrans du player. À utiliser uniquement côté serveur
// (l'import indirect de Prisma garantit l'erreur si chargé côté client).
import { createHash } from "node:crypto";
import { prisma } from "./db";
import type { CatalogIndex } from "./gamification";
import { parseQuestionIndicators } from "./indicators";
import { dossierOf, type QuestionDossier } from "./question-dossier";
import { slugifyQuestionText } from "./question-slug";
import { frenchSpaces } from "./typo";
import type {
  AbChoice,
  AbQuestion,
  CategorisationQuestion,
  ClassementQuestion,
  CurseurMultiQuestion,
  EstimationQuestion,
  PondereQuestion,
  QcmQuestion,
  Question,
  Source,
  Theme,
  VraiFauxMultiQuestion,
  VraiFauxQuestion,
} from "./types";

/// Mapping fixe entre la liste affichée par la home et les thèmes admin.
/// Doit refléter `admin/src/lib/constants.ts > THEMES`. Un thème sans
/// contenu apparaît grisé via `count === 0`. Le label doit matcher
/// exactement le `theme` stocké en base (case-sensitive).
/// Note : les Q-LOG-* sont taggées `theme="Économie"` (avec sousTheme
/// "Logement — …"), donc le compteur Logement reste à 0 par design.
///
/// La liste id/label/color vient de `lib/theme-colors.ts` (client-safe) —
/// `HOME_THEMES` reste exporté ici pour préserver les imports existants
/// et parce que l'ajout du `count` est calculé côté serveur.
import { THEMES as THEMES_CORE } from "./theme-colors";
export const HOME_THEMES = THEMES_CORE;

export type HomeContent = {
  themes: Theme[];
  totalQuestions: number;
  totalOrgs: number;
  /// Nombre de sources citées par les questions publiées (une ligne par
  /// source et par question). Calculé côté serveur : le catalogue envoyé au
  /// navigateur peut ne pas contenir les sources (dossiers chargés à part).
  totalSources: number;
  dailyQuestion: Question | null;
};

/// Si `published` est fourni, on évite de relancer `loadPublishedQuestions()` —
/// utile quand l'appelant a déjà chargé le catalogue (cf. `app/page.tsx` qui
/// le passe à l'AppShell). Sinon on le charge ici pour rester self-contained.
export async function loadHomeContent(
  now: Date = new Date(),
  published?: Question[],
): Promise<HomeContent> {
  const snap = await catalogueSnapshot();
  const resolved = published ?? snap.questions;

  const byTheme = new Map<string, number>();
  for (const q of resolved) byTheme.set(q.theme, (byTheme.get(q.theme) ?? 0) + 1);

  const themes: Theme[] = HOME_THEMES.map((t) => ({
    id: t.id,
    label: t.label,
    color: t.color,
    count: byTheme.get(t.label) ?? 0,
  }));

  return {
    themes,
    totalQuestions: resolved.length,
    totalOrgs: snap.distinctSourceNames,
    totalSources: snap.sourceCount,
    dailyQuestion: pickDaily(resolved, now),
  };
}

/// Charge l'index minimal du catalogue pour le système de gamification :
/// juste de quoi compter (totalQuestions, totalThemes) et résoudre
/// `questionId → theme` pour le badge polyglotte. Beaucoup plus léger que
/// `loadPublishedQuestions()` — pas de mapping vers les variants ni de
/// jointure sources — pour pouvoir être appelé au layout root sans peser
/// sur les pages standalone (/q, /d) qui ne consomment pas le catalogue
/// complet.
///
/// Convention d'ID : on indexe par `customId ?? id` pour matcher l'ID
/// utilisé côté player (`mapToPlayer` plus bas), donc identique aux clés
/// de `progress.answers`.
export async function loadCatalogIndex(): Promise<CatalogIndex> {
  return (await catalogueSnapshot()).index;
}

/// Catalogue publié complet, projeté pour le player.
///
/// ⚠️ Tableau PARTAGÉ (cache mémoire, cf. catalogueSnapshot) : ne jamais le
/// muter (sort, splice, réaffectation de champs). Copier avant de trier.
export async function loadPublishedQuestions(): Promise<Question[]> {
  return (await catalogueSnapshot()).questions;
}

// ---------------------------------------------------------------------------
// Cache mémoire du catalogue publié
// ---------------------------------------------------------------------------
//
// La page d'accueil, le layout (index de gamification), le sitemap, les
// pages /q et /p et la moyenne communautaire relisaient et re-projetaient
// les ~450 questions et leurs sources à CHAQUE requête. Le contenu change
// rarement (publication depuis l'espace contributeurs, ou `deploy.py
// content`) : on garde une copie en mémoire, revalidée par une empreinte
// bon marché de la table (nombre de questions publiées, dernière
// modification, nombre et dernier identifiant de source).
//
// - Pendant CHECK_EVERY_MS après une vérification, la copie sert telle quelle.
// - Au-delà, une requête d'empreinte (deux agrégats) décide s'il faut
//   recharger. Une publication apparaît donc en moins de CHECK_EVERY_MS.
// - MAX_AGE_MS force de toute façon un rechargement complet (filet pour une
//   modification qui échapperait à l'empreinte, ex. une source corrigée par
//   un script sans toucher sa question).

const CHECK_EVERY_MS = 30_000;
const MAX_AGE_MS = 10 * 60_000;

type CatalogueSnapshot = {
  fingerprint: string;
  /// Empreinte du contenu projeté lui-même (cf. catalogueVersion).
  version: string;
  loadedAt: number;
  checkedAt: number;
  questions: Question[];
  index: CatalogIndex;
  distinctSourceNames: number;
  sourceCount: number;
  /// Dernière modification de chaque question publiée (id player → date).
  updatedAt: Record<string, Date>;
  /// Dernière modification du catalogue (max des précédentes).
  lastModified: Date;
  /// slug (DB puis auto-slug des anciens liens) → question. Construit à la
  /// demande, une fois par copie du catalogue.
  bySlug?: Map<string, Question>;
  /// Réponse JSON de /api/catalogue/dossiers, sérialisée une fois par copie.
  dossiersJson?: string;
};

let cached: CatalogueSnapshot | null = null;
let inflight: Promise<CatalogueSnapshot> | null = null;

async function catalogueFingerprint(): Promise<string> {
  const [q, src] = await Promise.all([
    prisma.question.aggregate({
      where: { statut: "publie" },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.source.aggregate({ _count: { _all: true }, _max: { id: true } }),
  ]);
  return [q._count._all, q._max.updatedAt?.getTime() ?? 0, src._count._all, src._max.id ?? ""].join(":");
}

async function buildSnapshot(fingerprint: string): Promise<CatalogueSnapshot> {
  const rows = await prisma.question.findMany({
    where: { statut: "publie" },
    orderBy: [{ theme: "asc" }, { customId: "asc" }],
    include: { sources: { orderBy: { ordre: "asc" } } },
  });
  const questions = rows.map(mapToPlayer).filter((q): q is Question => q !== null);
  const questionTheme: Record<string, string> = {};
  const sourceNames = new Set<string>();
  let sourceCount = 0;
  const updatedAt: Record<string, Date> = {};
  let lastModified = new Date(0);
  for (const r of rows) {
    sourceCount += r.sources.length;
    updatedAt[r.customId ?? r.id] = r.updatedAt;
    if (r.updatedAt > lastModified) lastModified = r.updatedAt;
    questionTheme[r.customId ?? r.id] = r.theme;
    for (const s of r.sources) sourceNames.add(s.nom);
  }
  const now = Date.now();
  // Thèmes jouables = ceux qui ont au moins une question publiée. Un thème
  // annoncé « Bientôt » (0 question) ne doit pas compter : sinon le badge
  // « Sur tous les fronts » (tous les thèmes joués) devient inatteignable.
  const themesWithQuestions = new Set(Object.values(questionTheme));
  const totalThemes = HOME_THEMES.filter((t) => themesWithQuestions.has(t.label)).length;
  return {
    fingerprint,
    version: createHash("sha1").update(JSON.stringify(questions)).digest("base64url").slice(0, 12),
    loadedAt: now,
    checkedAt: now,
    questions,
    index: { totalQuestions: rows.length, totalThemes, questionTheme },
    distinctSourceNames: sourceNames.size,
    sourceCount,
    updatedAt,
    lastModified,
  };
}

async function catalogueSnapshot(): Promise<CatalogueSnapshot> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < CHECK_EVERY_MS) return cached;
  // Une seule revalidation à la fois : les requêtes concurrentes attendent
  // la même promesse au lieu de relancer chacune les requêtes.
  inflight ??= (async () => {
    try {
      const fingerprint = await catalogueFingerprint();
      if (cached && cached.fingerprint === fingerprint && Date.now() - cached.loadedAt < MAX_AGE_MS) {
        cached = { ...cached, checkedAt: Date.now() };
        return cached;
      }
      cached = await buildSnapshot(fingerprint);
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/// Adresses /q/[slug] acceptées : minuscules, chiffres, tirets (cf. le
/// schéma admin et slugifyQuestionText). Le reste est refusé sans chercher.
const SLUG_RE = /^[a-z0-9-]{1,120}$/;

/// Question publiée correspondant à un slug : slug court défini en base, ou
/// slug calculé depuis le texte (anciens liens partagés). Sert à /q/[slug]
/// et à son image d'aperçu, sans requête en base grâce au cache.
export async function findPublishedBySlug(slug: string): Promise<Question | null> {
  const target = slug.toLowerCase();
  if (!SLUG_RE.test(target)) return null;
  const snap = await catalogueSnapshot();
  if (!snap.bySlug) {
    const map = new Map<string, Question>();
    // Auto-slugs d'abord, slugs DB ensuite : un slug défini en base gagne.
    for (const q of snap.questions) {
      const auto = slugifyQuestionText(q.question);
      if (!map.has(auto)) map.set(auto, q);
    }
    for (const q of snap.questions) if (q.slug) map.set(q.slug.toLowerCase(), q);
    snap.bySlug = map;
  }
  return snap.bySlug.get(target) ?? null;
}

/// Entrées du sitemap : chaque question publiée avec sa vraie date de
/// dernière modification, et celle du catalogue entier.
export async function loadSitemapData(): Promise<{
  questions: Array<{ question: Question; updatedAt: Date }>;
  lastModified: Date;
}> {
  const snap = await catalogueSnapshot();
  return {
    questions: snap.questions.map((q) => ({ question: q, updatedAt: snap.updatedAt[q.id] ?? snap.lastModified })),
    lastModified: snap.lastModified,
  };
}

/// Dossiers de toutes les questions publiées, déjà sérialisés pour
/// /api/catalogue/dossiers, avec la version du contenu (ETag).
export async function loadPublishedDossiers(): Promise<{ version: string; json: string }> {
  const snap = await catalogueSnapshot();
  if (!snap.dossiersJson) {
    const dossiers: Record<string, QuestionDossier> = {};
    for (const q of snap.questions) dossiers[q.id] = dossierOf(q);
    snap.dossiersJson = JSON.stringify({ version: snap.version, dossiers });
  }
  return { version: snap.version, json: snap.dossiersJson };
}

/// Empreinte courte du contenu publié tel que le player le reçoit : change
/// dès qu'un texte, une source ou une réponse change, et seulement alors.
/// Sert de clé de cache HTTP aux ressources dérivées du catalogue.
export async function catalogueVersion(): Promise<string> {
  return (await catalogueSnapshot()).version;
}

/** Dev catalog : charge les questions Q-TST-* (brouillons ou publiées) pour
 *  alimenter le mode `?dev=1`. Elles servent d'échantillon par format sur la
 *  scène nav. Si aucune Q-TST-* n'existe, retourne un tableau vide.
 *
 *  Gated par `NODE_ENV !== "production"` : en prod, la scène-nav dev n'est
 *  jamais montée, donc inutile de payer le coût DB à chaque hit home. */
export async function loadDevSamples(): Promise<Question[]> {
  if (process.env.NODE_ENV === "production") return [];
  const rows = await prisma.question.findMany({
    where: { customId: { startsWith: "Q-TST-" } },
    orderBy: [{ customId: "asc" }],
    include: { sources: { orderBy: { ordre: "asc" } } },
  });
  return rows.map(mapToPlayer).filter((q): q is Question => q !== null);
}

/// Charge exactement les questions correspondant aux customIds passés —
/// utile pour loadDefi qui n'a besoin que de 5 questions et qui sinon
/// payait le coût d'un findMany sur les 400+ publiées à chaque hit.
export async function loadQuestionsByIds(customIds: string[]): Promise<Question[]> {
  if (customIds.length === 0) return [];
  const rows = await prisma.question.findMany({
    where: { statut: "publie", customId: { in: customIds } },
    include: { sources: { orderBy: { ordre: "asc" } } },
  });
  return rows.map(mapToPlayer).filter((q): q is Question => q !== null);
}

export async function loadQuestionsByTheme(themeLabel: string): Promise<Question[]> {
  const rows = await prisma.question.findMany({
    where: { statut: "publie", theme: themeLabel },
    orderBy: [{ customId: "asc" }],
    include: { sources: { orderBy: { ordre: "asc" } } },
  });
  return rows.map(mapToPlayer).filter((q): q is Question => q !== null);
}

/// Question d'un aperçu contributeur (table QuestionPreview) : les colonnes
/// de Question telles que le formulaire les enregistrerait, plus les
/// sources. Même projection que le catalogue publié, donc l'aperçu montre
/// exactement ce que les joueurs verront.
export function mapPreviewToPlayer(data: unknown): Question | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown> & { sources?: unknown };
  const sources = Array.isArray(d.sources)
    ? (d.sources as Array<Record<string, unknown>>).map((s, i) => ({
        nom: String(s.nom ?? ""),
        url: String(s.url ?? ""),
        type: String(s.type ?? "primaire"),
        ordre: typeof s.ordre === "number" ? s.ordre : i,
      }))
    : [];
  const row = {
    ...d,
    id: typeof d.customId === "string" && d.customId ? d.customId : "APERCU",
    statut: "brouillon",
    sources,
  } as unknown as DbQuestion;
  try {
    return mapToPlayer(row);
  } catch {
    return null;
  }
}

/// Choix déterministe basé sur le jour calendaire (Europe/Paris) :
/// même question tant qu'on est dans la même journée, change à minuit.
export function pickDaily(questions: Question[], now: Date): Question | null {
  if (questions.length === 0) return null;
  const ymd = now.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  let h = 0;
  for (let i = 0; i < ymd.length; i++) h = (h * 31 + ymd.charCodeAt(i)) >>> 0;
  return questions[h % questions.length];
}

// ---------------------------------------------------------------------------
// Mapping DB → modèle player
// ---------------------------------------------------------------------------

type DbQuestion = Awaited<ReturnType<typeof prisma.question.findFirst>> & {
  sources: Array<{ nom: string; url: string; type: string }>;
};

function mapToPlayer(q: DbQuestion): Question | null {
  const variant = mapVariant(q);
  if (!variant) return null;
  // Propage le slug DB (optionnel). Le player utilisera ce slug pour les
  // URLs /q/[slug] ; null/undefined → fallback auto-slug côté lib.
  // `difficulte` : 3 par défaut si la colonne est absente (DB legacy avant
  // la re-notation du 2026-05-20). Le picking et l'affichage peuvent donc
  // tomber sur cette valeur sans gérer un undefined.
  // `miseEnPerspective` : propagé comme méta optionnelle (cf. QuestionMeta
  // dans types.ts). Les questions sans perspective continuent d'afficher
  // un dossier classique (explication + sources).
  const indicators = parseQuestionIndicators(q.indicators);
  return {
    ...variant,
    // Espaces insécables à la française (cf. lib/typo.ts) sur les textes
    // affichés en grand ; le slug, calculé depuis le texte, n'en dépend pas.
    question: frenchSpaces(variant.question),
    explain: frenchSpaces(variant.explain),
    ...(variant.precisions ? { precisions: frenchSpaces(variant.precisions) } : {}),
    slug: q.slug ?? undefined,
    difficulte: q.difficulte ?? 3,
    miseEnPerspective: q.miseEnPerspective ? frenchSpaces(q.miseEnPerspective) : undefined,
    indicators: indicators.length > 0 ? indicators : undefined,
  };
}

function mapVariant(q: DbQuestion): Question | null {
  const id = q.customId ?? q.id;
  const sources = mapSources(q.sources);
  // Le « contexte pédagogique » n'est PAS envoyé au public (décision du
  // 2026-11-08) : rédigé comme un argumentaire (« la gauche gagne à… », « la
  // bonne posture est… »), il contredisait la promesse « non partisan » du
  // dossier. Il reste saisi et lisible dans l'espace contributeurs. Pour le
  // réafficher : `q.contextePedagogique ?? ""` (la section existe toujours
  // dans dossier-panel.tsx, masquée tant que le texte est vide). L'ancien
  // repli sur `precisions` doublonnait la bulle « Définition » : retiré.
  const why = "";
  const explain = q.explication;

  if (q.format === "estimation_numerique") {
    if (
      q.plageMin == null ||
      q.plageMax == null ||
      q.reponseNumerique == null
    ) return null;
    const span = q.plageMax - q.plageMin;
    // Tolérances dérivées de la plage : 5 % "vert" / 15 % "orange". Les
    // colonnes DB sont conservées pour pouvoir sur-écrire au cas par cas
    // mais l'usage par défaut est laisser à null (cf. batch-*.ts).
    const tolerance = q.toleranceVerte ?? span * 0.05;
    const midTolerance = q.toleranceOrange ?? span * 0.15;
    const out: EstimationQuestion = {
      id,
      theme: q.theme,
      format: "estimation",
      question: q.question,
      precisions: q.precisions ?? undefined,
      range: [q.plageMin, q.plageMax],
      step: inferStep(q.plageMin, q.plageMax),
      answer: q.reponseNumerique,
      unit: q.unite ?? "",
      avgUser: 0,
      closeWithin: tolerance,
      midWithin: midTolerance,
      pctClose: 0,
      pctOff: 0,
      why,
      explain,
      sources,
    };
    return out;
  }

  if (q.format === "ab") {
    const parsed = safeParse(q.payload);
    const choix = Array.isArray(parsed?.choix) ? parsed.choix : null;
    const idx = parsed?.indexCorrect;
    if (!choix || choix.length < 2 || (idx !== 0 && idx !== 1)) return null;
    const valeurs = Array.isArray(parsed?.valeurs) ? parsed.valeurs : [];
    const v0 = typeof valeurs[0] === "number" ? (valeurs[0] as number) : undefined;
    const v1 = typeof valeurs[1] === "number" ? (valeurs[1] as number) : undefined;
    const unite = typeof parsed?.unite === "string" ? parsed.unite : undefined;
    const choices: [AbChoice, AbChoice] = [
      { label: String(choix[0]), valeur: v0 },
      { label: String(choix[1]), valeur: v1 },
    ];
    const out: AbQuestion = {
      id,
      theme: q.theme,
      format: "ab",
      question: q.question,
      precisions: q.precisions ?? undefined,
      choices,
      correctIndex: idx as 0 | 1,
      unite,
      avgUserText: "",
      pctClose: 0,
      pctOff: 0,
      why,
      explain,
      sources,
    };
    return out;
  }

  if (q.format === "vrai_faux") {
    const parsed = safeParse(q.payload);
    if (typeof parsed?.reponseCorrecte !== "boolean") return null;
    const out: VraiFauxQuestion = {
      id,
      theme: q.theme,
      format: "vraifaux",
      question: q.question,
      precisions: q.precisions ?? undefined,
      correctAnswer: parsed.reponseCorrecte,
      avgUserText: "",
      pctClose: 0,
      pctOff: 0,
      why,
      explain,
      sources,
    };
    return out;
  }

  if (q.format === "classement") {
    const parsed = safeParseAny(q.payload);
    const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : null;
    if (!itemsRaw || itemsRaw.length < 3) return null;
    // Convention DB : `items` est dans l'ordre correct, on shuffle au runtime.
    const items = itemsRaw.map((s: unknown, i: number) => {
      if (typeof s === "string") {
        return { id: `i${i}`, label: s };
      }
      const obj = s as Record<string, unknown>;
      return {
        id: typeof obj.id === "string" ? obj.id : `i${i}`,
        label: String(obj.label ?? ""),
        figure: typeof obj.figure === "string" ? obj.figure : undefined,
      };
    });
    const correctOrder = items.map((it) => it.id);
    const out: ClassementQuestion = {
      id,
      theme: q.theme,
      format: "classement",
      question: q.question,
      precisions: q.precisions ?? undefined,
      items,
      correctOrder,
      why,
      explain,
      sources,
    };
    return out;
  }

  if (q.format === "vraifaux_multi") {
    const parsed = safeParseAny(q.payload);
    const arr = Array.isArray(parsed?.affirmations) ? parsed.affirmations : null;
    if (!arr || arr.length < 2) return null;
    const statements = arr.map((a: unknown, i: number) => {
      const obj = a as Record<string, unknown>;
      return {
        id: typeof obj.id === "string" ? obj.id : `s${i}`,
        text: String(obj.texte ?? obj.text ?? ""),
        correct: Boolean(obj.vrai ?? obj.correct ?? false),
        why: typeof obj.why === "string" ? obj.why : (typeof obj.pourquoi === "string" ? obj.pourquoi : undefined),
      };
    });
    const out: VraiFauxMultiQuestion = {
      id,
      theme: q.theme,
      format: "vraifaux_multi",
      question: q.question,
      precisions: q.precisions ?? undefined,
      statements,
      why,
      explain,
      sources,
    };
    return out;
  }

  if (q.format === "curseur_multi") {
    const parsed = safeParseAny(q.payload);
    const echelle = parsed?.echelle as Record<string, unknown> | undefined;
    const itemsRaw = Array.isArray(parsed?.items) ? parsed.items : null;
    if (!echelle || !itemsRaw || itemsRaw.length < 2) return null;
    const min = Number(echelle.min);
    const max = Number(echelle.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
    const items = itemsRaw.map((it: unknown, i: number) => {
      const obj = it as Record<string, unknown>;
      return {
        id: typeof obj.id === "string" ? obj.id : `it${i}`,
        label: String(obj.label ?? ""),
        real: Number(obj.valeur ?? obj.real ?? 0),
        color: typeof obj.color === "string" ? obj.color : undefined,
      };
    });
    const out: CurseurMultiQuestion = {
      id,
      theme: q.theme,
      format: "curseur_multi",
      question: q.question,
      precisions: q.precisions ?? undefined,
      range: [min, max],
      unit: typeof echelle.unite === "string" ? echelle.unite : undefined,
      labelMin: typeof parsed?.labelMin === "string" ? parsed.labelMin : undefined,
      labelMax: typeof parsed?.labelMax === "string" ? parsed.labelMax : undefined,
      items,
      why,
      explain,
      sources,
    };
    return out;
  }

  if (q.format === "categorisation") {
    const parsed = safeParseAny(q.payload);
    const binsRaw = Array.isArray(parsed?.categories) ? parsed.categories : null;
    const itemsRaw = Array.isArray(parsed?.etiquettes) ? parsed.etiquettes : null;
    if (!binsRaw || !itemsRaw || binsRaw.length < 2 || itemsRaw.length < 2) return null;
    const bins = binsRaw.map((b: unknown, i: number) => {
      if (typeof b === "string") return { id: `b${i}`, label: b };
      const obj = b as Record<string, unknown>;
      return {
        id: typeof obj.id === "string" ? obj.id : `b${i}`,
        label: String(obj.label ?? obj.texte ?? ""),
      };
    });
    const items = itemsRaw.map((it: unknown, i: number) => {
      const obj = it as Record<string, unknown>;
      const catIdx = typeof obj.categorie === "number" ? obj.categorie : 0;
      const correctBinId = bins[Math.max(0, Math.min(catIdx, bins.length - 1))].id;
      return {
        id: typeof obj.id === "string" ? obj.id : `it${i}`,
        label: String(obj.texte ?? obj.label ?? ""),
        correct: typeof obj.correctBinId === "string" ? obj.correctBinId : correctBinId,
        note: typeof obj.note === "string" ? obj.note : undefined,
      };
    });
    const out: CategorisationQuestion = {
      id,
      theme: q.theme,
      format: "categorisation",
      question: q.question,
      precisions: q.precisions ?? undefined,
      bins,
      items,
      why,
      explain,
      sources,
    };
    return out;
  }

  if (q.format === "pondere") {
    const parsed = safeParseAny(q.payload);
    const partsRaw = Array.isArray(parsed?.parts) ? parsed.parts : null;
    if (!partsRaw || partsRaw.length < 2) return null;
    const total = typeof parsed?.total === "number" ? parsed.total : 100;
    const step = typeof parsed?.step === "number" ? parsed.step : 5;
    const palette = ["var(--yellow)", "var(--coral)", "var(--teal)", "var(--plum)", "var(--ink-mute)"];
    const categories = partsRaw.map((p: unknown, i: number) => {
      const obj = p as Record<string, unknown>;
      return {
        id: typeof obj.id === "string" ? obj.id : `c${i}`,
        label: String(obj.label ?? ""),
        real: Number(obj.valeur ?? obj.real ?? 0),
        color: typeof obj.color === "string" ? obj.color : palette[i % palette.length],
      };
    });
    const out: PondereQuestion = {
      id,
      theme: q.theme,
      format: "pondere",
      question: q.question,
      precisions: q.precisions ?? undefined,
      pool: total,
      step,
      categories,
      why,
      explain,
      sources,
    };
    return out;
  }

  if (q.format === "qcm") {
    const parsed = safeParse(q.payload);
    const choix = Array.isArray(parsed?.choix) ? parsed.choix : null;
    const idx = parsed?.indexCorrect;
    if (!choix || choix.length < 2 || typeof idx !== "number" || idx < 0 || idx >= choix.length) {
      return null;
    }
    const out: QcmQuestion = {
      id,
      theme: q.theme,
      format: "qcm",
      question: q.question,
      precisions: q.precisions ?? undefined,
      choices: choix.map((c) => String(c)),
      correctIndex: idx,
      avgUserText: "",
      pctClose: 0,
      pctOff: 0,
      why,
      explain,
      sources,
    };
    return out;
  }

  return null;
}

function safeParseAny(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mapSources(rows: Array<{ nom: string; url: string; type: string }>): Source[] {
  return rows.map((s) => ({
    name: s.nom,
    url: s.url,
    tag: s.type === "triangulation" ? "Triangulation" : "Source primaire",
  }));
}

function safeParse(s: string | null): {
  choix?: unknown[];
  indexCorrect?: number;
  reponseCorrecte?: boolean;
  valeurs?: unknown[];
  unite?: string;
} | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null ? v : null;
  } catch {
    return null;
  }
}

/// Pas heuristique pour le curseur d'estimation.
function inferStep(min: number, max: number): number {
  const span = max - min;
  if (span <= 1) return 0.01;
  if (span <= 20) return 0.5;
  if (span <= 100) return 1;
  if (span <= 1000) return 10;
  if (span <= 10_000) return 50;
  return Math.pow(10, Math.floor(Math.log10(span)) - 2);
}
