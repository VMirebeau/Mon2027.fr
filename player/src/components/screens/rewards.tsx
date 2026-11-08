"use client";

/// Page "Mes récompenses" (mobile + corps partagé desktop).
///
/// Sections :
///   1. Niveau actuel + barre de progression vers le suivant (HeroBlock)
///   2. Missions du jour — petits objectifs réinitialisés chaque jour
///   3. Badges débloqués (récents en premier)
///   4. Badges à débloquer, groupés par catégorie
///
/// La page consomme `progress` + le catalogue (questions/themes) pour
/// calculer le ratio "thèmes maîtrisés", l'XP, etc. Pas d'écriture ici :
/// la détection d'unlock vit dans GamificationWatcher (cf. lib/gamification).

import { useMemo } from "react";
import { BadgeIcon } from "../badge-icon";
import { ScreenHeader } from "../screen-header";
import { useProgress } from "@/lib/use-progress";
import {
  BADGE_CATEGORY_LABEL,
  computeDailyMissions,
  computeLevel,
  computeXp,
  countBadges,
  listAllBadges,
  type BadgeCategory,
  type BadgeView,
  type LevelInfo,
} from "@/lib/gamification";
import { todayKey } from "@/lib/progress";
import type { NavTarget, Question, Theme } from "@/lib/types";

export function Rewards({
  questions,
  themes,
  onHome,
  onNavigate,
}: {
  questions: Question[];
  themes: Theme[];
  /// Conservé pour rester compat avec AppShell. Cf. Account pour la rationale :
  /// HomeHeader + BottomTabBar suffisent à naviguer, plus de back arrow.
  onHome?: () => void;
  onNavigate?: (target: NavTarget) => void;
}) {
  void onHome;
  return (
    <div className="scroll" style={{ background: "var(--cream)" }}>
      <div style={{ padding: "0 16px 32px" }}>
        <ScreenHeader
          eyebrow="Mes récompenses"
          title={
            <>
              Apprendre,{" "}
              <span style={{ color: "var(--coral)" }}>récompensé</span>.
            </>
          }
          subtitle="Débloque des badges en explorant les thèmes, en jouant régulièrement, ou en partageant l'app autour de toi."
        />
        <RewardsBody
          questions={questions}
          themes={themes}
          onNavigate={onNavigate}
          variant="mobile"
        />
      </div>
    </div>
  );
}

