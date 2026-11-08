import { describe, expect, it } from "vitest";
import { computeChallenges } from "./progress-stats";
import { DEFAULT_PROGRESS, type Progress } from "./progress";

/// La section « Défis » des stats doit refléter les défis réellement envoyés
/// (lus côté serveur), pas `progress.challenges.sent`, qui n'est plus
/// alimenté : sinon elle affirmait « ni envoyé ni reçu » à un joueur dont le
/// défi avait été joué.

const withReceived = (scores: Array<number | null>): Progress => ({
  ...DEFAULT_PROGRESS,
  challenges: {
    sent: [],
    received: scores.map((myScore, i) => ({
      id: `d${i}`,
      from: "Camille",
      createdAt: i,
      questionIds: [],
      opponentScore: 60,
      myScore,
    })),
  },
});

describe("computeChallenges", () => {
  it("compte les défis envoyés fournis par le serveur et leurs réponses", () => {
    const s = computeChallenges(DEFAULT_PROGRESS, [
      { responsesCount: 2 },
      { responsesCount: 0 },
    ]);
    expect(s.sentCount).toBe(2);
    expect(s.sentResponses).toBe(2);
  });

  it("sans source serveur, retombe sur le local", () => {
    const s = computeChallenges(DEFAULT_PROGRESS);
    expect(s.sentCount).toBe(0);
    expect(s.sentResponses).toBe(0);
  });

  it("agrège les défis reçus joués", () => {
    const s = computeChallenges(withReceived([80, 40, null]), []);
    expect(s.receivedCount).toBe(3);
    expect(s.receivedPlayed).toBe(2);
    expect(s.receivedAvgMyScore).toBe(60);
    expect(s.receivedAvgOpponentScore).toBe(60);
  });
});
