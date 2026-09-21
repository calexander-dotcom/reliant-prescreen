"use client";

import { useState } from "react";
import type { BetResult, RoundComputation } from "@/lib/bets";
import { matchStanding } from "@/lib/bets/nassau";
import {
  MAX_PRESSES_PER_HOLE,
  betStanding,
  pressesBefore,
  standingEntries,
} from "@/lib/bets/onedown";
import { Standing } from "./Standing";
import { perspectiveSign, sideUp } from "@/lib/bets/nassau";
import { adjustPressesBefore, setPerspective } from "@/lib/mutations";
import { formatMoney, formatSigned } from "@/lib/money";
import type { OneDownConfig, Round } from "@/lib/types";
import { BetEditor, BetSummaryLine } from "./BetEditor";
import { TeeFlipChooser, teeName } from "./TeeFlipChooser";
import { Banner, Button, Card, SectionTitle } from "./ui";

/** Live status of every automatic bet, and the editor to change the terms. */
export function BetsView({
  round,
  comp,
  update,
  readOnly = false,
}: {
  round: Round;
  comp: RoundComputation;
  update?: (next: Round) => void;
  /** Followers see the standings but no way to change the terms. */
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(!readOnly && round.bets.length === 0);

  const nameOf = (playerId: string) =>
    round.players.find((player) => player.id === playerId)?.name ?? "—";

  const sided = comp.betResults.some(
    (result) => result.kind === "nassau" || result.kind === "onedown",
  );

  return (
    <div className="space-y-4">
      {round.bets.length === 0 && !editing ? (
        <Banner>
          No automatic bets set up. Money entered by hand still works on the Hole
          tab.
        </Banner>
      ) : null}

      {comp.betResults.map((result) => (
        <BetResultCard
          key={result.config.id}
          result={result}
          nameOf={nameOf}
          comp={comp}
          perspectiveId={round.perspectiveId}
        />
      ))}

      {!readOnly && update
        ? comp.betResults
            .filter(
              (result): result is Extract<BetResult, { kind: "onedown" }> =>
                result.kind === "onedown",
            )
            .map((result) => (
              <PressesCard
                key={result.config.id}
                round={round}
                result={result}
                onlyBet={round.bets.filter((entry) => entry.kind === "onedown").length === 1}
                update={update}
              />
            ))
        : null}

      {sided && !readOnly && update ? (
        <Card>
          <SectionTitle hint="Positive numbers and green mean that player's side is up. Anyone following the round sees it the same way.">
            Read the bets as
          </SectionTitle>
          <div role="group" aria-label="Read the bets as" className="flex flex-wrap gap-2">
            {round.players.map((player) => (
              <Button
                key={player.id}
                variant={round.perspectiveId === player.id ? "primary" : "secondary"}
                onClick={() => update(setPerspective(round, player.id))}
              >
                {player.name.split(" ")[0]}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between gap-2">
          <SectionTitle hint="Stakes, sides, presses and skins rules.">
            Bet setup
          </SectionTitle>
          {readOnly ? null : (
            <Button variant="secondary" onClick={() => setEditing((value) => !value)}>
              {editing ? "Done" : "Edit"}
            </Button>
          )}
        </div>
        {editing && update ? (
          <BetEditor round={round} update={update} />
        ) : (
          <ul className="space-y-2 text-sm text-neutral-600">
            {round.bets.map((bet) => (
              <li key={bet.id}>
                <span className="font-semibold text-neutral-900">
                  {bet.label} {formatMoney(bet.amount)}
                </span>{" "}
                — <BetSummaryLine bet={bet} players={round.players} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BetResultCard({
  result,
  nameOf,
  comp,
  perspectiveId,
}: {
  result: BetResult;
  nameOf: (playerId: string) => string;
  comp: RoundComputation;
  perspectiveId: string | null | undefined;
}) {
  const totals = result.outcome.totals;
  // Which way round the match is read: positive and green are "our" side.
  const sign =
    result.kind === "nassau" || result.kind === "onedown"
      ? perspectiveSign(result.config.sides, perspectiveId)
      : 1;

  return (
    <Card>
      <SectionTitle
        hint={
          result.kind === "nassau"
            ? `${formatMoney(result.config.amount)} per segment ${stakeWord(
                result.config.stakeMode,
              )} · ${result.config.basis} · ${
                result.config.autoPressAt > 0
                  ? `press at ${result.config.autoPressAt} down`
                  : "no presses"
              }`
            : result.kind === "banker"
              ? result.config.source === "manual"
                ? "Money as entered on each hole · tracks who holds the deal"
                : `${formatMoney(result.config.amount)} a player per hole · ${
                    result.config.basis
                  }`
              : result.kind === "onedown"
              ? `${formatMoney(result.config.amount)} a bet ${stakeWord(
                  result.config.stakeMode,
                )} · ${result.config.basis} · ${
                  result.config.autoPressAt > 0
                    ? `new bet at ${result.config.autoPressAt} down`
                    : "presses by hand"
                }`
              : `${formatMoney(result.config.amount)} per player per skin · ${
                  result.config.basis
                }`
        }
      >
        {result.config.label}
      </SectionTitle>

      {result.kind === "onedown" ? (
        <OneDownBody result={result} sign={sign} nameOf={nameOf} />
      ) : result.kind === "banker" ? (
        <BankerBody result={result} nameOf={nameOf} />
      ) : result.kind === "nassau" ? (
        <ul className="space-y-1.5">
          {result.outcome.matches.map((match) => (
            <li
              key={match.id}
              className={`flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 ${
                match.depth > 0 ? "ml-4 bg-neutral-50" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-neutral-900">
                  {match.label}
                  {match.depth > 0 ? (
                    <span className="ml-1 text-xs font-normal text-neutral-500">
                      holes {match.startHole}&ndash;{match.endHole}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-neutral-600">
                  {matchStanding(match, result.config.sides)}
                </div>
              </div>
              <span
                className={`shrink-0 text-sm font-bold ${
                  match.status === "in-progress"
                    ? "text-neutral-400"
                    : match.status === "halved"
                      ? "text-neutral-500"
                      : (match.status === "won-a" ? sign : -sign) > 0
                        ? "text-turf-700"
                        : "text-red-700"
                }`}
              >
                {match.status === "in-progress"
                  ? "live"
                  : match.status === "halved"
                    ? "push"
                    : formatMoney(match.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <SkinsList result={result} nameOf={nameOf} />
      )}

      <ul className="mt-3 grid grid-cols-2 gap-1.5 border-t border-neutral-100 pt-3">
        {Object.entries(totals)
          .filter(([playerId]) => comp.grandTotals[playerId] !== undefined)
          .map(([playerId, amount]) => (
            <li key={playerId} className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-neutral-700">
                {nameOf(playerId)}
              </span>
              <span
                className={`tabular text-sm font-bold ${
                  amount > 0
                    ? "text-turf-700"
                    : amount < 0
                      ? "text-red-700"
                      : "text-neutral-400"
                }`}
              >
                {formatSigned(amount)}
              </span>
            </li>
          ))}
      </ul>
    </Card>
  );
}

/**
 * The tee flip and the presses called before each hole, for the whole card
 * at once, so they can be set on the 1st tee or the night before. A press
 * before a hole opens another bet by hand from that hole to the end of its
 * nine.
 */
function PressesCard({
  round,
  result,
  onlyBet,
  update,
}: {
  round: Round;
  result: Extract<BetResult, { kind: "onedown" }>;
  onlyBet: boolean;
  update: (next: Round) => void;
}) {
  // The computed config carries the sides' live labels.
  const bet: OneDownConfig = result.config;
  const flipHoles = result.outcome.teeFlips.holes;
  const holes = Array.from({ length: round.holeCount }, (_, index) => index + 1);
  const called = holes.reduce((sum, hole) => sum + pressesBefore(bet, hole), 0);
  // Front nine down the left, back nine down the right, so a phone shows
  // the whole card without scrolling.
  const columns =
    round.holeCount > 9 ? [holes.slice(0, 9), holes.slice(9)] : [holes];

  return (
    <Card>
      <SectionTitle
        hint={`The side that wins the flip on a tee starts one up in that nine's opening bet, which opens the first press: +1/0 before a ball is hit. A press before a hole opens another bet by hand from that hole to the end of the nine — up to ${MAX_PRESSES_PER_HOLE} a hole. Set them here before the round or on the hole screen as you go.`}
      >
        Tee flips and presses{onlyBet ? "" : ` · ${bet.label}`}
      </SectionTitle>
      <div className="mb-3 space-y-3 border-b border-neutral-100 pb-3">
        {flipHoles.map((startHole) => (
          <TeeFlipChooser
            key={startHole}
            round={round}
            config={bet}
            startHole={startHole}
            update={update}
            label={`Flip on ${teeName(startHole)}`}
          />
        ))}
        {flipHoles.length === 0 ? (
          <p className="text-xs text-neutral-500">Tee flips are off in the bet setup.</p>
        ) : null}
      </div>
      <div
        role="group"
        aria-label={`Presses before each hole${onlyBet ? "" : ` for ${bet.label}`}`}
        className="grid grid-cols-2 gap-x-4 gap-y-1"
      >
        {columns.map((column, columnIndex) => (
          <ul key={columnIndex} className="space-y-1">
            {column.map((hole) => {
              const count = pressesBefore(bet, hole);
              return (
                <li key={hole} className="flex items-center gap-1.5">
                  <span
                    className={`tabular w-7 shrink-0 text-right text-sm font-semibold ${
                      count > 0 ? "text-turf-900" : "text-neutral-500"
                    }`}
                  >
                    {hole}
                  </span>
                  <button
                    type="button"
                    aria-label={`One fewer press before hole ${hole}`}
                    disabled={count === 0}
                    onClick={() => update(adjustPressesBefore(round, bet.id, hole, -1))}
                    className="h-8 w-8 shrink-0 rounded-lg bg-neutral-100 text-lg font-bold text-neutral-700 ring-1 ring-inset ring-neutral-200 disabled:text-neutral-300"
                  >
                    &minus;
                  </button>
                  <span
                    className={`tabular w-6 text-center text-sm font-bold ${
                      count > 0 ? "text-turf-800" : "text-neutral-300"
                    }`}
                  >
                    {count}
                  </span>
                  <button
                    type="button"
                    aria-label={`One more press before hole ${hole}`}
                    disabled={count >= MAX_PRESSES_PER_HOLE}
                    onClick={() => update(adjustPressesBefore(round, bet.id, hole, 1))}
                    className="h-8 w-8 shrink-0 rounded-lg bg-turf-50 text-lg font-bold text-turf-800 ring-1 ring-inset ring-turf-200 disabled:text-turf-800/30"
                  >
                    +
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {called === 0
          ? "No presses called ahead."
          : `${called} press${called === 1 ? "" : "es"} called: ${holes
              .filter((hole) => pressesBefore(bet, hole) > 0)
              .map((hole) => {
                const count = pressesBefore(bet, hole);
                return `${count > 1 ? `${count} ` : ""}before ${hole}`;
              })
              .join(", ")}.`}
      </p>
    </Card>
  );
}

/** For the summary line under a game's name. */
function stakeWord(mode: "per-side" | "per-player"): string {
  return mode === "per-player" ? "per player" : "per side";
}

function OneDownBody({
  result,
  sign,
  nameOf,
}: {
  result: Extract<BetResult, { kind: "onedown" }>;
  sign: 1 | -1;
  nameOf: (playerId: string) => string;
}) {
  const { outcome, config } = result;
  const [sideA, sideB] = config.sides;
  const [totalA] = outcome.sideTotals;

  const upLine = (cents: number) => {
    if (cents === 0) return <span className="text-neutral-400">all square</span>;
    const leader = cents > 0 ? sideA : sideB;
    const up = sideUp(Math.abs(cents), leader, config.stakeMode);
    return (
      <span className={cents * sign > 0 ? "text-turf-700" : "text-red-700"}>
        {leader.name} up {formatMoney(up.cents)}
        {up.each ? " each" : ""}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {outcome.stacks.map((stack) => (
        <div key={stack.label}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-neutral-900">
              {stack.label}
            </span>
            <span className="tabular text-sm font-bold">
              {upLine(stack.sideTotals[0])}
            </span>
          </div>

          {/* The standing as it gets said out loud: one number per open bet. */}
          <div className="mt-1 rounded-xl bg-neutral-900 px-3 py-2">
            <div className="tabular break-all font-mono text-lg font-normal text-white">
              <Standing entries={standingEntries(stack, sign)} />
            </div>
            <div className="mt-0.5 text-xs text-neutral-400">
              {stack.bets.length} bet{stack.bets.length === 1 ? "" : "s"} ·{" "}
              {sign > 0
                ? `${stack.led.a} to ${sideA.name} · ${stack.led.b} to ${sideB.name}`
                : `${stack.led.b} to ${sideB.name} · ${stack.led.a} to ${sideA.name}`}{" "}
              · {stack.led.square} square
            </div>
          </div>

          <ul className="mt-1.5 space-y-0.5">
            {stack.bets.map((bet, index) => (
              <li
                key={`${bet.startHole}-${index}`}
                className="flex items-baseline justify-between gap-3 rounded px-2 py-1 text-sm odd:bg-neutral-50"
              >
                <span className="min-w-0 truncate text-neutral-700">
                  <span className="font-semibold text-neutral-900">
                    {bet.openedBy === "start"
                      ? "Opening bet"
                      : `From hole ${bet.startHole}`}
                  </span>
                  {bet.openedBy === "start" && stack.teeFlip !== null ? (
                    <span className="ml-1.5 rounded bg-sky-100 px-1 text-[0.65rem] font-bold text-sky-900">
                      TEE FLIP
                    </span>
                  ) : null}
                  {bet.openedBy === "manual" ? (
                    <span className="ml-1.5 rounded bg-amber-100 px-1 text-[0.65rem] font-bold text-amber-900">
                      PRESS
                    </span>
                  ) : null}
                  <span className="ml-1.5 text-xs text-neutral-500">
                    {betStanding(bet, config.sides)}
                  </span>
                </span>
                <span
                  className={`tabular shrink-0 font-bold ${
                    bet.margin === 0
                      ? "text-neutral-400"
                      : bet.margin * sign > 0
                        ? "text-turf-700"
                        : "text-red-700"
                  }`}
                >
                  {bet.margin === 0 ? "—" : formatMoney(bet.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {outcome.overall ? (
        <div className="border-t border-neutral-100 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-neutral-900">
              Overall 18
              <span className="ml-1.5 text-xs font-normal text-neutral-500">
                {formatMoney(outcome.overall.amount)} · no presses
              </span>
            </span>
            <span className="tabular text-sm font-bold">
              {upLine(outcome.overallSideTotals[0])}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-neutral-600">
            {betStanding(outcome.overall, config.sides)}
          </div>
        </div>
      ) : null}

      {outcome.greenies.enabled ? (
        <div className="border-t border-neutral-100 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-neutral-900">
              Greenies
              <span className="ml-1.5 text-xs font-normal text-neutral-500">
                {formatMoney(config.amount)} each · par 3s · a sweep doubles
              </span>
            </span>
            <span className="tabular text-sm font-bold">
              {upLine(outcome.greenies.sideTotals[0])}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-neutral-600">
            {sign > 0
              ? `${outcome.greenies.counts[0]} to ${sideA.name} · ${outcome.greenies.counts[1]} to ${sideB.name}`
              : `${outcome.greenies.counts[1]} to ${sideB.name} · ${outcome.greenies.counts[0]} to ${sideA.name}`}
            {outcome.greenies.sweptBy !== null
              ? ` · swept by ${config.sides[outcome.greenies.sweptBy].name}, doubled`
              : outcome.greenies.unanswered.length > 0
                ? ` · ${outcome.greenies.unanswered.length} par 3${
                    outcome.greenies.unanswered.length === 1 ? "" : "s"
                  } still to answer`
                : ""}
          </div>
          {outcome.greenies.holes.length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {outcome.greenies.holes.map((greenie) => (
                <li
                  key={greenie.hole}
                  className="rounded-md bg-neutral-50 px-2 py-1 text-neutral-700"
                >
                  <span className="font-semibold">{greenie.hole}</span>{" "}
                  {greenie.winnerId === undefined
                    ? "—"
                    : greenie.winnerId === null
                      ? "nobody"
                      : nameOf(greenie.winnerId).split(" ")[0]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-neutral-500">No par 3s on this card.</p>
          )}
        </div>
      ) : null}

      <div className="flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-sm font-semibold text-neutral-900">
          Everything together
        </span>
        <span
          className={`tabular text-xl font-bold ${
            totalA === 0
              ? "text-neutral-400"
              : totalA * sign > 0
                ? "text-turf-700"
                : "text-red-700"
          }`}
        >
          {totalA === 0
            ? "all square"
            : (() => {
                const leader = totalA > 0 ? sideA : sideB;
                const up = sideUp(Math.abs(totalA), leader, config.stakeMode);
                return `${leader.name} +${formatMoney(up.cents)}${up.each ? " each" : ""}`;
              })()}
        </span>
      </div>
    </div>
  );
}

function BankerBody({
  result,
  nameOf,
}: {
  result: Extract<BetResult, { kind: "banker" }>;
  nameOf: (playerId: string) => string;
}) {
  const { outcome } = result;
  const played = outcome.holes.filter((hole) => hole.settled);

  return (
    <div>
      {outcome.nextBankerId ? (
        <div className="rounded-xl bg-turf-50 px-3 py-2 ring-1 ring-inset ring-turf-200">
          <span className="text-sm text-turf-900">
            <strong className="font-bold">{nameOf(outcome.nextBankerId)}</strong> has
            the deal
          </span>
        </div>
      ) : null}

      {played.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          {result.config.source === "manual"
            ? "No hole has money on it yet. Enter it on the Hole tab and the deal follows it."
            : "No hole has every score in yet. A banker hole settles once everyone has posted."}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {played.map((hole) => (
            <li
              key={hole.hole}
              className="flex items-baseline justify-between gap-3 rounded px-2 py-1 text-sm odd:bg-neutral-50"
            >
              <span className="min-w-0 truncate text-neutral-700">
                <span className="font-semibold text-neutral-900">{hole.hole}</span>{" "}
                {nameOf(hole.bankerId ?? "")} banked
                {hole.bets.some((bet) => bet.multiplier > 1) ? (
                  <span className="ml-1.5 rounded bg-amber-100 px-1 text-[0.65rem] font-bold text-amber-900">
                    {Math.max(...hole.bets.map((bet) => bet.multiplier))}X
                  </span>
                ) : null}
              </span>
              <span
                className={`tabular shrink-0 font-bold ${
                  (hole.amounts[hole.bankerId ?? ""] ?? 0) > 0
                    ? "text-turf-700"
                    : (hole.amounts[hole.bankerId ?? ""] ?? 0) < 0
                      ? "text-red-700"
                      : "text-neutral-400"
                }`}
              >
                {formatSigned(hole.amounts[hole.bankerId ?? ""] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-neutral-500">
        Holes banked:{" "}
        {Object.entries(outcome.bankedCount)
          .filter(([, count]) => count > 0)
          .map(([playerId, count]) => `${nameOf(playerId)} ${count}`)
          .join(" · ") || "none yet"}
      </p>
    </div>
  );
}

function SkinsList({
  result,
  nameOf,
}: {
  result: Extract<BetResult, { kind: "skins" }>;
  nameOf: (playerId: string) => string;
}) {
  const decided = result.outcome.holes.filter((hole) => hole.settled);

  return (
    <div>
      {decided.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No hole has every score in yet. A skin settles once everyone in the game
          has posted.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {decided.map((hole) => (
            <li
              key={hole.hole}
              className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                hole.winnerId
                  ? "bg-turf-100 text-turf-900"
                  : "bg-neutral-100 text-neutral-600"
              }`}
              title={
                hole.winnerId
                  ? `${nameOf(hole.winnerId)} won ${formatMoney(hole.valuePerLoser)} from each player`
                  : hole.tied
                    ? "Tied"
                    : "No birdie"
              }
            >
              {hole.hole}:{" "}
              {hole.winnerId
                ? nameOf(hole.winnerId).split(" ")[0]
                : hole.notValidated
                  ? "no birdie"
                  : "tied"}
              {hole.winnerId && hole.holesAtStake > 1 ? ` ×${hole.holesAtStake}` : ""}
            </li>
          ))}
        </ul>
      )}
      {result.outcome.carryingHoles > 1 ? (
        <p className="mt-2 text-xs text-amber-700">
          {result.outcome.carryingHoles} skins riding on the next hole.
        </p>
      ) : null}
    </div>
  );
}
