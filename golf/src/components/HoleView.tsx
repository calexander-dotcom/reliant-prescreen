"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  aggregateHoles,
  compareSides,
  type HoleResult,
  type PlayedHole,
  type RoundComputation,
} from "@/lib/bets";
import { ledgerRunning } from "@/lib/bets/ledger";
import { perspectiveSign } from "@/lib/bets/nassau";
import {
  MAX_PRESSES_PER_HOLE,
  closeoutScenarios,
  pressesBefore,
  standingEntries,
} from "@/lib/bets/onedown";
import { Standing } from "./Standing";
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
  setStartHole,
} from "@/lib/mutations";
import type { BetConfig, Round } from "@/lib/types";
import { MoneyInput } from "./MoneyInput";
import { ScoreStepper } from "./ScoreStepper";
import { StartHoleGrid } from "./StartHolePicker";
import {
  Banner,
  Button,
  Card,
  CollapsibleCard,
  SectionTitle,
} from "./ui";

/** Green when a side is up, red when down, grey at level. */
function moneyClass(cents: number): string {
  return cents > 0 ? "text-turf-700" : cents < 0 ? "text-red-700" : "text-neutral-400";
}

/**
 * A scrollable row of every hole in play order, the current one enlarged in the
 * middle, tap any to jump. Labels are the numbers on the tee markers, so on a
 * shotgun start off the 7th the row reads 7, 8, 9 … not 1, 2, 3. A hole every
 * player has a score on is ringed, so it is easy to see what still needs one.
 */
