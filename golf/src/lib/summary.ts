import type { BetResult, RoundComputation } from "./bets";
import { perspectiveSign, sideUp } from "./bets/nassau";
import {
  betStanding,
  pressesBefore,
  standingEntries,
  teeFlipWinner,
  teeName,
  type StandingEntry,
} from "./bets/onedown";
import { formatMoney, formatSigned } from "./money";
import type { PlayerId, Round } from "./types";

/**
 * The round as a text: the whole rundown of every game — tee flips, each
 * nine's standing and money, the standing after every hole, presses, the
 * overall, greenies — then scores, money and who pays whom. Plain text with
 * no markup, since it is going into a group text.
 */
export function buildRoundSummary(round: Round, comp: RoundComputation): string {
  const nameOf = (playerId: PlayerId) =>
    round.players.find((player) => player.id === playerId)?.name ?? "—";
  const lines: string[] = [];
  lines.push(`${round.courseName || "Round"} — ${round.date} · ${round.holeCount} holes`);

  for (const result of comp.betResults) {
    lines.push("");
    if (result.kind === "onedown") lines.push(...oneDownLines(result, round, nameOf));
    else lines.push(...betTotalLines(result, round));
  }

  const scored = round.players.filter(
    (player) => (comp.totalsByPlayer[player.id]?.holesPosted ?? 0) > 0,
  );
  if (scored.length > 0) {
    lines.push("");
    lines.push("Scores");
    for (const player of scored) {
      const totals = comp.totalsByPlayer[player.id];
      const nines =
        totals.grossOut > 0 && totals.grossIn > 0
          ? ` (${totals.grossOut} out, ${totals.grossIn} in)`
          : "";
      const partial =
        totals.holesPosted < round.holeCount ? ` thru ${totals.holesPosted}` : "";
      lines.push(`${player.name}: ${totals.gross}${nines}${partial}`);
    }
  }

  const ranked = [...round.players].sort(
    (a, b) => (comp.grandTotals[b.id] ?? 0) - (comp.grandTotals[a.id] ?? 0),
  );
  lines.push("");
  lines.push("Money");
  for (const player of ranked) {
    const manual = comp.manualTotals[player.id] ?? 0;
    const bets = comp.betTotals[player.id] ?? 0;
    const split =
      manual !== 0 ? ` (holes ${formatSigned(manual)}, bets ${formatSigned(bets)})` : "";
    lines.push(`${player.name}: ${formatSigned(comp.grandTotals[player.id] ?? 0)}${split}`);
  }

  lines.push("");
  lines.push("Settle up");
  if (comp.transfers.length === 0) {
    lines.push("Nobody owes anybody.");
  }
  for (const transfer of comp.transfers) {
    lines.push(
      `${nameOf(transfer.fromId)} pays ${nameOf(transfer.toId)} ${formatMoney(transfer.amount)}`,
    );
  }

  if (comp.unbalancedHoles.length > 0) {
    lines.push("");
    lines.push(`Not counted (does not net to zero): hole ${comp.unbalancedHoles.join(", ")}`);
  }

  return lines.join("\n");
}

/** The standing as text; a press called by hand gets a star, since a text has no bold. */
function standingText(entries: StandingEntry[]): string {
  if (entries.length === 0) return "—";
  return entries
    .map((entry) => `${entry.margin > 0 ? "+" : ""}${entry.margin}${entry.pressed ? "*" : ""}`)
    .join("/");
}

