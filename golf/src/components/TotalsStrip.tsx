"use client";

import type { RoundComputation } from "@/lib/bets";
import { formatShort } from "@/lib/money";
import type { Round } from "@/lib/types";

/**
 * Everyone's running total, one tile each, at the top of the round and of
 * the shared view.
 *
 * A money figure is never cut short. The tiles size to what is in them and
 * share the width when there is room; when there is not — long names, cents,
 * a big group — the row scrolls sideways instead of turning "-$15" into
 * "-$1…". Names are first names, and the figure drops the cents when there
 * are none, so four across fits an ordinary phone with room to spare.
 */
export function TotalsStrip({
  round,
  comp,
}: {
  round: Round;
  comp: RoundComputation;
}) {
  return (
    <ul
      aria-label="Running totals"
      className="tabular flex gap-1.5 overflow-x-auto pb-1"
    >
      {round.players.map((player) => {
        const total = comp.grandTotals[player.id] ?? 0;
        return (
          <li
            key={player.id}
            className="flex-1 shrink-0 basis-auto rounded-xl bg-white px-1.5 py-1.5 text-center shadow-sm ring-1 ring-black/5"
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
