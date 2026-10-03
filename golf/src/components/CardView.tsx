"use client";

import type { BetResult, RoundComputation } from "@/lib/bets";
import { teamNetForHole } from "@/lib/bets";
import { ledgerStatus } from "@/lib/bets/ledger";
import { perspectiveSign } from "@/lib/bets/nassau";
import {
  evaluateOneDown,
  formatStanding,
  pressesBefore,
  standingEntries,
  type StandingEntry,
} from "@/lib/bets/onedown";
import { setTeamNet } from "@/lib/mutations";
import { Standing } from "./Standing";
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
  update,
  readOnly = false,
}: {
  round: Round;
  comp: RoundComputation;
  onPickHole: (hole: number) => void;
  /** Lets the scorer toggle the team-net column; absent on a follower's card. */
  update?: (next: Round) => void;
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
  // Where each nine's match began: the tee flip and the opening standing, read
  // from the scorer's side so it lines up with the standing column below. Run
  // the game with no holes played to get just the flip and any opening press.
  const flipUnanswered = new Set(oneDown?.outcome.teeFlips.unanswered ?? []);
  const openingStacks = oneDown
    ? evaluateOneDown(oneDown.config, round.holeCount, {}, ids).stacks
    : [];
  // The flip line for a nine's first row: who won it and the standing it began
  // at. Front then back; on a shotgun start the front's first row is the hole
  // the group teed off on, so it lands right before that hole either way.
  const flipNoteFor = (groupIndex: number): string | null => {
    if (!oneDown) return null;
    const stack = openingStacks[groupIndex];
    if (!stack) return null;
    const answered = !flipUnanswered.has(stack.startHole);
    const flip =
      stack.teeFlip !== null
        ? `${oneDown.config.sides[stack.teeFlip].name} won the flip`
        : answered
          ? "No tee flip"
          : "Tee flip not set";
    const raw = formatStanding(standingEntries(stack, oneDownSign).map((entry) => entry.margin));
    return `${flip} · started ${raw === "0" ? "even" : raw}`;
  };
  const flipColSpan = 1 + round.players.length + (oneDown ? 3 : 0);
  const standingAt = (hole: number): StandingEntry[] | null => {
    const entries = oneDown?.byHole[hole];
    return entries
      ? entries.map((entry) => ({
          ...entry,
          margin: entry.margin === 0 ? 0 : entry.margin * oneDownSign,
        }))
      : null;
  };
  // Extra presses called before a hole, marked on that hole's row: the hole
  // the pressed bet starts on.
  const pressesAt = (hole: number): number => (oneDown ? pressesBefore(oneDown.config, hole) : 0);
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

  // Greenies on the par 3s: who took each, in a column of its own. Only shown
  // when the game plays them and the course has par 3s.
  const greenieList = oneDown?.outcome.greenies.enabled ? oneDown.outcome.greenies.holes : [];
  const showGreenies = greenieList.length > 0;
  const usSideIndex = oneDownSign > 0 ? 0 : 1;
  const greenieByHole = new Map(greenieList.map((green) => [green.hole, green]));
  const greenieAt = (hole: number): GreenieView | null => {
    const green = greenieByHole.get(hole);
    if (!green) return null;
    if (green.winnerId === undefined) return { name: "—", tone: "muted" };
    // Nobody won it, carried to the next par 3.
    if (green.carry) return { name: "carry", tone: "carry" };
    if (!green.winnerId || green.side === null) return { name: "none", tone: "muted" };
    const first =
      round.players.find((player) => player.id === green.winnerId)?.name.split(" ")[0] ?? "?";
    // A carry-over win took more than one greenie — mark how many.
    const name = green.greeniesWon > 1 ? `${first} ×${green.greeniesWon}` : first;
    return { name, tone: green.side === usSideIndex ? "us" : "them" };
  };

  // Team net (display only): on the odd on-course holes every player's net
  // added together, on the even holes the single best. One number per hole for
  // a side playing a combined round; off unless this round turned it on.
  const showTeamNet = round.teamNet === true;
  const onCourseOf = new Map(comp.holes.map((hole) => [hole.number, hole.onCourse]));
  const teamNetAt = (hole: number): number | null =>
    teamNetForHole(
      round.players.map((player) => comp.cells[player.id]?.[hole]?.net ?? null),
      onCourseOf.get(hole) ?? hole,
    );
  const teamNetTotal = (holeList: RoundComputation["holes"]): number | null => {
    const values = holeList
      .map((hole) => teamNetAt(hole.number))
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  };

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

      {comp.mismatches.length > 0 ? (
        <Banner tone="warn">
          <span className="gg-pulse mr-1 inline-block font-black text-red-600">●</span>
          {comp.mismatches.length === 1
            ? "One score disagrees with Golf Genius"
            : `${comp.mismatches.length} scores disagree with Golf Genius`}{" "}
          — shown in red below. Your entry stands until you change it.
        </Banner>
      ) : null}

      <Card className="overflow-x-auto">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle
            hint={`Score on top, that hole's money underneath.${
              readOnly ? "" : " Tap a hole to edit it."
            }`}
          >
            Scorecard
          </SectionTitle>
          {update && !readOnly ? (
            <button
              type="button"
              onClick={() => update(setTeamNet(round, !showTeamNet))}
              aria-pressed={showTeamNet}
              title="Odd holes add all players' net together; even holes count the best net ball."
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${
                showTeamNet
                  ? "bg-turf-700 text-white ring-turf-700"
                  : "bg-white text-turf-700 ring-turf-300"
              }`}
            >
              Team net {showTeamNet ? "on" : "off"}
            </button>
          ) : null}
        </div>
        <table className="tabular w-full min-w-[20rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="sticky left-0 bg-white py-2 pr-2 text-left">
                Hole
                <span className="block text-[0.6rem] font-normal leading-none text-neutral-400">
                  par
                </span>
              </th>
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
                  <th className="px-1 py-2 text-center font-semibold">Press</th>
                  {showGreenies ? (
                    <th className="px-1 py-2 text-center font-semibold">Greenie</th>
                  ) : null}
                </>
              ) : null}
              {showTeamNet ? (
                <th className="px-1 py-2 text-center font-semibold">
                  Team
                  <span className="block text-[0.6rem] font-normal leading-none text-neutral-400">
                    net
                  </span>
                </th>
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
                  pressesAt={oneDown ? pressesAt : null}
                  greenieAt={showGreenies ? greenieAt : null}
                  teamNetAt={showTeamNet ? teamNetAt : null}
                  flipNote={flipNoteFor(groupIndex)}
                  flipColSpan={flipColSpan}
                />
              ),
            )}
            <tr className="border-t-2 border-neutral-300 font-bold">
              <td className="sticky left-0 bg-white py-2 pr-2 text-left">
                Total
                <span className="block text-[0.65rem] font-normal leading-none text-neutral-500">
                  par {comp.holes.reduce((sum, hole) => sum + hole.par, 0)}
                </span>
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
                  <td />
                </>
              ) : null}
              {showTeamNet ? (
                <>
                  {showGreenies ? <td /> : null}
                  <td className="px-1 py-2 text-center">{teamNetTotal(comp.holes) ?? "–"}</td>
                </>
              ) : null}
            </tr>
            <tr className="text-neutral-600">
              <td className="sticky left-0 bg-white py-1.5 pr-2 text-left text-xs uppercase">
                Net
              </td>
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
                  <td />
                </>
              ) : null}
            </tr>
            {comp.nineTotals.hasOverall ? (
              <tr className="border-t border-neutral-200">
                <td className="sticky left-0 bg-white py-1.5 pr-2 text-left text-xs uppercase text-neutral-500">
                  Overall
                </td>
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
                  <td />
                </>
              ) : null}
              </tr>
            ) : null}
            <tr className="border-t border-neutral-200">
              <td className="sticky left-0 bg-white py-2 pr-2 text-left text-xs uppercase text-neutral-500">
                Money
              </td>
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
              <li key={player.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-semibold text-neutral-900">
                  {player.name}
                </span>
                {/* Two lines, both flush right: the index and course handicap,
                    then what they actually play, so "plays" never wraps. */}
                <span className="tabular shrink-0 text-right text-sm text-neutral-600">
                  <span className="block whitespace-nowrap">
                    {player.handicapIndex === null
                      ? "no index"
                      : `index ${player.handicapIndex.toFixed(1)}`}
                    {" · "}
                    {strokes?.courseHandicap === null || strokes === undefined
                      ? "CH –"
                      : `CH ${strokes.courseHandicap}`}
                  </span>
                  <strong className="block whitespace-nowrap text-neutral-900">
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
          net to zero is left out until it does. A score shown as 5/4 is gross then
          net, where a handicap stroke falls.
          {showTeamNet
            ? " Team net is this side playing together: the odd holes add every ball, the even holes count the best one."
            : ""}
          {oneDown && usSide && themSide
            ? ` Sides is what decided each hole — ${usSide.name} then ${themSide.name}: the best ball, or on an aggregate hole (marked agg) both partners added together${
                oneDown.config.basis === "net" ? ", net" : ""
              }. In 1 down, a press called by hand is in bold; P marks the hole it was called before.`
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
  pressesAt,
  greenieAt,
  teamNetAt,
  flipNote,
  flipColSpan,
}: {
  label: string;
  /** This nine's money per player, shown under the score subtotal. */
  nineMoney: Record<string, number>;
  /** The one-down standing after a hole, when that is the game. */
  standingAt: ((hole: number) => StandingEntry[] | null) | null;
  /** What each side counted on the hole, scorer's side first. */
  sidesAt: ((hole: number) => SideScoresView | null) | null;
  /** Extra presses called before the hole. */
  pressesAt: ((hole: number) => number) | null;
  /** Who took the greenie on a par 3, when the game plays greenies. */
  greenieAt: ((hole: number) => GreenieView | null) | null;
  /** The team's net for the hole, when the team-net column is on. */
  teamNetAt: ((hole: number) => number | null) | null;
  /** The tee-flip line for this nine, shown on the row it teed off on. */
  flipNote: string | null;
  /** Columns the flip line spans. */
  flipColSpan: number;
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

  const teamSubtotal = (): number | null => {
    if (!teamNetAt) return null;
    const values = holes
      .map((hole) => teamNetAt(hole.number))
      .filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  };

  return (
    <>
      {flipNote ? (
        <tr className="bg-turf-50/60">
          <td
            colSpan={flipColSpan}
            className="py-1 pr-2 text-left text-[0.7rem] font-semibold text-turf-800"
          >
            {flipNote}
          </td>
        </tr>
      ) : null}
      {holes.map((hole) => {
        const holeStatus = status[hole.number - 1];
        const standing = standingAt ? standingAt(hole.number) : null;
        return (
          <tr
            key={hole.number}
            onClick={readOnly ? undefined : () => onPickHole(hole.number)}
            className={`border-b border-neutral-100 ${
              readOnly ? "" : "cursor-pointer"
            } ${unbalanced.has(hole.number) ? "bg-amber-50" : ""}`}
          >
            <th className="sticky left-0 bg-inherit py-1.5 pr-2 text-left font-semibold text-neutral-700">
              {hole.onCourse}
              {unbalanced.has(hole.number) ? (
                <span className="ml-1 text-amber-700" title="Does not net to zero">
                  !
                </span>
              ) : null}
              <span className="block text-[0.65rem] font-normal leading-none text-neutral-500">
                par {hole.par}
              </span>
            </th>
            {round.players.map((player) => {
              const cell = comp.cells[player.id]?.[hole.number];
              const money = holeStatus?.amounts[player.id] ?? 0;
              const rec = comp.reconcile[player.id]?.[hole.number];
              const mismatch = rec?.status === "mismatch";
              const fromGg = rec?.status === "from-gg";
              return (
                <td key={player.id} className="px-1 py-1.5 text-center">
                  <div className={`font-semibold ${mismatch ? "text-red-600" : "text-neutral-900"}`}>
                    {mismatch ? (
                      <span
                        className="gg-pulse font-bold text-red-600"
                        title={`You have ${rec?.manual}; Golf Genius has ${rec?.gg}`}
                      >
                        {cell?.gross ?? "–"}
                      </span>
                    ) : (
                      cell?.gross ?? "–"
                    )}
                    {cell && cell.gross !== null && cell.strokes > 0 && cell.net !== null ? (
                      <span
                        className="text-[0.8rem] font-normal text-turf-600"
                        title={`net ${cell.net} (${cell.strokes} stroke${
                          cell.strokes > 1 ? "s" : ""
                        })`}
                      >
                        /{cell.net}
                      </span>
                    ) : null}
                    {fromGg ? (
                      <span
                        className="align-super ml-0.5 text-[0.55rem] font-bold uppercase text-turf-500"
                        title="Filled from Golf Genius"
                      >
                        gg
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
                {standing ? <Standing entries={standing} empty="" /> : ""}
              </td>
            ) : null}
            {pressesAt ? <PressCell count={pressesAt(hole.number)} /> : null}
            {greenieAt ? <GreenieCell info={greenieAt(hole.number)} /> : null}
            {teamNetAt ? (
              <td className="tabular px-1 py-1.5 text-center text-xs font-semibold text-neutral-800">
                {teamNetAt(hole.number) ?? "–"}
              </td>
            ) : null}
          </tr>
        );
      })}
      <tr className="border-b border-neutral-200 bg-neutral-50 font-semibold">
        <td className="sticky left-0 bg-neutral-50 py-1.5 pr-2 text-left text-xs uppercase text-neutral-500">
          {label}
          <span className="block text-[0.65rem] font-normal normal-case leading-none text-neutral-500">
            par {holes.reduce((sum, hole) => sum + hole.par, 0)}
          </span>
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
        {pressesAt ? <td /> : null}
        {teamNetAt ? (
          <>
            {greenieAt ? <td /> : null}
            <td className="tabular px-1 py-1.5 text-center text-xs">{teamSubtotal() ?? "–"}</td>
          </>
        ) : null}
      </tr>
    </>
  );
}

/** A hole an extra press was called before: P, or P×2 and up. */
function PressCell({ count }: { count: number }) {
  return (
    <td className="px-1 py-1.5 text-center text-xs">
      {count > 0 ? (
        <span
          className="rounded bg-amber-100 px-1 font-bold text-amber-900"
          aria-label={`${count} extra press${count === 1 ? "" : "es"} before this hole`}
        >
          {count === 1 ? "P" : `P×${count}`}
        </span>
      ) : (
        ""
      )}
    </td>
  );
}

/** The greenie on a par 3: whose it is, coloured by whether it is our side. */
interface GreenieView {
  name: string;
  tone: "us" | "them" | "muted" | "carry";
}

/** The greenie winner on a par 3, in green when ours, red when theirs. */
function GreenieCell({ info }: { info: GreenieView | null }) {
  if (!info) return <td className="px-1 py-1.5" />;
  const cls =
    info.tone === "us"
      ? "text-turf-700"
      : info.tone === "them"
        ? "text-red-700"
        : info.tone === "carry"
          ? "text-amber-700"
          : "text-neutral-400";
  return (
    <td className={`whitespace-nowrap px-1 py-1.5 text-center text-xs font-semibold ${cls}`}>
      {info.name}
    </td>
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
