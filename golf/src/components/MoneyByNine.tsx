"use client";

import type { RoundComputation } from "@/lib/bets";
import { formatCompact } from "@/lib/money";
import type { Round } from "@/lib/types";

/**
 * Everyone's money by nine: Out, In, the whole-round bet when there is one,
 * and the total. The same figures as the Card tab's Out, In and Money rows,
 * laid out for the glance at the turn.
 */
export function MoneyByNine({
  round,
  comp,
}: {
  round: Round;
  comp: RoundComputation;
}) {
  const { front, back, overall, hasOverall } = comp.nineTotals;
  const columns: Array<{
    label: string;
    values: Record<string, number>;
    total?: boolean;
  }> = [
    ...(round.holeCount > 9
      ? [
          { label: "Out", values: front },
          { label: "In", values: back },
        ]
      : []),
    ...(hasOverall ? [{ label: "Overall", values: overall }] : []),
    { label: "Total", values: comp.grandTotals, total: true },
  ];

  return (
    <table className="tabular w-full border-collapse text-sm" aria-label="Money by nine">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-neutral-500">
          <th className="py-1.5 pr-2 text-left font-semibold">Player</th>
          {columns.map((column) => (
            <th key={column.label} className="px-1 py-1.5 text-right font-semibold">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {round.players.map((player) => (
          <tr key={player.id} className="border-t border-neutral-100">
            <td className="py-2 pr-2 font-semibold text-neutral-900">
              <span className="block max-w-[7rem] truncate">{player.name}</span>
            </td>
            {columns.map((column) => {
              const cents = column.values[player.id] ?? 0;
              return (
                <td
                  key={column.label}
                  className={`px-1 py-2 text-right ${
                    column.total ? "font-bold" : ""
                  } ${moneyTone(cents)}`}
                >
                  {formatCompact(cents)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Green up, red down, grey level — the same everywhere money is shown. */
export function moneyTone(cents: number): string {
  return cents > 0 ? "text-turf-700" : cents < 0 ? "text-red-700" : "text-neutral-400";
}