function oneDownLines(
  result: Extract<BetResult, { kind: "onedown" }>,
  round: Round,
  nameOf: (playerId: PlayerId) => string,
): string[] {
  const { config, outcome } = result;
  const [sideA, sideB] = config.sides;
  // Read from the scorer's side, as the app shows it.
  const sign = perspectiveSign(config.sides, round.perspectiveId);
  const us = sign > 0 ? sideA : sideB;
  const signed = (entries: StandingEntry[]) =>
    entries.map((entry) => ({
      ...entry,
      margin: entry.margin === 0 ? 0 : entry.margin * sign,
    }));
  const up = (cents: number) => {
    if (cents === 0) return "all square";
    const leader = cents > 0 ? sideA : sideB;
    const each = sideUp(Math.abs(cents), leader, config.stakeMode);
    return `${leader.name} up ${formatMoney(each.cents)}${each.each ? " each" : ""}`;
  };

  const lines: string[] = [];
  lines.push(
    `${config.label} — ${formatMoney(config.amount)} a bet ${
      config.stakeMode === "per-player" ? "per player" : "per side"
    }, ${config.basis}${
      config.alternateAggregate === false
        ? ""
        : ", aggregate on 1, 3, 5, 7, 9 and 10, 12, 14, 16, 18"
    }`,
  );
  lines.push(
    `${sideA.name} vs ${sideB.name}. Standing from ${us.name}'s side: + is ${us.name} up. * is a press called by hand.`,
  );

  for (const stack of outcome.stacks) {
    if (outcome.teeFlips.holes.includes(stack.startHole)) {
      const answer = teeFlipWinner(config, stack.startHole);
      const flip =
        stack.teeFlip !== null
          ? `${config.sides[stack.teeFlip].name} won it`
          : answer === null
            ? "no flip"
            : "not entered";
      lines.push(`Tee flip on ${teeName(stack.startHole)}: ${flip}.`);
    }
    lines.push(
      `${stack.label}: ${standingText(standingEntries(stack, sign))} — ${up(stack.sideTotals[0])}`,
    );
    const byHole: string[] = [];
    const presses: string[] = [];
    for (let hole = stack.startHole; hole <= stack.endHole; hole += 1) {
      const entries = result.byHole[hole];
      if (entries) byHole.push(`${hole} ${standingText(signed(entries))}`);
      const count = pressesBefore(config, hole);
      if (count > 0) presses.push(`${count > 1 ? `${count} ` : ""}before ${hole}`);
    }
    if (byHole.length > 0) lines.push(`  After each hole: ${byHole.join(" · ")}`);
    if (presses.length > 0) lines.push(`  Extra presses: ${presses.join(", ")}`);
  }

  if (outcome.overall) {
    lines.push(
      `Overall 18 (${formatMoney(outcome.overall.amount)}): ${betStanding(
        outcome.overall,
        config.sides,
      )} — ${up(outcome.overallSideTotals[0])}`,
    );
  }

  if (outcome.greenies.enabled) {
    const greenies = outcome.greenies;
    let line = `Greenies: ${greenies.counts[0]} to ${sideA.name}, ${greenies.counts[1]} to ${sideB.name}`;
    if (greenies.sweptBy !== null) {
      line += ` — swept by ${config.sides[greenies.sweptBy].name}, doubled`;
    }
    line += ` — ${up(greenies.sideTotals[0])}`;
    if (greenies.unanswered.length > 0) {
      line += ` (${greenies.unanswered.length} par 3${
        greenies.unanswered.length === 1 ? "" : "s"
      } not entered)`;
    }
    lines.push(line);
    if (greenies.holes.length > 0) {
      lines.push(
        `  ${greenies.holes
          .map(
            (greenie) =>
              `${greenie.hole} ${
                greenie.winnerId === undefined
                  ? "not entered"
                  : greenie.winnerId === null
                    ? "nobody"
                    : nameOf(greenie.winnerId)
              }`,
          )
          .join(" · ")}`,
      );
    }
  }

  lines.push(`${config.label} total: ${up(outcome.sideTotals[0])}`);
  return lines;
}

/** Any other game: its money per player. */
function betTotalLines(result: BetResult, round: Round): string[] {
  const totals = result.outcome.totals;
  return [
    `${result.config.label}: ${round.players
      .map((player) => `${player.name} ${formatSigned(totals[player.id] ?? 0)}`)
      .join(" · ")}`,
  ];
}
