import { describe, expect, it } from "vitest";
import { describeShape, formatProbes, probeVerdict } from "./shape";

describe("describeShape", () => {
  it("names keys without leaking values", () => {
    const shape = describeShape({
      golfers: [
        { first_name: "Chris", last_name: "Alexander", ghin: "1234567" },
      ],
    });
    expect(shape).toBe("{golfers: array(1) of {first_name, last_name, ghin}}");
    expect(shape).not.toContain("Chris");
    expect(shape).not.toContain("1234567");
  });

  it("handles arrays, empties and scalars", () => {
    expect(describeShape([])).toBe("array(0)");
    expect(describeShape({})).toBe("{}");
    expect(describeShape(null)).toBe("null");
    expect(describeShape(42)).toBe("number");
    expect(describeShape("text")).toBe("string");
  });

  it("reaches leaf keys through the nesting GHIN actually uses", () => {
    // The shape that broke this: the leaf key names are the answer.
    const nested = { data: { items: [{ GolferName: "x", Idx: "9.9" }] } };
    expect(describeShape(nested)).toBe(
      "{data: {items: array(1) of {GolferName, Idx}}}",
    );
  });

  it("still stops before pathological nesting", () => {
    let deep: unknown = { leaf: 1 };
    for (let i = 0; i < 12; i += 1) deep = { down: deep };
    const shape = describeShape(deep);
    expect(shape).toContain("keys}");
    expect(shape.length).toBeLessThan(120);
  });

  it("truncates a very wide object", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`key${i}`, i]),
    );
    expect(describeShape(wide)).toContain("+20 more");
  });
});

describe("formatProbes", () => {
  it("renders a readable attempt log", () => {
    const text = formatProbes([
      { path: "a.json", status: 404, ok: false, error: "not found" },
      {
        path: "b.json",
        status: 200,
        ok: true,
        shape: "{golfers: array(0)}",
        parsed: 0,
      },
    ]);
    expect(text).toContain("ERR 404  a.json");
    expect(text).toContain("OK  200  b.json");
    expect(text).toContain("parsed 0 records from {golfers: array(0)}");
  });

  it("says so when nothing was tried", () => {
    expect(formatProbes([])).toBe("No endpoints were tried.");
  });
});

describe("probeVerdict", () => {
  const probe = (status: number, ok = false) => ({ path: "p", status, ok });

  it("separates the problems that need different fixes", () => {
    // A path that was never right.
    expect(probeVerdict([probe(404), probe(404)])).toBe("not-found");
    // A session that has run out — retrying will not help, signing in will.
    expect(probeVerdict([probe(404), probe(401)])).toBe("expired");
    // Something in between refusing the connection.
    expect(probeVerdict([probe(403), probe(404)])).toBe("forbidden");
    // Never got there at all.
    expect(probeVerdict([probe(0), probe(504)])).toBe("unreachable");
  });

  it("knows when the problem is the mapping, not the call", () => {
    expect(probeVerdict([probe(404), probe(200, true)])).toBe("some-answered");
  });

  it("does not let an empty 200 from a fallback hide an expired session", () => {
    // What the phone showed: the real endpoint said 401, a guess said 404,
    // and another guess answered 200 with null. That is an expired session.
    const empty = { path: "followed_golfers.json", status: 200, ok: true, parsed: 0 };
    expect(probeVerdict([probe(401), probe(404), empty])).toBe("expired");
    // But records are records, whichever endpoint produced them.
    const full = { ...empty, parsed: 3 };
    expect(probeVerdict([probe(401), full])).toBe("some-answered");
    // And an empty list with no 401 anywhere is just an empty list.
    expect(probeVerdict([probe(404), empty])).toBe("some-answered");
  });

  it("falls back rather than guessing", () => {
    expect(probeVerdict([])).toBe("mixed");
    expect(probeVerdict([probe(500), probe(404)])).toBe("mixed");
  });
});
