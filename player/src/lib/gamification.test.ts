import { describe, expect, it } from "vitest";
import {
  BADGES,
  BADGE_BY_ID,
  buildCatalogIndex,
  buildEvalState,
  computeDailyMissions,
  computeLevel,
  computeXp,
  countBadges,
  evaluateUnlockedBadges,
  findNewBadgeUnlocks,
  LEVELS,
  listAllBadges,
  listUnseenBadges,
} from "./gamification";
import { DEFAULT_PROGRESS, todayKey } from "./progress";
import type { Progress } from "./progress";
import type { Question, Theme } from "./types";

// ============================================================================
// Helpers
// ============================================================================

function progress(overrides: Partial<Progress> = {}): Progress {
  return {
    ...DEFAULT_PROGRESS,
    ...overrides,
    gamif: { ...DEFAULT_PROGRESS.gamif, ...(overrides.gamif ?? {}) },
  };
}

function makeQuestion(
  id: string,
  theme: string,
  format: Question["format"] = "vraifaux"
): Question {
  return {
    id,
    theme,
    format,
    question: "Q?",
    correctAnswer: true,
    avgUserText: "",
    pctClose: 0,
    pctOff: 0,
    why: "",
    explain: "",
    sources: [],
  } as Question;
}

const sampleThemes: Theme[] = [
  { id: "imm", label: "Immigration", color: "#000", count: 3 },
  { id: "eco", label: "Économie", color: "#000", count: 3 },
];

const sampleQuestions: Question[] = [
  makeQuestion("q1", "Immigration"),
  makeQuestion("q2", "Immigration"),
  makeQuestion("q3", "Économie"),
];

/// Catalogue projeté en CatalogIndex pour toutes les évals de tests.
/// Pré-construit une fois ici plutôt que de répéter buildCatalogIndex(...)
/// à chaque it() — les tests testent la logique d'éval, pas la projection.
const sampleCatalog = buildCatalogIndex(sampleQuestions, sampleThemes);

// ============================================================================
// computeLevel
// ============================================================================

describe("computeLevel", () => {
  it("renvoie rang 1 sur XP 0", () => {
    const info = computeLevel(0);
    expect(info.current.rank).toBe(1);
    expect(info.next?.rank).toBe(2);
    expect(info.xp).toBe(0);
  });

  it("trouve le palier supérieur au seuil exact", () => {
    const info = computeLevel(250);
    expect(info.current.rank).toBe(3); // Informé·e
    expect(info.next?.rank).toBe(4);
  });

  it("plafonne au rang max sans next", () => {
    const info = computeLevel(10000);
    expect(info.current.rank).toBe(LEVELS.length);
    expect(info.next).toBeNull();
    expect(info.xpToNext).toBe(0);
    expect(info.progressInLevel).toBe(1);
  });

  it("progressInLevel est en [0,1]", () => {
    const info = computeLevel(150);
    expect(info.progressInLevel).toBeGreaterThan(0);
    expect(info.progressInLevel).toBeLessThan(1);
  });
});

// ============================================================================
// computeXp
// ============================================================================

describe("computeXp", () => {
  it("renvoie 0 sur progress vide", () => {
    expect(computeXp(DEFAULT_PROGRESS)).toBe(0);
  });

  it("attribue 10 XP par bonne, 3 XP par mauvaise", () => {
    const p = progress({
      answers: {
        a: { value: 0, correct: true, ts: 1 },
        b: { value: 0, correct: false, ts: 2 },
        c: { value: 0, correct: true, ts: 3 },
      },
    });
    expect(computeXp(p)).toBe(10 + 3 + 10);
  });

  it("compte le XP des défis créés et favoris", () => {
    const p = progress({
      favorites: { f1: { addedAt: 1 }, f2: { addedAt: 2 } },
      gamif: { ...DEFAULT_PROGRESS.gamif, defisCreated: 2, daysStreakMax: 4 },
    });
    expect(computeXp(p)).toBe(2 * 20 + 2 * 2 + 4 * 5);
  });

  it("ajoute le xpReward des badges débloqués (filtre les orphelins)", () => {
    const p = progress({
      badges: {
        "premier-pas": { unlockedAt: 1, seen: true },
        "badge-orphelin-inexistant": { unlockedAt: 1, seen: true },
      },
    });
    const def = BADGE_BY_ID.get("premier-pas")!;
    expect(computeXp(p)).toBe(def.xpReward);
  });
});

