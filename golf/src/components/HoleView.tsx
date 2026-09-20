"use client";

import { useMemo } from "react";
import { aggregateHoles, type RoundComputation } from "@/lib/bets";
import { ledgerRunning } from "@/lib/bets/ledger";
import { perspectiveSign, sideUp } from "@/lib/bets/nassau";
import { standingFor } from "@/lib/bets/onedown";
import { formatCompact, formatMoney, formatSigned } from "@/lib/money";
import {
  balanceHoleOnto,
  clearHoleMoney,
  setBanker,
  setManualAmount,
  setScore,
  adjustManualPresses,
  cycleBankerDouble,
  setHoleBanker,
  setGreenie,
} from "@/lib/mutations";
import type { BetConfig, Round } from "@/lib/types";
import { MoneyByNine } from "./MoneyByNine";
import { MoneyInput } from "./MoneyInput";
import { ScoreStepper } from "./ScoreStepper";
import {
  Banner,
  Button,
  Card,
  CollapsibleCard,
  SectionTitle,
} from "./ui";

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

  // One game a round. The money card is where a banker hole gets typed in;
  // under the games that work the money out from the scores it is noise, so
  // there it starts folded — and each game remembers its own choice.
  const game: BetConfig["kind"] | "none" =
    round.bets.length > 0 ? round.bets[0].kind : "none";
  const moneyOpenByDefault = game === "banker" || game === "none";
  const moneySummary = !anyEntered
    ? "Nothing on this hole."
    : off !== 0
      ? `Off by ${formatMoney(Math.abs(off))}.`
      : round.players
          .map(
            (player) =>
              `${player.name.split(" ")[0]} ${formatCompact(amounts[player.id] ?? 0)}`,
          )
          .join(" · ");

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

      <CollapsibleCard
        title="Scores"
        storageKey="hole.scores"
        hint="Tap the number to clear it. First tap starts at par."
        summary={
          round.players.some(
            (player) => (round.scores[player.id]?.[hole] ?? null) !== null,
          )
            ? round.players
                .map(
                  (player) =>
                    `${player.name.split(" ")[0]} ${
                      round.scores[player.id]?.[hole] ?? "–"
                    }`,
                )
                .join(" · ")
            : "Nothing entered on this hole"
        }
      >
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
      </CollapsibleCard>

      {/* Greenies: on a par 3, once the scores are in, who was closest? */}
      {comp.betResults
        .filter(
          (result): result is Extract<typeof result, { kind: "onedown" }> =>
            result.kind === "onedown" && result.outcome.greenies.enabled,
        )
        .filter(() => info?.par === 3)
        .map((result) => {
          const winners = result.config.greenieWinners ?? {};
          const answered = hole in winners;
          const winner = winners[hole];
          const scoresIn = round.players.every(
            (player) => (round.scores[player.id]?.[hole] ?? null) !== null,
          );
          const [sideA, sideB] = result.config.sides;
          const wonBy =
            winner && sideA.playerIds.includes(winner)
              ? sideA.name
              : winner && sideB.playerIds.includes(winner)
                ? sideB.name
                : null;
          return (
            <Card key={`greenie-${result.config.id}`}>
              <SectionTitle hint="Closest to the hole takes a greenie for their side, worth a bet. Every par 3 to one side doubles them.">
                Greenie
              </SectionTitle>
              {!answered && scoresIn ? (
                <Banner tone="warn">Scores are in — who won the greenie?</Banner>
              ) : null}
              {answered ? (
                <Banner tone={winner ? "good" : undefined}>
                  {winner
                    ? `${round.players.find((p) => p.id === winner)?.name ?? "—"} — a greenie to ${wonBy ?? "nobody in the game"}.`
                    : "Nobody won this one."}
                </Banner>
              ) : null}
              <div
                role="group"
                aria-label={`Greenie on hole ${hole}`}
                className="mt-3 flex flex-wrap gap-2"
              >
                {round.players.map((player) => (
                  <Button
                    key={player.id}
                    variant={winner === player.id ? "primary" : "secondary"}
                    onClick={() =>
                      update(
                        setGreenie(
                          round,
                          result.config.id,
                          hole,
                          winner === player.id ? undefined : player.id,
                        ),
                      )
                    }
                  >
                    {player.name.split(" ")[0]}
                  </Button>
                ))}
                <Button
                  variant={answered && winner === null ? "primary" : "ghost"}
                  onClick={() =>
                    update(
                      setGreenie(
                        round,
                        result.config.id,
                        hole,
                        answered && winner === null ? undefined : null,
                      ),
                    )
                  }
                >
                  Nobody
                </Button>
              </div>
            </Card>
          );
        })}

      <CollapsibleCard
        title="Money this hole"
        hint="Enter what each player won or lost. Fill in all but one and the last fills itself, since it has to net to zero."
        summary={moneySummary}
        storageKey={`hole.money.${game}`}
        defaultOpen={moneyOpenByDefault}
      >
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
            /*
             * Keyed by hole as well as player on purpose. The money field keeps
             * its won/lost direction in local state, so that the sign button
             * works on an empty cell. Without the hole in the key React reuses
             * the same field when you walk to the next hole and that direction
             * comes with it — you would type 5 into a cell that was a loss last
             * hole and silently enter minus five.
             */
            <div key={`${player.id}-${hole}`} className="flex items-center gap-3">
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
      </CollapsibleCard>

      {comp.betResults
        .filter(
          (result): result is Extract<typeof result, { kind: "banker" }> =>
            result.kind === "banker",
        )
        .map((result) => {
          const holeState = result.outcome.holes[hole - 1];
          const bankerId = holeState?.bankerId ?? null;
          const bankerName =
            round.players.find((player) => player.id === bankerId)?.name ?? "—";
          const bankerMoney = holeState?.amounts[bankerId ?? ""] ?? 0;

          return (
            <Card key={result.config.id}>
              <SectionTitle
                hint={
                  [
                    result.config.source === "manual"
                      ? "Money comes from what you enter below."
                      : null,
                    result.config.rotation === "most-money"
                      ? "The deal passes to whoever won the most on the hole."
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              >
                {result.config.label}
              </SectionTitle>

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-neutral-600">
                  <strong className="font-bold text-neutral-900">{bankerName}</strong>{" "}
                  has the deal
                </span>
                <span
                  className={`tabular text-base font-bold ${
                    bankerMoney > 0
                      ? "text-turf-700"
                      : bankerMoney < 0
                        ? "text-red-700"
                        : "text-neutral-400"
                  }`}
                >
                  {holeState?.settled ? formatSigned(bankerMoney) : "open"}
                </span>
              </div>

              {/* Each opponent's own stake: flat, doubled, or doubled back. */}
              <ul className="mt-3 space-y-1.5">
                {round.players
                  .filter(
                    (player) =>
                      result.config.playerIds.includes(player.id) &&
                      player.id !== bankerId,
                  )
                  .map((player) => {
                    const bet = holeState?.bets.find(
                      (entry) => entry.playerId === player.id,
                    );
                    const multiplier = bet?.multiplier ?? 1;
                    return (
                      <li key={player.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
                          {player.name}
                        </span>
                        <span
                          className={`tabular w-16 text-right text-sm font-bold ${
                            (bet?.delta ?? 0) > 0
                              ? "text-turf-700"
                              : (bet?.delta ?? 0) < 0
                                ? "text-red-700"
                                : "text-neutral-400"
                          }`}
                        >
                          {holeState?.settled ? formatSigned(bet?.delta ?? 0) : "—"}
                        </span>
                        {/* Doubling only means something when the app is
                            working the money out from the scores. */}
                        {result.config.source === "scores" ? (
                          <Button
                            variant={multiplier > 1 ? "primary" : "secondary"}
                            ariaLabel={`Change ${player.name}'s stake, now ${multiplier} times`}
                            onClick={() =>
                              update(
                                cycleBankerDouble(
                                  round,
                                  result.config.id,
                                  hole,
                                  player.id,
                                ),
                              )
                            }
                          >
                            {multiplier}x
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>

              <div className="mt-3 border-t border-neutral-100 pt-3">
                <div className="mb-1.5 text-sm font-semibold text-neutral-700">
                  Hand the deal to
                </div>
                <div
                  role="group"
                  aria-label="Hand the deal to"
                  className="flex flex-wrap gap-2"
                >
                  {round.players
                    .filter((player) => result.config.playerIds.includes(player.id))
                    .map((player) => (
                      <Button
                        key={player.id}
                        variant={bankerId === player.id ? "primary" : "secondary"}
                        onClick={() =>
                          update(
                            setHoleBanker(
                              round,
                              result.config.id,
                              hole,
                              // Tapping the current banker clears the override.
                              result.config.bankerByHole?.[hole] === player.id
                                ? null
                                : player.id,
                            ),
                          )
                        }
                      >
                        {player.name}
                      </Button>
                    ))}
                </div>
                {result.config.bankerByHole?.[hole] ? (
                  <p className="mt-1.5 text-xs text-amber-700">
                    Set by hand for this hole. Tap again to go back to the rotation.
                  </p>
                ) : null}
              </div>
            </Card>
          );
        })}

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
                // Money per head where that is how it is said: a pair seven
                // bets up is "up $70 each", not "up $140".
                const upText = (cents: number) => {
                  if (cents === 0) return "all square";
                  const leader = cents > 0 ? sideA : sideB;
                  const up = sideUp(Math.abs(cents), leader, result.config.stakeMode);
                  return `${leader.name} up ${formatMoney(up.cents)}${up.each ? " each" : ""}`;
                };
                const stackMoney = stack?.sideTotals[0] ?? 0;
                const overallMoney = result.outcome.overallSideTotals[0];
                const totalMoney = result.outcome.sideTotals[0];
                // Read from the scorer's side: positive and green are "us".
                const sign = perspectiveSign(result.config.sides, round.perspectiveId);

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
                    {result.config.alternateAggregate !== false &&
                    aggregateHoles(round.holeCount).includes(hole) ? (
                      <p className="mt-0.5 text-xs font-semibold text-amber-700">
                        Aggregate hole — both partners&apos; scores count.
                      </p>
                    ) : null}

                    <div className="tabular mt-0.5 break-all font-mono text-lg font-bold text-turf-900">
                      {stack ? standingFor(stack, sign) || "—" : "—"}
                    </div>

                    <dl className="mt-1 space-y-0.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">{stack?.label}</dt>
                        <dd
                          className={`tabular font-semibold ${
                            stackMoney === 0
                              ? "text-neutral-400"
                              : stackMoney * sign > 0
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
                                : overallMoney * sign > 0
                                  ? "text-turf-700"
                                  : "text-red-700"
                            }`}
                          >
                            {upText(overallMoney)}
                          </dd>
                        </div>
                      ) : null}
                      {result.outcome.greenies.enabled ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-neutral-500">
                            Greenies {result.outcome.greenies.counts[sign > 0 ? 0 : 1]}–
                            {result.outcome.greenies.counts[sign > 0 ? 1 : 0]}
                            {result.outcome.greenies.sweptBy !== null ? " · swept, doubled" : ""}
                          </dt>
                          <dd
                            className={`tabular font-semibold ${
                              result.outcome.greenies.sideTotals[0] === 0
                                ? "text-neutral-400"
                                : result.outcome.greenies.sideTotals[0] * sign > 0
                                  ? "text-turf-700"
                                  : "text-red-700"
                            }`}
                          >
                            {upText(result.outcome.greenies.sideTotals[0])}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-2 border-t border-neutral-100 pt-0.5">
                        <dt className="font-semibold text-neutral-700">Total</dt>
                        <dd
                          className={`tabular font-bold ${
                            totalMoney === 0
                              ? "text-neutral-400"
                              : totalMoney * sign > 0
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
        <SectionTitle
          hint={`Hand-entered holes and the game together, by nine — the same figures as the Card tab.${
            comp.nineTotals.hasOverall ? " Overall is the whole-round bet." : ""
          }`}
        >
          Running money
        </SectionTitle>
        <MoneyByNine round={round} comp={comp} />
      </Card>
    </div>
  );
}