function HoleStrip({
  holes,
  current,
  complete,
  onPick,
}: {
  holes: PlayedHole[];
  current: number;
  complete: Set<number>;
  onPick: (position: number) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current]);

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="flex items-center gap-1.5 py-1">
        {holes.map((hole) => {
          const active = hole.number === current;
          const done = complete.has(hole.number);
          return (
            <button
              key={hole.number}
              ref={active ? activeRef : undefined}
              type="button"
              onClick={() => onPick(hole.number)}
              aria-label={`Go to hole ${hole.onCourse}`}
              aria-current={active ? "true" : undefined}
              className={
                active
                  ? "tabular flex h-12 min-w-[3rem] shrink-0 items-center justify-center rounded-xl bg-turf-700 px-3 text-xl font-black text-white shadow"
                  : done
                    ? "tabular flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-lg bg-white px-2 text-sm font-bold text-turf-700 ring-1 ring-inset ring-turf-300"
                    : "tabular flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-lg bg-neutral-100 px-2 text-sm font-semibold text-neutral-500"
              }
            >
              {hole.onCourse}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  // Tee flips the scorer put off with "Ask me later". Kept for the browser
  // session, since the Hole tab is rebuilt on every tab change; the card at
  // the top of the screen still asks quietly.
  const putOffKey = `onedowns.flipPutOff.${round.id}`;
  const [flipsPutOff, setFlipsPutOff] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(putOffKey) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const putOffFlip = (key: string) => {
    const next = new Set(flipsPutOff).add(key);
    setFlipsPutOff(next);
    try {
      sessionStorage.setItem(putOffKey, JSON.stringify([...next]));
    } catch {
      // Private mode or blocked storage: it just asks again next time.
    }
  };
  // Same for the starting hole: put it off and the round plays as the 1st
  // until the setup tab says otherwise.
  const startPutOffKey = `onedowns.startPutOff.${round.id}`;
  const [startPutOff, setStartPutOff] = useState(() => {
    try {
      return sessionStorage.getItem(startPutOffKey) === "1";
    } catch {
      return false;
    }
  });
  const putOffStart = () => {
    setStartPutOff(true);
    try {
      sessionStorage.setItem(startPutOffKey, "1");
    } catch {
      // Private mode or blocked storage: it just asks again next time.
    }
  };
  const info = comp.holes.find((entry) => entry.number === hole) ?? comp.holes[0];
  // `hole` is the position in the play order; these are the numbers on the tee
  // markers, which is all a player wants to read. They differ only when the
  // round started somewhere other than the 1st.
  const shown = info?.onCourse ?? hole;
  const shownBefore = comp.holes[hole - 2]?.onCourse ?? hole - 1;
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

  // Which hole the group teed off on, asked once at the top of the round and
  // before the tee flip, since the flip is on whichever tee that turns out to
  // be. A round that already answered carries a startHole; one that has scores
  // on it is past the point of asking.
  const anyScored = round.players.some((player) =>
    Object.values(round.scores[player.id] ?? {}).some((score) => score !== null),
  );
  const askStartHole = round.startHole === undefined && !anyScored && !startPutOff;

  const flipToAsk = comp.betResults.find(
    (result): result is Extract<typeof result, { kind: "onedown" }> =>
      result.kind === "onedown" &&
      result.outcome.teeFlips.unanswered.includes(hole) &&
      !flipsPutOff.has(`${result.config.id}:${hole}`),
  );

  /*
   * One to play: on the hole that closes a nine (or the round), what each way
   * that hole can go is worth. Only once the rest of the nine is in and this
   * hole is still open — "you have entered the 8th, here is the 9th" — and only
   * for the one-down game.
   */
  const closeout = (() => {
    const bet = comp.betResults.find(
      (result): result is Extract<typeof result, { kind: "onedown" }> =>
        result.kind === "onedown",
    );
    if (!bet) return null;
    const stack = bet.outcome.stacks.find((entry) => entry.endHole === hole);
    if (!stack) return null;
    const base: Record<number, HoleResult> = {};
    for (const [key, sides] of Object.entries(bet.sideScores)) {
      base[Number(key)] = compareSides(sides.a, sides.b);
    }
    // Need the rest of the nine scored, and this hole still to play.
    for (let h = stack.startHole; h < hole; h += 1) {
      if (base[h] === null || base[h] === undefined) return null;
    }
    if (base[hole] !== null && base[hole] !== undefined) return null;
    const scenarios = closeoutScenarios(bet.config, round.holeCount, base, ids, hole);
    if (!scenarios) return null;
    const includesOverall = stack.endHole === round.holeCount && bet.outcome.overall !== null;
    // Greenies ride alongside the match, decided by closest-to-pin rather than
    // who wins the hole, so they are the same whichever way it goes. Show the
    // running tally when any have been won.
    const g = bet.outcome.greenies;
    const greenies =
      g.enabled && g.counts[0] + g.counts[1] > 0
        ? { counts: g.counts, totals: g.totals }
        : null;
    return { sides: bet.config.sides, scenarios, includesOverall, greenies };
  })();

  // Holes every player already has a score on — ringed in the jump strip.
  const completeHoles = new Set(
    comp.holes
      .filter(
        (entry) =>
          round.players.length > 0 &&
          round.players.every((player) => (round.scores[player.id]?.[entry.number] ?? null) !== null),
      )
      .map((entry) => entry.number),
  );

  return (
    <div className="space-y-4">
      {askStartHole ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-hole-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 id="start-hole-title" className="text-lg font-bold text-turf-900">
              Which hole are you starting on?
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              On a shotgun start the front nine is the first nine you play and the
              back nine the second, and the aggregate holes and tee flips follow.
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={() => update(setStartHole(round, 1))}>
                Starting on the 1st
              </Button>
            </div>
            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="mb-2 text-xs font-semibold text-neutral-600">
                Or pick the hole you teed off on
              </p>
              <StartHoleGrid round={round} update={update} />
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={putOffStart}>
                Ask me later
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {flipToAsk ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tee-flip-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 id="tee-flip-title" className="text-lg font-bold text-turf-900">
              Who won the tee flip on {teeName(shown)}?
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              The winners start one up in the opening bet, which opens the first press:
              +1/0 before a ball is hit.
            </p>
            <div className="mt-4">
              <TeeFlipChooser
                round={round}
                config={flipToAsk.config}
                startHole={hole}
                update={update}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                onClick={() => putOffFlip(`${flipToAsk.config.id}:${hole}`)}
              >
                Ask me later
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            ariaLabel="Previous hole"
            onClick={() => onHoleChange(Math.max(1, hole - 1))}
            disabled={hole <= 1}
          >
            &larr;
          </Button>
          <div className="min-w-0 flex-1">
            <HoleStrip
              holes={comp.holes}
              current={hole}
              complete={completeHoles}
              onPick={onHoleChange}
            />
          </div>
          <Button
            variant="secondary"
            ariaLabel="Next hole"
            onClick={() => onHoleChange(Math.min(round.holeCount, hole + 1))}
            disabled={hole >= round.holeCount}
          >
            &rarr;
          </Button>
        </div>
        <div className="mt-1 text-center text-sm text-neutral-600">
          Hole {shown} · Par {info?.par ?? 4}
          {info?.yardage ? ` · ${info.yardage} yds` : ""}
          {info ? ` · SI ${info.strokeIndex}` : ""}
        </div>
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
                Tee flip on {teeName(shown)}
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

                    <div className="tabular mt-0.5 break-all font-mono text-2xl font-normal text-turf-900">
                      <Standing entries={stack ? standingEntries(stack, sign) : []} />
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

      {closeout ? (
        <Card>
          <SectionTitle hint="One hole to play in this nine. What each way it can go is worth — the score you are about to enter is not counted yet.">
            One to play
            {closeout.includesOverall ? " · includes the 18-hole bet" : ""}
          </SectionTitle>
          <table className="tabular w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-1.5 pr-2 text-left font-semibold">If the hole is</th>
                <th className="px-1 py-1.5 text-left font-semibold">Nine ends</th>
                <th className="px-1 py-1.5 text-right font-semibold">
                  <span className="ml-auto block max-w-[5rem] truncate">
                    {closeout.sides[0].name}
                  </span>
                </th>
                <th className="px-1 py-1.5 text-right font-semibold">
                  <span className="ml-auto block max-w-[5rem] truncate">
                    {closeout.sides[1].name}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [`${closeout.sides[0].name} win`, closeout.scenarios.a],
                  ["Halved", closeout.scenarios.halve],
                  [`${closeout.sides[1].name} win`, closeout.scenarios.b],
                ] as const
              ).map(([label, outcome], index) => (
                <tr key={index} className="border-b border-neutral-100 last:border-0">
                  <td className="py-1.5 pr-2 text-left font-semibold text-neutral-800">
                    {label}
                  </td>
                  <td className="px-1 py-1.5 text-left font-mono text-xs text-neutral-700">
                    <Standing entries={outcome.standing} empty="AS" />
                  </td>
                  <td
                    className={`px-1 py-1.5 text-right font-bold ${moneyClass(
                      outcome.playerTotals[closeout.sides[0].playerIds[0]] ?? 0,
                    )}`}
                  >
                    {formatCompact(outcome.playerTotals[closeout.sides[0].playerIds[0]] ?? 0)}
                  </td>
                  <td
                    className={`px-1 py-1.5 text-right font-bold ${moneyClass(
                      outcome.playerTotals[closeout.sides[1].playerIds[0]] ?? 0,
                    )}`}
                  >
                    {formatCompact(outcome.playerTotals[closeout.sides[1].playerIds[0]] ?? 0)}
                  </td>
                </tr>
              ))}
              {closeout.greenies ? (
                <tr className="border-t border-neutral-200 align-top">
                  <td className="py-1.5 pr-2 text-left font-semibold text-neutral-800">
                    Greenies
                  </td>
                  <td className="px-1 py-1.5 text-left text-xs text-neutral-500">
                    {closeout.includesOverall ? "final" : "so far"}
                  </td>
                  {[0, 1].map((side) => {
                    const count = closeout.greenies!.counts[side];
                    const cents =
                      closeout.greenies!.totals[closeout.sides[side].playerIds[0]] ?? 0;
                    return (
                      <td key={side} className="px-1 py-1.5 text-right">
                        <span className="tabular whitespace-nowrap text-xs">
                          <span className="font-semibold text-neutral-600">{count}g</span>{" "}
                          <span className={`font-bold ${moneyClass(cents)}`}>
                            {formatCompact(cents)}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-neutral-500">
            Money is per player.
            {closeout.greenies
              ? " Greenies are closest-to-the-pin on the par 3s and net between the sides."
              : ""}
          </p>
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
            const rec = comp.reconcile[player.id]?.[hole];
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
                  {rec?.status === "mismatch" && rec.gg !== null ? (
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <span className="gg-pulse font-bold text-red-600">
                        Golf Genius: {rec.gg}
                      </span>
                      <button
                        type="button"
                        onClick={() => update(setScore(round, player.id, hole, rec.gg))}
                        className="rounded-md bg-red-50 px-1.5 py-0.5 font-semibold text-red-700 ring-1 ring-inset ring-red-200"
                      >
                        use {rec.gg}
                      </button>
                    </div>
                  ) : rec?.status === "from-gg" && rec.gg !== null ? (
                    <div className="mt-1 text-xs font-semibold text-turf-600">
                      From Golf Genius: {rec.gg} · counting
                    </div>
                  ) : rec?.status === "match" ? (
                    <div className="mt-1 text-xs text-turf-600">Golf Genius ✓</div>
                  ) : null}
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
                aria-label={`Greenie on hole ${shown}`}
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
              ? `No extra press before ${shown}.`
              : `${presses} extra press${presses === 1 ? "" : "es"} before ${shown}.`;
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
                ? `Shows in the standing once hole ${shownBefore} is scored.`
                : `In the standing above as ${presses === 1 ? "a bet" : `${presses} bets`} from ${shown}.`;
          return (
            <CollapsibleCard
              key={`press-${result.config.id}`}
              title={`Extra presses before ${shown}`}
              hint={`Each one opens another bet by hand from here to the end of the nine — up to ${MAX_PRESSES_PER_HOLE} a hole. The game opens its own when someone is down.`}
              summary={pressSummary}
              storageKey="hole.press"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`One fewer press before hole ${shown}`}
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
                  aria-label={`One more press before hole ${shown}`}
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

      {/* Hand-entered money is only the game under banker or no automatic
          game; the score-based games work it out. Show it there, and on any
          hole that already has money on it so an entry is never orphaned. */}
      {moneyOpenByDefault || anyEntered ? (
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
                  label={`${player.name} money on hole ${shown}`}
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
              Copy hole {shownBefore}
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
      ) : null}

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
    </div>
  );
}