// ============================================================================
// Badge predicates
// ============================================================================

describe("evaluateUnlockedBadges", () => {
  it("premier-pas se débloque dès la 1ère réponse", () => {
    const p = progress({
      answers: { q1: { value: true, correct: true, ts: 1 } },
    });
    const state = buildEvalState(p, sampleCatalog);
    const ids = evaluateUnlockedBadges(state);
    expect(ids).toContain("premier-pas");
  });

  it("polyglotte exige tous les thèmes touchés", () => {
    const p1 = progress({
      answers: {
        q1: { value: true, correct: true, ts: 1 },
      },
    });
    const s1 = buildEvalState(p1, sampleCatalog);
    expect(evaluateUnlockedBadges(s1)).not.toContain("polyglotte");

    const p2 = progress({
      answers: {
        q1: { value: true, correct: true, ts: 1 },
        q3: { value: true, correct: true, ts: 2 },
      },
    });
    const s2 = buildEvalState(p2, sampleCatalog);
    expect(evaluateUnlockedBadges(s2)).toContain("polyglotte");
  });

  it("connecté requiert un pseudo non null", () => {
    const p = progress({ identity: { pseudo: "alice" } });
    const state = buildEvalState(p, sampleCatalog);
    expect(evaluateUnlockedBadges(state)).toContain("connecte");
  });

  it("habitué dépend de gamif.daysStreakMax (pas streak.days courant)", () => {
    const p = progress({
      streak: { days: 1, lastPlayedDay: "2026-05-19" }, // série courante cassée
      gamif: { ...DEFAULT_PROGRESS.gamif, daysStreakMax: 3 },
    });
    const state = buildEvalState(p, sampleCatalog);
    expect(evaluateUnlockedBadges(state)).toContain("habitue");
  });

  it("premier-defi se base sur les défis créés (signal d'engagement)", () => {
    const p = progress({
      gamif: { ...DEFAULT_PROGRESS.gamif, defisCreated: 1 },
    });
    const state = buildEvalState(p, sampleCatalog);
    expect(evaluateUnlockedBadges(state)).toContain("premier-defi");
  });

  it("premier-repondu/cercle-militant/reseau-militant récompensent le destinataire actif (symétrie de viralité)", () => {
    const justOne = progress({
      gamif: { ...DEFAULT_PROGRESS.gamif, defisReceivedPlayed: 1 },
    });
    const s1 = buildEvalState(justOne, sampleCatalog);
    const ids1 = evaluateUnlockedBadges(s1);
    expect(ids1).toContain("premier-repondu");
    expect(ids1).not.toContain("cercle-militant");
    expect(ids1).not.toContain("reseau-militant");

    const five = progress({
      gamif: { ...DEFAULT_PROGRESS.gamif, defisReceivedPlayed: 5 },
    });
    const s2 = buildEvalState(five, sampleCatalog);
    expect(evaluateUnlockedBadges(s2)).toContain("cercle-militant");
    expect(evaluateUnlockedBadges(s2)).not.toContain("reseau-militant");

    const fifteen = progress({
      gamif: { ...DEFAULT_PROGRESS.gamif, defisReceivedPlayed: 15 },
    });
    const s3 = buildEvalState(fifteen, sampleCatalog);
    expect(evaluateUnlockedBadges(s3)).toContain("reseau-militant");
  });

  it("ambassadeur/bouche-à-oreille se basent sur les RÉPONSES reçues, pas les défis créés", () => {
    // Créer 100 défis sans aucune réponse ne doit pas débloquer
    // ambassadeur/bouche-à-oreille (signal gameable).
    const created = progress({
      gamif: { ...DEFAULT_PROGRESS.gamif, defisCreated: 100, defisPlayedByOthers: 0 },
    });
    const s1 = buildEvalState(created, sampleCatalog);
    const ids1 = evaluateUnlockedBadges(s1);
    expect(ids1).not.toContain("ambassadeur");
    expect(ids1).not.toContain("bouche-a-oreille");
    expect(ids1).not.toContain("premier-rebond");

    // Réponses effectives → unlocks.
    const played = progress({
      gamif: {
        ...DEFAULT_PROGRESS.gamif,
        defisCreated: 3,
        defisPlayedByOthers: 5,
      },
    });
    const s2 = buildEvalState(played, sampleCatalog);
    const ids2 = evaluateUnlockedBadges(s2);
    expect(ids2).toContain("premier-rebond");
    expect(ids2).toContain("ambassadeur");
    expect(ids2).not.toContain("bouche-a-oreille");
  });

  it("pas de badge de justesse pure dans le catalogue (anti-shame)", () => {
    // Régression : on ne veut pas réintroduire les badges 'precis' /
    // 'expert' / 'maitre' qui frappaient sur la honte personnelle. La
    // catégorie 'lucidite' (humilite / 5050) a aussi été retirée pour
    // éviter une réintroduction implicite de la même logique d'éval.
    const allIds = BADGES.map((b) => b.id);
    expect(allIds).not.toContain("precis");
    expect(allIds).not.toContain("expert");
    expect(allIds).not.toContain("maitre");
    expect(allIds).not.toContain("sniper");
    expect(allIds).not.toContain("humilite");
    expect(allIds).not.toContain("5050");
  });
});