/// Corps partagé entre mobile et desktop. La version desktop wrap autour
/// de ce composant sans ajouter de scroll container.
export function RewardsBody({
  questions,
  themes,
  onNavigate,
  variant,
}: {
  questions: Question[];
  themes: Theme[];
  onNavigate?: (target: NavTarget) => void;
  variant: "mobile" | "desktop";
}) {
  const { progress, hydrated } = useProgress();
  void themes; // réservé : le catalogue de thèmes sert l'eval côté watcher,
  //              pas l'affichage. On le garde dans la signature pour
  //              symétrie d'API avec Stats.

  const xp = useMemo(() => computeXp(progress), [progress]);
  const level = useMemo<LevelInfo>(() => computeLevel(xp), [xp]);
  const counts = useMemo(() => countBadges(progress), [progress]);
  const badgesByCat = useMemo(() => groupBadges(progress), [progress]);
  const daily = useMemo(
    () => (hydrated ? computeDailyMissions(progress, todayKey()) : []),
    [progress, hydrated]
  );
  void questions; // réservé pour des badges futurs catalogue-dépendants
  //                 affichés directement ici (par ex. "thème maîtrisé").

  if (!hydrated) {
    return (
      <div
        style={{
          padding: variant === "desktop" ? "60px 24px" : "40px 12px",
          textAlign: "center",
          color: "var(--ink-mute)",
          fontFamily: "var(--font-body)",
          fontSize: 14,
        }}
      >
        Chargement de tes récompenses…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: variant === "desktop" ? 36 : 24,
      }}
    >
      <LevelHero level={level} counts={counts} variant={variant} />
      {daily.length > 0 ? (
        <DailyMissionsSection daily={daily} variant={variant} />
      ) : null}
      <BadgesSection
        badgesByCat={badgesByCat}
        counts={counts}
        variant={variant}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ============================================================================
// LevelHero — niveau + XP + ratio badges
// ============================================================================

function LevelHero({
  level,
  counts,
  variant,
}: {
  level: LevelInfo;
  counts: { unlocked: number; total: number };
  variant: "mobile" | "desktop";
}) {
  return (
    <section style={{ marginTop: variant === "mobile" ? 12 : 0 }}>
      <div
        style={{
          background: "var(--cream-warm)",
          color: "var(--ink)",
          borderRadius: variant === "desktop" ? 22 : 18,
          padding: variant === "desktop" ? "28px 30px" : "22px 20px",
          border: "1.5px solid var(--rule-soft)",
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-mute)",
            marginBottom: 8,
          }}
        >
          Niveau {level.current.rank} sur {LEVELS_TOTAL}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: variant === "desktop" ? 36 : 28,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            color: "var(--coral)",
          }}
        >
          {level.current.name}
        </div>
        {level.next ? (
          <div style={{ marginTop: variant === "desktop" ? 20 : 16 }}>
            <LevelBar pct={level.progressInLevel * 100} />
            <div
              style={{
                marginTop: 8,
                display: "flex",
                justifyContent: "space-between",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-mute)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <span>
                Prochain palier :{" "}
                <span style={{ color: "var(--ink)" }}>{level.next.name}</span>
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 18,
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--ink-soft)",
              lineHeight: 1.4,
            }}
          >
            Tu as parcouru toute l&apos;échelle. Il reste des badges à
            débloquer pour la suite.
          </div>
        )}

        <div
          style={{
            marginTop: variant === "desktop" ? 22 : 18,
            paddingTop: variant === "desktop" ? 16 : 14,
            borderTop: "1px solid var(--rule-soft)",
            display: "flex",
            gap: 22,
            flexWrap: "wrap",
            fontFamily: "var(--font-body)",
          }}
        >
          <Stat label="Badges" value={`${counts.unlocked} / ${counts.total}`} />
          <Stat label="Points" value={`${level.xp}`} />
        </div>
      </div>
    </section>
  );
}

const LEVELS_TOTAL = 10;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: "-0.02em",
          color: "var(--ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LevelBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: "rgba(26,26,26,0.08)",
        overflow: "hidden",
      }}
      aria-hidden
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: "var(--coral)",
          transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
        }}
      />
    </div>
  );
}

// ============================================================================
// Missions du jour
// ============================================================================

function DailyMissionsSection({
  daily,
  variant,
}: {
  daily: ReturnType<typeof computeDailyMissions>;
  variant: "mobile" | "desktop";
}) {
  return (
    <SectionWrap title="Aujourd'hui" variant={variant}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            variant === "desktop" ? "repeat(3, 1fr)" : "1fr",
          gap: 10,
        }}
      >
        {daily.map((d) => (
          <DailyMissionTile key={d.mission.id} item={d} variant={variant} />
        ))}
      </div>
    </SectionWrap>
  );
}

function DailyMissionTile({
  item,
  variant,
}: {
  item: ReturnType<typeof computeDailyMissions>[number];
  variant: "mobile" | "desktop";
}) {
  const pct = Math.min(100, (item.current / item.mission.goal) * 100);
  return (
    <div
      style={{
        background: "var(--paper)",
        border: `1px solid ${item.done ? "var(--signal-good)" : "var(--rule-soft)"}`,
        color: "var(--ink)",
        borderRadius: 14,
        padding: variant === "desktop" ? "14px 18px" : "12px 14px",
        transition: "border 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          {item.done ? (
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--signal-good)"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={{ flexShrink: 0 }}
            >
              <path d="M5 12l5 5L20 7" />
            </svg>
          ) : null}
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: variant === "desktop" ? 14 : 13,
              letterSpacing: "-0.01em",
              color: item.done ? "var(--signal-good)" : "var(--ink)",
            }}
          >
            {item.mission.label}
          </div>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            color: "var(--ink-mute)",
            whiteSpace: "nowrap",
          }}
        >
          {item.current}/{item.mission.goal}
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: "rgba(26,26,26,0.06)",
            overflow: "hidden",
          }}
          aria-hidden
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: item.done ? "var(--signal-good)" : "var(--coral)",
              transition: "width 0.4s cubic-bezier(.2,.7,.2,1)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Badges
// ============================================================================

