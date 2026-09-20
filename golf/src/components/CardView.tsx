"use client";

import type { BetResult, RoundComputation } from "@/lib/bets";
import { ledgerStatus } from "@/lib/bets/ledger";
import { perspectiveSign } from "@/lib/bets/nassau";
import { formatStanding } from "@/lib/bets/onedown";
import { formatCompact } from "@/lib/money";
import type { Round } from "@/lib/types";
import { moneyTone } from "./MoneyByNine";
import { Banner, Card, SectionTitle } from "./ui";

/**
 * The whole card at a glance: gross score with that hole's money underneath.
 * Holes still out of balance are flagged in the row so they get fixed before
 * anyone settles up.
 */
export function CardView({
  round,
  comp,
  onPickHole,
  readOnly = false,
}: {
  round: Round;
  comp: RoundComputation;
  onPickHole: (hole: number) => void;
  /** Followers get the same card without the invitation to tap it. */
  readOnly?: boolean;
}) {
  const ids = round.players.map((player) => player.id);
  const status = ledgerStatus(round.manual, ids, round.holeCount);
  const unbalanced = new Set(comp.unbalancedHoles);

  const front = comp.holes.filter((hole) => hole.number <= 9);
  const back = comp.holes.filter((hole) => hole.number > 9);

  // One downs on the card: the standing beside each finished hole, read from
  // the scorer's side, so the 9th carries the front nine's last word.
  const oneDown = comp.betResults.find(
    (result): result is Extract<BetResult, { kind: "onedown" }> => result.kind === "onedown",
  );
  const oneDownSign = oneDown ? perspectiveSign(oneDown.config.sides, round.perspectiveId) : 1;
  const standingAt = (hole: number): string | null => {
    const margins = oneDown?.byHole[hole];
    return margins ? formatStanding(margins.map((margin) => margin * oneDownSign)) : null;
  };
  // What each side counted on the hole — best ball, or both partners added on
  // an aggregate hole — the scorer's side first, so the standing can be
  // checked hole by hole.
  const sidesAt = (hole: number): SideScoresView | null => {
    const scores = oneDown?.sideScores[hole];
    if (!scores) return null;
    const us = oneDownSign > 0 ? scores.a : scores.b;
    const them = oneDownSign > 0 ? scores.b : scores.a;
    if (us === null && them === null) return null;
    return { us, them, aggregate: scores.aggregate };
  };
  const [usSide, themSide] = oneDown
    ? oneDownSign > 0
      ? oneDown.config.sides
      : [oneDown.config.sides[1], oneDown.config.sides[0]]
    : [null, null];

  return (
    <div className="space-y-4">
      {comp.unbalancedHoles.length > 0 ? (
        <Banner tone="warn">
          {comp.unbalancedHoles.length === 1
            ? `Hole ${comp.unbalancedHoles[0]} does not net to zero`
            : `Holes ${comp.unbalancedHoles.join(", ")} do not net to zero`}{" "}
          — those holes are left out of the totals until they balance.
        </Banner>
      ) : null}

      <Card className="overflow-x-auto">
        <SectionTitle
          hint={`Score on top, that hole's money underneath.${
            readOnly ? "" : " Tap a hole to edit it."
          }`}
        >
          Scorecard
        </SectionTitle>
        <table className="tabular w-full min-w-[20rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="sticky left-0 bg-white py-2 pr-2 text-left">Hole</th>
              <th className="px-1 py-2 text-center font-semibold">Par</th>
              {round.players.map((player) => (
                <th key={player.id} className="px-1 py-2 text-center font-semibold">
                  <span className="block max-w-[4.5rem] truncate">
                    {player.name.split(" ")[0]}
                  </span>
                </th>
              ))}
              {oneDown ? (
                <>
                  <th className="px-1 py-2 text-center font-semibold">Sides</th>
                  <th className="px-1 py-2 text-left font-semibold">1 down</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {[front, back].map((group, groupIndex) =>
              group.length === 0 ? null : (
                <HoleGroup
                  key={groupIndex}
                  label={groupIndex === 0 ? "Out" : "In"}
                  nineMoney={groupIndex === 0 ? comp.nineTotals.front : comp.nineTotals.back}
                  holes={group}
                  round={round}
                  comp={comp}
                  status={status}
                  unbalanced={unbalanced}
                  onPickHole={onPickHole}
                  readOnly={readOnly}
                  standingAt={oneDown ? standingAt : null}
                  sidesAt={oneDown ? sidesAt : null}
                />
              ),
            )}
            <tr className="border-t-2 border-neutral-300 font-bold">
              <td className="sticky left-0 bg-white py-2 pr-2 text-left">Total</td>
              <td className="px-1 py-2 text-center text-neutral-500">
                {comp.holes.reduce((sum, hole) => sum + hole.par, 0)}
              </td>
              {round.players.map((player) => (
                <td key={player.id} className="px-1 py-2 text-center">
                  {comp.totalsByPlayer[player.id]?.gross || "–"}
                </td>
              ))}
              {oneDown ? (
                <>
                  <td />
                  <td />
                </>
              ) : null}
            </tr>
            <tr className="text-neutral-600">
              <td className="sticky left-0 bg-white py-1.5 pr-2 text-left text-xs uppercase">
                Net
              </td>
              <td />
              {round.players.map((player) => (
                <td key={player.id} className="px-1 py-1.5 text-center">
                  {comp.totalsByPlayer[player.id]?.holesPosted
                    ? comp.totalsByPlayer[player.id].net
                    : "–"}
                </td>
              ))}
              {oneDown ? (
                <>
                  <td />
                  <td />
                </>
              ) : null}
            </tr>
            {comp.nineTotals.hasOverall ? (
              <tr className="border-t border-neutral-200">
                <td className="sticky left-0 bg-white py-1.5 pr-2 text-left text-xs uppercase text-neutral-500">
                  Overall
                </td>
                <td />
                {round.players.map((player) => {
                  const cents = comp.nineTotals.overall[player.id] ?? 0;
                  return (
                    <td
                      key={player.id}
                      className={`px-1 py-1.5 text-center font-semibold ${moneyTone(cents)}`}
                    >
                      {formatCompact(cents)}
                    </td>
                  );
                })}
                {oneDown ? (
                <>
                  <td />
                  <td />
                </>
              ) : null}
              </tr>
            ) : null}
            <tr className="border-t border-neutral-200">
              <td className="sticky left-0 bg-white py-2 pr-2 text-left text-xs uppercase text-neutral-500">
                Money
              </td>
              <td />
              {round.players.map((player) => {
                const total = comp.grandTotals[player.id] ?? 0;
                return (
                  <td
                    key={player.id}
                    className={`px-1 py-2 text-center font-bold ${
                      total > 0
                        ? "text-turf-700"
                        : total < 0
                          ? "text-red-700"
                          : "text-neutral-400"
                    }`}
                  >
                    {formatCompact(total)}
                  </td>
                );
              })}
              {oneDown ? (
                <>
                  <td />
                  <td />
                </>
              ) : null}
            </tr>
          </tbody>
        </table>
      </Card>

      <Card>
        <SectionTitle hint="Course handicap, then strokes actually played after the round's handicap rule.">
          Handicaps
        </SectionTitle>
        <ul className="divide-y divide-neutral-100">
          {round.players.map((player) => {
            const strokes = comp.strokes[player.id];
            return (
              <li key={player.id} className="flex items-center justify-between py-2">
                <span className="truncate pr-2 font-semibold text-neutral-900">
                  {player.name}
                </span>
                <span className="tabular text-sm text-neutral-600">
                  {player.handicapIndex === null
                    ? "no index"
                    : `index ${player.handicapIndex.toFixed(1)}`}
                  {" · "}
                  {strokes?.courseHandicap === null || strokes === undefined
                    ? "CH –"
                    : `CH ${strokes.courseHandicap}`}
                  {" · "}
                  <strong className="text-neutral-900">
                    {strokes?.playingHandicap === null || strokes === undefined
                      ? "plays –"
                      : `plays ${strokes.playingHandicap}`}
                  </strong>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          The money row adds up the hand-entered holes plus every nassau, press
          and skin that has settled. The Out and In rows carry each nine&apos;s
          share under the score; Overall is the whole-round bet. A hole that does not
          net to zero is left out until it does.
          {oneDown && usSide && themSide
            ? ` Sides is what decided each hole — ${usSide.name} then ${themSide.name}: the best ball, or on an aggregate hole (marked agg) both partners added together${
                oneDown.config.basis === "net" ? ", net" : ""
              }.`
            : ""}
        </p>
      </Card>
    </div>
  );
}

function HoleGroup({
  label,
  nineMoney,
  holes,
  round,
  comp,
  status,
  unbalanced,
  onPickHole,
  readOnly,
  standingAt,
  sidesAt,
}: {
  label: string;
  /** This nine's money per player, shown under the score subtotal. */
  nineMoney: Record<string, number>;
  /** The one-down standing after a hole, when that is the game. */
  standingAt: ((hole: number) => string | null) | null;
  /** What each side counted on the hole, scorer's side first. */
  sidesAt: ((hole: number) => SideScoresView | null) | null;
  holes: RoundComputation["holes"];
  round: Round;
  comp: RoundComputation;
  status: ReturnType<typeof ledgerStatus>;
  unbalanced: Set<number>;
  onPickHole: (hole: number) => void;
  readOnly?: boolean;
}) {
  const subtotal = (playerId: string) =>
    holes.reduce((sum, hole) => sum + (comp.cells[playerId]?.[hole.number]?.gross ?? 0), 0);

  return (
    <>
      {holes.map((hole) => {
        const holeStatus = status[hole.number - 1];
        return (
          <tr
            key={hole.number}
            onClick={readOnly ? undefined : () => onPickHole(hole.number)}
            className={`border-b border-neutral-100 ${
              readOnly ? "" : "cursor-pointer"
            } ${unbalanced.has(hole.number) ? "bg-amber-50" : ""}`}
          >
            <th className="sticky left-0 bg-inherit py-1.5 pr-2 text-left font-semibold text-neutral-700">
              {hole.number}
              {unbalanced.has(hole.number) ? (
                <span className="ml-1 text-amber-700" title="Does not net to zero">
                  !
                </span>
              ) : null}
            </th>
            <td className="px-1 py-1.5 text-center text-neutral-500">{hole.par}</td>
            {round.players.map((player) => {
              const cell = comp.cells[player.id]?.[hole.number];
              const money = holeStatus?.amounts[player.id] ?? 0;
              return (
                <td key={player.id} className="px-1 py-1.5 text-center">
                  <div className="font-semibold text-neutral-900">
                    {cell?.gross ?? "–"}
                    {cell && cell.gross !== null && cell.strokes > 0 ? (
                      <span className="align-super text-[0.6rem] text-turf-600">
                        {"•".repeat(Math.min(cell.strokes, 3))}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={`text-[0.65rem] leading-none ${
                      money > 0 ? "text-turf-600" : "text-red-600"
                    }`}
                  >
                    {money === 0 ? "\u00a0" : formatCompact(money)}
                  </div>
                </td>
              );
            })}
            {sidesAt ? <SidesCell scores={sidesAt(hole.number)} /> : null}
            {standingAt ? (
              <td className="whitespace-nowrap px-1 py-1.5 text-left font-mono text-[0.65rem] text-neutral-700">
                {standingAt(hole.number) ?? ""}
              </td>
            ) : null}
          </tr>
        );
      })}
      <tr className="border-b border-neutral-200 bg-neutral-50 font-semibold">
        <td className="sticky left-0 bg-neutral-50 py-1.5 pr-2 text-left text-xs uppercase text-neutral-500">
          {label}
        </td>
        <td className="px-1 py-1.5 text-center text-neutral-500">
          {holes.reduce((sum, hole) => sum + hole.par, 0)}
        </td>
        {round.players.map((player) => {
          const money = nineMoney[player.id] ?? 0;
          return (
            <td key={player.id} className="px-1 py-1.5 text-center">
              <div>{subtotal(player.id) || "–"}</div>
              <div
                className={`text-[0.65rem] leading-none ${
                  money > 0 ? "text-turf-600" : "text-red-600"
                }`}
              >
                {money === 0 ? "\u00a0" : formatCompact(money)}
              </div>
            </td>
          );
        })}
        {sidesAt ? <td /> : null}
        {standingAt ? <td /> : null}
      </tr>
    </>
  );
}

interface SideScoresView {
  us: number | null;
  them: number | null;
  aggregate: boolean;
}

/** "3–4" with the winning side in colour, and "agg" under an aggregate hole. */
function SidesCell({ scores }: { scores: SideScoresView | null }) {
  if (!scores) return <td className="px-1 py-1.5 text-center text-neutral-300">–</td>;
  const { us, them, aggregate } = scores;
  const tone =
    us === null || them === null
      ? "text-neutral-400"
      : us < them
        ? "font-semibold text-turf-700"
        : us > them
          ? "font-semibold text-red-700"
          : "text-neutral-600";
  return (
    <td className="tabular whitespace-nowrap px-1 py-1.5 text-center text-xs">
      <span className={tone}>
        {us ?? "–"}–{them ?? "–"}
      </span>
      {aggregate ? (
        <span className="block text-[0.55rem] uppercase leading-none text-amber-700">agg</span>
      ) : null}
    </td>
  );
}