// ============================================================================
// findNewBadgeUnlocks
// ============================================================================

describe("findNewBadgeUnlocks", () => {
  it("retourne uniquement les badges nouvellement débloqués", () => {
    const p = progress({
      answers: { q1: { value: true, correct: true, ts: 1 } },
      badges: { "premier-pas": { unlockedAt: 1, seen: true } },
    });
    // premier-pas déjà présent → ne doit pas revenir.
    expect(findNewBadgeUnlocks(p, sampleCatalog)).not.toContain(
      "premier-pas"
    );
  });

  it("renvoie [] sur DEFAULT_PROGRESS", () => {
    expect(
      findNewBadgeUnlocks(DEFAULT_PROGRESS, sampleCatalog)
    ).toEqual([]);
  });
});

// ============================================================================
// Aggregators
// ============================================================================

describe("listAllBadges + countBadges", () => {
  it("listAllBadges renvoie tout le catalogue", () => {
    const list = listAllBadges(DEFAULT_PROGRESS);
    expect(list).toHaveLength(BADGES.length);
    expect(list.every((b) => !b.unlocked)).toBe(true);
  });

  it("countBadges ignore les IDs orphelins", () => {
    const p = progress({
      badges: {
        "premier-pas": { unlockedAt: 1, seen: true },
        "badge-fantome": { unlockedAt: 1, seen: true },
      },
    });
    const c = countBadges(p);
    expect(c.unlocked).toBe(1);
    expect(c.total).toBe(BADGES.length);
  });

  it("listUnseenBadges renvoie les IDs seen:false uniquement", () => {
    const p = progress({
      badges: {
        "premier-pas": { unlockedAt: 1, seen: false },
        curieux: { unlockedAt: 2, seen: true },
      },
    });
    expect(listUnseenBadges(p)).toEqual(["premier-pas"]);
  });
});

// ============================================================================
// Daily missions
// ============================================================================

describe("computeDailyMissions", () => {
  it("0 quand pas joué aujourd'hui", () => {
    const today = todayKey();
    const missions = computeDailyMissions(DEFAULT_PROGRESS, today);
    expect(missions).toHaveLength(3);
    expect(missions.every((m) => m.current === 0)).toBe(true);
    expect(missions.every((m) => !m.done)).toBe(true);
  });

  it("compte uniquement le jour courant (ignore les anciens)", () => {
    const today = todayKey();
    const p = progress({
      gamif: {
        ...DEFAULT_PROGRESS.gamif,
        todayPlayedDay: "2020-01-01", // ancien
        todayPlayedCount: 99,
      },
    });
    const missions = computeDailyMissions(p, today);
    expect(missions.every((m) => m.current === 0)).toBe(true);
  });

  it("marque done dès que le goal est atteint", () => {
    const today = todayKey();
    const p = progress({
      gamif: {
        ...DEFAULT_PROGRESS.gamif,
        todayPlayedDay: today,
        todayPlayedCount: 4,
      },
    });
    const missions = computeDailyMissions(p, today);
    // goals: 1, 3, 7 — donc les deux premières sont done, la 3ème pas encore
    expect(missions[0].done).toBe(true);
    expect(missions[1].done).toBe(true);
    expect(missions[2].done).toBe(false);
    expect(missions[2].current).toBe(4);
  });
});