const CATEGORY_ORDER: BadgeCategory[] = [
  "discovery",
  "regularity",
  "social",
  "curation",
];

function groupBadges(progress: ReturnType<typeof useProgress>["progress"]) {
  const all = listAllBadges(progress);
  const groups = new Map<BadgeCategory, BadgeView[]>();
  for (const cat of CATEGORY_ORDER) groups.set(cat, []);
  for (const v of all) {
    const arr = groups.get(v.def.category);
    if (arr) arr.push(v);
  }
  return groups;
}

function BadgesSection({
  badgesByCat,
  counts,
  variant,
  onNavigate,
}: {
  badgesByCat: Map<BadgeCategory, BadgeView[]>;
  counts: { unlocked: number; total: number };
  variant: "mobile" | "desktop";
  onNavigate?: (target: NavTarget) => void;
}) {
  void onNavigate; // pas de lien externe pour l'instant — réservé
  return (
    <SectionWrap
      title={`Badges · ${counts.unlocked}/${counts.total}`}
      variant={variant}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: variant === "desktop" ? 28 : 22,
        }}
      >
        {CATEGORY_ORDER.map((cat) => {
          const list = badgesByCat.get(cat) ?? [];
          if (list.length === 0) return null;
          return (
            <CategoryBlock
              key={cat}
              category={cat}
              badges={list}
              variant={variant}
            />
          );
        })}
      </div>
    </SectionWrap>
  );
}

function CategoryBlock({
  category,
  badges,
  variant,
}: {
  category: BadgeCategory;
  badges: BadgeView[];
  variant: "mobile" | "desktop";
}) {
  const unlocked = badges.filter((b) => b.unlocked).length;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: variant === "desktop" ? 18 : 16,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
            margin: 0,
          }}
        >
          {BADGE_CATEGORY_LABEL[category]}
        </h3>
        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--ink-mute)",
            textTransform: "uppercase",
          }}
        >
          {unlocked}/{badges.length}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            variant === "desktop"
              ? "repeat(auto-fill, minmax(220px, 1fr))"
              : "1fr",
          gap: 10,
        }}
      >
        {badges.map((b) => (
          <BadgeTile key={b.def.id} view={b} variant={variant} />
        ))}
      </div>
    </div>
  );
}

function BadgeTile({
  view,
  variant,
}: {
  view: BadgeView;
  variant: "mobile" | "desktop";
}) {
  const { def, unlocked } = view;
  return (
    <div
      style={{
        position: "relative",
        background: unlocked ? "var(--paper)" : "var(--cream-warm)",
        border: unlocked
          ? "1.5px solid var(--ink)"
          : "1.5px dashed var(--rule)",
        borderRadius: 14,
        padding: variant === "desktop" ? "14px 16px" : "12px 12px",
        opacity: unlocked ? 1 : 0.7,
        transition: "transform 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span
          style={{
            flexShrink: 0,
            width: variant === "desktop" ? 44 : 38,
            height: variant === "desktop" ? 44 : 38,
            borderRadius: 12,
            background: unlocked ? "var(--coral)" : "var(--rule-soft)",
            color: unlocked ? "var(--cream-warm)" : "var(--ink-mute)",
            display: "grid",
            placeItems: "center",
            filter: unlocked ? "none" : "grayscale(0.4)",
          }}
        >
          <BadgeIcon kind={def.icon} size={variant === "desktop" ? 24 : 20} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: variant === "desktop" ? 14 : 13,
              letterSpacing: "-0.01em",
              color: unlocked ? "var(--ink)" : "var(--ink-soft)",
              lineHeight: 1.2,
            }}
          >
            {def.label}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11.5,
              color: "var(--ink-mute)",
              lineHeight: 1.35,
              fontFamily: "var(--font-body)",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
          >
            {def.description}
          </div>
          <div
            className="mono"
            style={{
              marginTop: 6,
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: unlocked ? "var(--coral-deep)" : "var(--ink-mute)",
            }}
          >
            {unlocked ? "Débloqué" : "À débloquer"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Brick
// ============================================================================

function SectionWrap({
  title,
  variant,
  children,
}: {
  title: string;
  variant: "mobile" | "desktop";
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="mono"
        style={{
          fontSize: variant === "desktop" ? 12 : 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-mute)",
          margin: "0 0 14px",
          fontWeight: 500,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
