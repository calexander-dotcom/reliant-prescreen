"use client";

import { useMemo } from "react";
import type { RoundComputation } from "@/lib/bets";
import { ledgerRunning } from "@/lib/bets/ledger";
import { formatCompact, formatMoney, formatSigned } from "@/lib/money";
import {
  balanceHoleOnto,
  clearHoleMoney,
  setBanker,
  setManualAmount,
  setScore,
  adjustManualPresses,
} from "@/lib/mutations";
import type { Round } from "@/lib/types";
import { MoneyInput } from "./MoneyInput";
import { ScoreStepper } from "./ScoreStepper";
import { Banner, Button, Card, SectionTitle } from "./ui";

export function HoleView({
  round,
  comp,
  hole,
  onHoleChange,
  update,
}: {
  round: Round;
  comp: RoundComputation;
  hole: number;
  onHoleChange: (hole: number) => void;
  update: (next: Round) => void;
}) {
  const info = comp.holes.find((entry) => entry.number === hole) ?? comp.holes[0];
  const ids = round.players.map((player) => player.id);
  const entry = round.manual[hole];
  const banker = entry?.bankerId ?? null;

  const amounts = useMemo(
    () => Object.fromEntries(ids.map((id) => [id, entry?.amounts?.[id] ?? 0])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry, ids.join(",")],
  );

  const off = ids.reduce((sum, id) => sum + (amounts[id] ?? 0), 0);
  const anyEntered = ids.some((id) => (amounts[id] ?? 0) !== 0);

  const running = useMemo(
    () => ledgerRunning(round.manual, ids, round.holeCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round.manual, ids.join(","), round.holeCount],
  );
  const runningThrough = running[hole - 1] ?? {};

  const copyPrevious = () => {
    const previous = round.manual[hole - 1];
    if (!previous) return;
    let next = round;
    for (const id of ids) {
      next = setManualAmount(next, hole, id, previous.amounts[id] ?? 0);
    }
    update(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => onHoleChange(Math.max(1, hole - 1))}
          disabled={hole <= 1}
        >
          &larr;
        </Button>
        <div className="flex-1 text-center">
          <div className="text-2xl font-bold leading-tight text-turf-900">
            Hole {hole}
          </div>
          <div className="text-sm text-neutral-600">
            Par {info?.par ?? 4}
            {info?.yardage ? ` · ${info.yardage} yds` : ""}
            {info ? ` · SI ${info.strokeIndex}` : ""}
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => onHoleChange(Math.min(round.holeCount, hole + 1))}
          disabled={hole >= round.holeCount}
        >
          &rarr;
        </Button>
      </div>

      <Card>
        <SectionTitle hint="Tap the number to clear it. First tap starts at par.">
          Scores
        </SectionTitle>
        <ul className="divide-y divide-neutral-100">
          {round.players.map((player) => {
            const cell = comp.cells[player.id]?.[hole];
            const strokes = cell?.strokes ?? 0;
            return (
              <li key={player.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-900">
                    {player.name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {strokes > 0
                      ? `${strokes} stroke${strokes > 1 ? "s" : ""}`
                      : strokes < 0
                        ? `gives back ${-strokes}`
                        : "no stroke"}
                    {cell?.net !== null && cell?.net !== undefined
                      ? ` · net ${cell.net}`
                      : ""}
                  </div>
                </div>
                <ScoreStepper
                  label={player.name}
                  par={info?.par ?? 4}
                  value={round.scores[player.id]?.[hole] ?? null}
                  onChange={(value) => update(setScore(round, player.id, hole, value))}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <SectionTitle
          hint="Enter what each player won or lost. The hole has to net to zero."
        >
          Money this hole
        </SectionTitle>

        {anyEntered ? (
          off === 0 ? (
            <Banner tone="good">Balanced — this hole nets to zero.</Banner>
          ) : (
            <Banner tone="warn">
              Off by {formatMoney(Math.abs(off))}.{" "}
              {off > 0 ? "Someone still has to pay it." : "Someone still has to collect it."}{" "}
              Tap a player below to put it on them.
            </Banner>
          )
        ) : (
          <Banner>Nothing on this hole yet.</Banner>
        )}

        <div className="mt-3 space-y-2.5">
          {round.players.map((player) => (
            <div key={player.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-neutral-900">
                  {player.name}
                  {banker === player.id ? (
                    <span className="ml-2 rounded-md bg-turf-100 px-1.5 py-0.5 text-xs font-bold text-turf-800">
                      BANKER
                    </span>
                  ) : null}
                </div>
                <div className="tabular text-xs text-neutral-500">
                  round {formatSigned(runningThrough[player.id] ?? 0)}
                </div>
              </div>
              <div className="w-40">
                <MoneyInput
                  label={`${player.name} money on hole ${hole}`}
                  tone="signed"
                  value={amounts[player.id] ?? 0}
                  onChange={(cents) =>
                    update(setManualAmount(round, hole, player.id, cents))
                  }
                />
              </div>
            </div>
          ))}
        </div>

        {off !== 0 && anyEntered ? (
          <div className="mt-4">
            <div className="mb-1.5 text-sm font-semibold text-neutral-700">
              Put the {formatMoney(Math.abs(off))} on:
            </div>
            <div
              role="group"
              aria-label="Put the remainder on"
              className="flex flex-wrap gap-2"
            >
              {round.players.map((player) => (
                <Button
                  key={player.id}
                  variant="secondary"
                  onClick={() => update(balanceHoleOnto(round, hole, player.id))}
                >
                  {player.name}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 border-t border-neutral-100 pt-3">
          <div className="mb-1.5 text-sm font-semibold text-neutral-700">
            Banker for this hole
          </div>
          <p className="mb-2 text-xs text-neutral-500">
            With a banker set, enter everyone else&apos;s result and the banker
            takes the other side automatically.
          </p>
          <div
            role="group"
            aria-label="Banker for this hole"
            className="flex flex-wrap gap-2"
          >
            <Button
              variant={banker === null ? "primary" : "secondary"}
              onClick={() => update(setBanker(round, hole, null))}
            >
              None
            </Button>
            {round.players.map((player) => (
              <Button
                key={player.id}
                variant={banker === player.id ? "primary" : "secondary"}
                onClick={() =>
                  update(setBanker(round, hole, banker === player.id ? null : player.id))
                }
              >
                {player.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          {hole > 1 ? (
            <Button
              variant="secondary"
              onClick={copyPrevious}
              disabled={!round.manual[hole - 1]}
            >
              Copy hole {hole - 1}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => update(clearHoleMoney(round, hole))}
            disabled={!anyEntered}
          >
            Clear hole
          </Button>
        </div>
      </Card>

      {comp.betResults.some((result) => result.kind === "onedown") ? (
        <Card>
          <SectionTitle hint="A new bet opens on its own when someone goes down. Press to add one by hand.">
            One downs
          </SectionTitle>
          <ul className="space-y-3">
            {comp.betResults
              .filter(
                (result): result is Extract<typeof result, { kind: "onedown" }> =>
                  result.kind === "onedown",
              )
              .map((result) => {
                const presses = result.config.manualPresses?.[hole] ?? 0;
                const [sideA, sideB] = result.config.sides;
                const stack = result.outcome.stacks.find(
                  (entry) => hole >= entry.startHole && hole <= entry.endHole,
                );
                // Each line pairs with the figure it actually describes: the
                // stack standing with the stack money, the 18-hole bet on its
                // own, then the two added up.
                const upText = (cents: number) =>
                  cents === 0
                    ? "all square"
                    : `${cents > 0 ? sideA.name : sideB.name} up ${formatMoney(
                        Math.abs(cents),
                      )}`;
                const stackMoney = stack?.sideTotals[0] ?? 0;
                const overallMoney = result.outcome.overallSideTotals[0];
                const totalMoney = result.outcome.sideTotals[0];

                return (
                  <li key={result.config.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-neutral-900">
                        {result.config.label}
                      </span>
                      <span className="text-xs font-semibold text-neutral-500">
                        {stack?.label}
                      </span>
                    </div>

                    <div className="tabular mt-0.5 break-all font-mono text-lg font-bold text-turf-900">
                      {stack?.standing || "—"}
                    </div>

                    <dl className="mt-1 space-y-0.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">{stack?.label}</dt>
                        <dd
                          className={`tabular font-semibold ${
                            stackMoney === 0
                              ? "text-neutral-400"
                              : stackMoney > 0
                                ? "text-turf-700"
                                : "text-red-700"
                          }`}
                        >
                          {upText(stackMoney)}
                        </dd>
                      </div>
                      {result.outcome.overall ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-neutral-500">
                            Overall 18 ({formatMoney(result.outcome.overall.amount)})
                          </dt>
                          <dd
                            className={`tabular font-semibold ${
                              overallMoney === 0
                                ? "text-neutral-400"
                                : overallMoney > 0
                                  ? "text-turf-700"
                                  : "text-red-700"
                            }`}
                          >
                            {upText(overallMoney)}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-2 border-t border-neutral-100 pt-0.5">
                        <dt className="font-semibold text-neutral-700">Total</dt>
                        <dd
                          className={`tabular font-bold ${
                            totalMoney === 0
                              ? "text-neutral-400"
                              : totalMoney > 0
                                ? "text-turf-700"
                                : "text-red-700"
                          }`}
                        >
                          {upText(totalMoney)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-neutral-600">
                        Presses after {hole}
                      </span>
                      <button
                        type="button"
                        aria-label={`One fewer press after hole ${hole}`}
                        disabled={presses === 0}
                        onClick={() =>
                          update(adjustManualPresses(round, result.config.id, hole, -1))
                        }
                        className="h-9 w-9 shrink-0 rounded-lg bg-neutral-100 text-xl font-bold text-neutral-700 ring-1 ring-inset ring-neutral-200 disabled:text-neutral-300"
                      >
                        &minus;
                      </button>
                      <span
                        className={`tabular w-8 text-center text-base font-bold ${
                          presses > 0 ? "text-turf-800" : "text-neutral-400"
                        }`}
                      >
                        {presses}
                      </span>
                      <button
                        type="button"
                        aria-label={`One more press after hole ${hole}`}
                        onClick={() =>
                          update(adjustManualPresses(round, result.config.id, hole, 1))
                        }
                        className="h-9 w-9 shrink-0 rounded-lg bg-turf-50 text-xl font-bold text-turf-800 ring-1 ring-inset ring-turf-200"
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionTitle hint="Hand-entered money only. The automatic bets settle on the Bets tab.">
          Running money
        </SectionTitle>
        <ul className="grid grid-cols-2 gap-2">
          {round.players.map((player) => {
            const total = runningThrough[player.id] ?? 0;
            return (
              <li
                key={player.id}
                className="flex items-baseline justify-between rounded-xl bg-neutral-50 px-3 py-2"
              >
                <span className="truncate pr-2 text-sm font-semibold text-neutral-800">
                  {player.name}
                </span>
                <span
                  className={`tabular text-base font-bold ${
                    total > 0 ? "text-turf-700" : total < 0 ? "text-red-700" : "text-neutral-400"
                  }`}
                >
                  {formatCompact(total)}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
