import { describe, expect, it } from "vitest";
import { bucketize } from "./review-buckets";
import type { Question } from "./types";

const q = (id: string) => ({ id }) as Question;

describe("bucketize", () => {
  it("ignore les questions jamais répondues (ts=0)", () => {
    const b = bucketize([q("a"), q("b")], {});
    expect(b.all).toHaveLength(0);
    expect(b.todo).toHaveLength(0);
    expect(b.done).toHaveLength(0);
  });

  it("range les correct dans done, les autres dans todo", () => {
    const b = bucketize(
      [q("a"), q("b"), q("c")],
      {
        a: { correct: true, ts: 100 },
        b: { correct: false, ts: 200 },
        c: { correct: true, ts: 300 },
      },
    );
    expect(b.done.map((x) => x.id)).toEqual(["c", "a"]); // récent → ancien
    expect(b.todo.map((x) => x.id)).toEqual(["b"]);
    expect(b.all.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("tri par ts décroissant (le plus récent en premier)", () => {
    const b = bucketize(
      [q("old"), q("new"), q("mid")],
      {
        old: { correct: true, ts: 1 },
        new: { correct: true, ts: 3 },
        mid: { correct: true, ts: 2 },
      },
    );
    expect(b.all.map((x) => x.id)).toEqual(["new", "mid", "old"]);
  });

  it("la même question dans answers mais pas dans la liste = ignorée", () => {
    const b = bucketize([q("a")], {
      a: { correct: true, ts: 1 },
      orphan: { correct: false, ts: 2 },
    });
    expect(b.all.map((x) => x.id)).toEqual(["a"]);
  });

  it("avec SRS : une bonne réponse non dûe reste en done", () => {
    const now = 1_000_000_000_000;
    const futureDue = now + 7 * 24 * 60 * 60 * 1000;
    const b = bucketize(
      [q("a")],
      { a: { correct: true, ts: now - 1000, srs: { nextDueAt: futureDue } } },
      now,
    );
    expect(b.done.map((x) => x.id)).toEqual(["a"]);
    expect(b.todo).toHaveLength(0);
  });

  it("avec SRS : une bonne réponse dûe redescend en todo", () => {
    const now = 1_000_000_000_000;
    const pastDue = now - 1000;
    const b = bucketize(
      [q("a")],
      { a: { correct: true, ts: now - 10_000, srs: { nextDueAt: pastDue } } },
      now,
    );
    expect(b.todo.map((x) => x.id)).toEqual(["a"]);
    expect(b.done).toHaveLength(0);
  });

  it("legacy sans SRS : juste reste en done, faux en todo (compat)", () => {
    const b = bucketize(
      [q("a"), q("b")],
      {
        a: { correct: true, ts: 100 },
        b: { correct: false, ts: 200 },
      },
      99999999,
    );
    expect(b.done.map((x) => x.id)).toEqual(["a"]);
    expect(b.todo.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("bucketize : une erreur est toujours à revoir", () => {
  it("même avec une échéance SRS dans le futur", () => {
    const now = 1_000_000;
    const qs = [{ id: "a" }] as unknown as Question[];
    const r = bucketize(qs, { a: { correct: false, ts: now - 10, srs: { nextDueAt: now + 86_400_000 } } }, now);
    expect(r.todo.map((q) => q.id)).toEqual(["a"]);
    expect(r.done).toEqual([]);
  });
});
