"use client";

import { useState } from "react";
import type { BetResult, RoundComputation } from "@/lib/bets";
import { matchStanding } from "@/lib/bets/nassau";
import { betStanding } from "@/lib/bets/onedown";
import { sideUp } from "@/lib/bets/nassau";
import { formatMoney, formatSigned } from "@/lib/money";
import type { Round } from "@/lib/types";
import { BetEditor, BetSummaryLine } from "./BetEditor";
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
        />
      ))}

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
                — <BetSummaryLine bet={bet} />
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
}: {
  result: BetResult;
  nameOf: (playerId: string) => string;
  comp: RoundComputation;
}) {
  const totals = result.outcome.totals;

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
        <OneDownBody result={result} />
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
                      : "text-turf-700"
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

/** For the summary line under a game's name. */
function stakeWord(mode: "per-side" | "per-player"): string {
  return mode === "per-player" ? "per player" : "per side";
}

function OneDownBody({
  result,
}: {
  result: Extract<BetResult, { kind: "onedown" }>;
}) {
  const { outcome, config } = result;
  const [sideA, sideB] = config.sides;
  const [totalA] = outcome.sideTotals;

  const upLine = (cents: number) => {
    if (cents === 0) return <span className="text-neutral-400">all square</span>;
    const leader = cents > 0 ? sideA : sideB;
    const up = sideUp(Math.abs(cents), leader, config.stakeMode);
    return (
      <span className={cents > 0 ? "text-turf-700" : "text-red-700"}>
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
            <div className="tabular break-all font-mono text-lg font-bold text-white">
              {stack.standing || "—"}
            </div>
            <div className="mt-0.5 text-xs text-neutral-400">
              {stack.bets.length} bet{stack.bets.length === 1 ? "" : "s"} ·{" "}
              {stack.led.a} to {sideA.name} · {stack.led.b} to {sideB.name} ·{" "}
              {stack.led.square} square
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
                    {bet.startHole === stack.startHole
                      ? "Opening bet"
                      : `From hole ${bet.startHole}`}
                  </span>
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
                      : bet.margin > 0
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

      <div className="flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-sm font-semibold text-neutral-900">
          Everything together
        </span>
        <span
          className={`tabular text-xl font-bold ${
            totalA === 0
              ? "text-neutral-400"
              : totalA > 0
                ? "text-turf-700"
                : "text-red-700"
          }`}
        >
          {totalA === 0
            ? "all square"
            : `${totalA > 0 ? sideA.name : sideB.name} +${formatMoney(
                Math.abs(totalA),
              )}`}
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
