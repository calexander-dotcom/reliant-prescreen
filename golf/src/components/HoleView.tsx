"use client";

import { useMemo } from "react";
import { aggregateHoles, type RoundComputation } from "@/lib/bets";
import { ledgerRunning } from "@/lib/bets/ledger";
import { perspectiveSign } from "@/lib/bets/nassau";
import { MAX_PRESSES_PER_HOLE, pressesBefore, standingFor } from "@/lib/bets/onedown";
import { TeeFlipChooser, teeName } from "./TeeFlipChooser";
import { TotalsStrip } from "./TotalsStrip";
import { formatCompact, formatMoney, formatSigned } from "@/lib/money";
import {
  balanceHoleOnto,
  clearHoleMoney,
  setBanker,
  setManualAmount,
  setScore,
  adjustPressesBefore,
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

      {comp.betResults
        .filter(
          (result): result is Extract<typeof result, { kind: "onedown" }> =>
            result.kind === "onedown" && result.outcome.teeFlips.holes.includes(hole),
        )
        .map((result) => {
          const answered = !result.outcome.teeFlips.unanswered.includes(hole);
          const won =
            result.outcome.stacks.find((stack) => stack.startHole === hole)?.teeFlip ?? null;
          return (
            <Card key={`flip-${result.config.id}`}>
              <SectionTitle hint="The side that wins the flip starts one up in the opening bet, which opens the first press: +1/0 before a ball is hit.">
                Tee flip on {teeName(hole)}
              </SectionTitle>
              {!answered ? <Banner tone="warn">Who won the tee flip?</Banner> : null}
              {answered ? (
                <Banner tone={won !== null ? "good" : undefined}>
                  {won !== null
                    ? `${result.config.sides[won].name} won it and start 1 up.`
                    : "No flip on this tee."}
                </Banner>
              ) : null}
              <div className="mt-3">
                <TeeFlipChooser
                  round={round}
                  config={result.config}
                  startHole={hole}
                  update={update}
                />
              </div>
            </Card>
          );
        })}

      {comp.betResults.some((result) => result.kind === "onedown") ? (
        <Card>
          <SectionTitle>One downs</SectionTitle>
          <ul className="space-y-3">
            {comp.betResults
              .filter(
                (result): result is Extract<typeof result, { kind: "onedown" }> =>
                  result.kind === "onedown",
              )
              .map((result) => {
                const stack = result.outcome.stacks.find(
                  (entry) => hole >= entry.startHole && hole <= entry.endHole,
                );
                // Read from the scorer's side: positive is "us".
                const sign = perspectiveSign(result.config.sides, round.perspectiveId);
                // The 18-hole bet as one signed number, like the standing.
                const overallMargin = (result.outcome.overall?.margin ?? 0) * sign;
                const overallText =
                  overallMargin === 0
                    ? "even"
                    : overallMargin > 0
                      ? `+${overallMargin}`
                      : String(overallMargin);

                return (
                  <li key={result.config.id}>
                    <div className="text-xs font-semibold text-neutral-500">{stack?.label}</div>
                    {result.config.alternateAggregate !== false &&
                    aggregateHoles(round.holeCount).includes(hole) ? (
                      <p className="mt-0.5 text-xs font-semibold text-amber-700">
                        Aggregate hole — both partners&apos; scores count.
                      </p>
                    ) : null}

                    <div className="tabular mt-0.5 break-all font-mono text-2xl font-bold text-turf-900">
                      {stack ? standingFor(stack, sign) || "—" : "—"}
                    </div>

                    {result.outcome.overall ? (
                      <div className="mt-1 text-sm text-neutral-700">
                        Overall:{" "}
                        <span
                          className={`tabular font-semibold ${
                            overallMargin === 0
                              ? "text-neutral-500"
                              : overallMargin > 0
                                ? "text-turf-700"
                                : "text-red-700"
                          }`}
                        >
                          {overallText}
                        </span>
                      </div>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </Card>
      ) : null}

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

      {comp.betResults
        .filter(
          (result): result is Extract<typeof result, { kind: "onedown" }> =>
            result.kind === "onedown",
        )
        .map((result) => {
          const presses = pressesBefore(result.config, hole);
          const pressSummary =
            presses === 0
              ? `No extra press before ${hole}.`
              : `${presses} extra press${presses === 1 ? "" : "es"} before ${hole}.`;
          // A press joins the standing once the hole before it is scored, so
          // the box says which it is rather than looking like it did nothing.
          const stack = result.outcome.stacks.find(
            (entry) => hole >= entry.startHole && hole <= entry.endHole,
          );
          const live = stack
            ? stack.bets.filter((bet) => bet.openedBy === "manual" && bet.startHole === hole).length
            : 0;
          const waiting = presses > live;
          const pressStatus =
            presses === 0
              ? null
              : waiting
                ? `Shows in the standing once hole ${hole - 1} is scored.`
                : `In the standing above as ${presses === 1 ? "a bet" : `${presses} bets`} from ${hole}.`;
          return (
            <CollapsibleCard
              key={`press-${result.config.id}`}
              title={`Extra presses before ${hole}`}
              hint={`Each one opens another bet by hand from here to the end of the nine — up to ${MAX_PRESSES_PER_HOLE} a hole. The game opens its own when someone is down.`}
              summary={pressSummary}
              storageKey="hole.press"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`One fewer press before hole ${hole}`}
                  disabled={presses === 0}
                  onClick={() => update(adjustPressesBefore(round, result.config.id, hole, -1))}
                  className="h-11 w-11 shrink-0 rounded-xl bg-neutral-100 text-2xl font-bold text-neutral-700 ring-1 ring-inset ring-neutral-200 disabled:text-neutral-300"
                >
                  &minus;
                </button>
                <span
                  className={`tabular w-10 text-center text-xl font-bold ${
                    presses > 0 ? "text-turf-800" : "text-neutral-400"
                  }`}
                >
                  {presses}
                </span>
                <button
                  type="button"
                  aria-label={`One more press before hole ${hole}`}
                  disabled={presses >= MAX_PRESSES_PER_HOLE}
                  onClick={() => update(adjustPressesBefore(round, result.config.id, hole, 1))}
                  className="h-11 w-11 shrink-0 rounded-xl bg-turf-50 text-2xl font-bold text-turf-800 ring-1 ring-inset ring-turf-200 disabled:text-turf-800/30"
                >
                  +
                </button>
              </div>
              {pressStatus ? (
                <p
                  className={`mt-2 text-xs font-semibold ${
                    waiting ? "text-amber-700" : "text-turf-700"
                  }`}
                >
                  {pressStatus}
                </p>
              ) : null}
            </CollapsibleCard>
          );
        })}

      <TotalsStrip round={round} comp={comp} />

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
