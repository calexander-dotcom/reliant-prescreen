import { describe, expect, it } from "vitest";
import type { Player, Side } from "../types";
import { autoSideName, isAutoSideName, labelledSides, sideLabel } from "./sides";

const players: Player[] = [
  { id: "c", name: "Charles Alexander", handicapIndex: 0.1, source: "manual" },
  { id: "ak", name: "Andrew Kinnear", handicapIndex: 5.2, source: "manual" },
  { id: "as", name: "Andy Shaw", handicapIndex: 8, source: "manual" },
  { id: "b", name: "Bo Camposano", handicapIndex: 12, source: "manual" },
];

describe("side labels", () => {
  it("follow the players after a swap, which is the bug from the course", () => {
    // Made as Charles / Andrew vs Andy / Bo, then Andrew and Andy swapped.
    const sides: [Side, Side] = [
      { id: "side-a", name: "Charles / Andrew", playerIds: ["c", "as"] },
      { id: "side-b", name: "Andy / Bo", playerIds: ["ak", "b"] },
    ];
    const [a, b] = labelledSides(sides, players);
    expect(a.name).toBe("Charles / Andy");
    expect(b.name).toBe("Andrew / Bo");
    // Everything else about the side is untouched.
    expect(a.playerIds).toEqual(["c", "as"]);
    expect(a.id).toBe("side-a");
  });

  it("leave a name somebody typed alone", () => {
    const side: Side = { id: "side-a", name: "The Sharks", playerIds: ["c", "as"] };
    expect(sideLabel(side, players, "Side A")).toBe("The Sharks");
    expect(isAutoSideName("The Sharks", players)).toBe(false);
  });

  it("treat the placeholders and an empty name as the app's", () => {
    const side: Side = { id: "side-a", name: "", playerIds: ["c", "b"] };
    expect(sideLabel(side, players, "Side A")).toBe("Charles / Bo");
    expect(sideLabel({ ...side, name: "Side A" }, players, "Side A")).toBe("Charles / Bo");
  });

  it("fall back when the side has nobody left in the round", () => {
    const side: Side = { id: "side-b", name: "Andy / Bo", playerIds: ["gone"] };
    expect(sideLabel(side, players, "Side B")).toBe("Side B");
    expect(autoSideName(side, players, "Side B")).toBe("Side B");
  });

  it("recognise an app-made name in either order", () => {
    expect(isAutoSideName("Andrew / Charles", players)).toBe(true);
    expect(isAutoSideName("Charles / Andrew / Bo", players)).toBe(true);
    expect(isAutoSideName("Charles / Dave", players)).toBe(false);
  });
});
