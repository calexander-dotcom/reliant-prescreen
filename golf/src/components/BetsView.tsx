"use client";

import { useState } from "react";
import type { BetResult, RoundComputation } from "@/lib/bets";
import { matchStanding } from "@/lib/bets/nassau";
import { formatMoney, formatSigned } from "@/lib/money";
import type { Round } from "@/lib/types";
import { BetEditor, BetSummaryLine } from "./BetEditor";
import { Banner, Button, Card, SectionTitle } from "./ui";

/** Live status of every automatic bet, and the editor to change the terms. */
export function BetsView({
  round,
  comp,
  update,
}: {
  round: Round;
  comp: RoundComputation;
  update: (next: Round) => void;
}) {
  const [editing, setEditing] = useState(round.bets.length === 0);

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
          <Button variant="secondary" onClick={() => setEditing((value) => !value)}>
            {editing ? "Done" : "Edit"}
          </Button>
        </div>
        {editing ? (
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
            ? `${formatMoney(result.config.amount)} per segment · ${
                result.config.basis
              } · ${
                result.config.autoPressAt > 0
                  ? `press at ${result.config.autoPressAt} down`
                  : "no presses"
              }`
            : `${formatMoney(result.config.amount)} per player per skin · ${
                result.config.basis
              }`
        }
      >
        {result.config.label}
      </SectionTitle>

      {result.kind === "nassau" ? (
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
