"use client";

import type { RoundComputation } from "@/lib/bets";
import { formatShort } from "@/lib/money";
import type { Round } from "@/lib/types";

/**
 * Everyone's running total, one tile each, at the top of the round and of
 * the shared view.
 *
 * A money figure is never cut short and never pushed off the edge. Four
 * across is the shape when it fits; when the screen is narrow — a small
 * phone, or an ordinary one with Safari's page zoom or a larger text size
 * turned up, which shrinks the width the page has to work with — the tiles
 * go two by two instead. The columns size to their contents rather than to
 * a fixed share, so a long name widens its tile rather than losing digits,
 * and the figure drops the cents when there are none.
 */
export function TotalsStrip({
  round,
  comp,
}: {
  round: Round;
  comp: RoundComputation;
}) {
  const count = round.players.length;
  const columns =
    count <= 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-[repeat(2,auto)]"
        : count === 3
          ? "grid-cols-[repeat(3,auto)]"
          : "grid-cols-[repeat(2,auto)] min-[340px]:grid-cols-[repeat(4,auto)]";

  return (
    <ul
      aria-label="Running totals"
      className={`tabular grid gap-1.5 overflow-x-auto pb-1 ${columns}`}
    >
      {round.players.map((player) => {
        const total = comp.grandTotals[player.id] ?? 0;
        return (
          <li
            key={player.id}
            className="rounded-xl bg-white px-1.5 py-1.5 text-center shadow-sm ring-1 ring-black/5"
          >
            <div className="whitespace-nowrap text-[0.7rem] font-semibold text-neutral-600">
              {player.name.split(" ")[0]}
            </div>
            <div
              className={`whitespace-nowrap text-sm font-bold ${
                total > 0
                  ? "text-turf-700"
                  : total < 0
                    ? "text-red-700"
                    : "text-neutral-400"
              }`}
            >
              {formatShort(total)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
