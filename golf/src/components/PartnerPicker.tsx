"use client";

import type { Player, Round, Side } from "@/lib/types";
import { Card, SectionTitle } from "./ui";

/**
 * Set the teams in one tap.
 *
 * Four players split into two pairs three ways, and after a Golf Genius import
 * picking the partners is about all there is left to do, so this offers the
 * three pairings straight up rather than making anyone toggle A / B / Out down
 * the roster. It writes the sides onto every side-based game in the round; the
 * detailed picker in the bet editor is still there for anything unusual.
 */

/** The three ways four players pair off, as index pairs into the roster. */
const PAIRINGS: ReadonlyArray<readonly [readonly [number, number], readonly [number, number]]> = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

export function PartnerPicker({
  round,
  update,
}: {
  round: Round;
  update: (next: Round) => void;
}) {
  const players = round.players;
  const teamBets = round.bets.filter(
    (bet) => bet.kind === "onedown" || bet.kind === "nassau",
  );
  // Only meaningful for a foursome playing a side game.
  if (players.length !== 4 || teamBets.length === 0) return null;

  const firstName = (index: number) => players[index]?.name.split(" ")[0] ?? "";
  const idsAt = (indices: readonly number[]) => indices.map((i) => players[i].id);

  const current = (() => {
    const bet = teamBets[0];
    if (bet.kind !== "onedown" && bet.kind !== "nassau") return -1;
    return PAIRINGS.findIndex(([a, b]) =>
      samePairing(bet.sides, idsAt(a), idsAt(b)),
    );
  })();

  const choose = (pairIndex: number) => {
    const [a, b] = PAIRINGS[pairIndex];
    const aIds = idsAt(a);
    const bIds = idsAt(b);
    const aName = a.map(firstName).join(" / ");
    const bName = b.map(firstName).join(" / ");
    const bets = round.bets.map((bet) => {
      if (bet.kind !== "onedown" && bet.kind !== "nassau") return bet;
      const sides: [Side, Side] = [
        { ...bet.sides[0], name: aName, playerIds: aIds },
        { ...bet.sides[1], name: bName, playerIds: bIds },
      ];
      return { ...bet, sides };
    });
    update({ ...round, bets });
  };

  return (
    <Card>
      <SectionTitle hint="Who is partnered with whom. Tap a pairing; fine-tune it under the game below if you need to.">
        Teams
      </SectionTitle>
      <div className="space-y-2">
        {PAIRINGS.map(([a, b], index) => {
          const selected = index === current;
          return (
            <button
              key={index}
              type="button"
              onClick={() => choose(index)}
              aria-pressed={selected}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold ring-1 ring-inset ${
                selected
                  ? "bg-turf-50 text-turf-900 ring-turf-300"
                  : "bg-neutral-50 text-neutral-700 ring-neutral-200"
              }`}
            >
              <span className="truncate">{a.map(firstName).join(" & ")}</span>
              <span className="shrink-0 text-xs font-bold uppercase text-neutral-400">vs</span>
              <span className="truncate">{b.map(firstName).join(" & ")}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** Whether the two sides hold this pairing, whichever way round A and B fall. */
function samePairing(
  sides: [Side, Side],
  aIds: string[],
  bIds: string[],
): boolean {
  const s0 = new Set(sides[0].playerIds);
  const s1 = new Set(sides[1].playerIds);
  const eq = (set: Set<string>, ids: string[]) =>
    set.size === ids.length && ids.every((id) => set.has(id));
  return (eq(s0, aIds) && eq(s1, bIds)) || (eq(s0, bIds) && eq(s1, aIds));
}
