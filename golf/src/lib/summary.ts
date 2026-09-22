import type { BetResult, RoundComputation } from "./bets";
import { perspectiveSign, sideUp } from "./bets/nassau";
import { betStanding, pressesBefore, standingFor, type OneDownStack } from "./bets/onedown";
import { playOrder } from "./holes";
import { formatMoney, formatSigned } from "./money";
import type { PlayerId, Round, Side } from "./types";

/**
 * The round as a text for the group: each nine's final standing with who
 * pressed under it, the all-day bet, the greenies that were won, and where
 * everyone finished. Plain text with no markup, since it goes into a group
 * text. Who pays whom is left to the group.
 */
export function buildRoundSummary(round: Round, comp: RoundComputation): string {
  const nameOf = (playerId: PlayerId) =>
    round.players.find((player) => player.id === playerId)?.name ?? "—";
  const lines: string[] = [];
  lines.push(`${round.courseName || "Round"} — ${round.date}`);

  for (const result of comp.betResults) {
    lines.push("");
    if (result.kind === "onedown") lines.push(...oneDownLines(result, round, nameOf));
    else lines.push(...betTotalLines(result, round));
  }

  const ranked = [...round.players].sort(
    (a, b) => (comp.grandTotals[b.id] ?? 0) - (comp.grandTotals[a.id] ?? 0),
  );
  lines.push("");
  for (const player of ranked) {
    const totals = comp.totalsByPlayer[player.id];
    const score = totals?.holesPosted ? ` (${totals.gross} gross)` : "";
    lines.push(`${player.name}${score}: ${formatSigned(comp.grandTotals[player.id] ?? 0)}`);
  }

  if (comp.unbalancedHoles.length > 0) {
    lines.push("");
    lines.push(`Not counted (does not net to zero): hole ${comp.unbalancedHoles.join(", ")}`);
  }

  return lines.join("\n");
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
  const up = (cents: number) => {
    if (cents === 0) return "all square";
    const leader = cents > 0 ? sideA : sideB;
    const each = sideUp(Math.abs(cents), leader, config.stakeMode);
    return `${leader.name} up ${formatMoney(each.cents)}${each.each ? " each" : ""}`;
  };

  // Holes are positions in the play order; a text for the group has to name
  // the number on the tee marker instead.
  const markers = playOrder(round.startHole ?? 1, round.holeCount);
  const marker = (position: number) => markers[position - 1] ?? position;
  // Who won a hole, from what each side counted on it; null when halved or
  // not scored.
  const holeWinner = (hole: number): 0 | 1 | null => {
    const scores = result.sideScores[hole];
    if (!scores || scores.a === null || scores.b === null) return null;
    return scores.a < scores.b ? 0 : scores.b < scores.a ? 1 : null;
  };
  // Only a side that just lost can press, so the presser is whoever lost the
  // most recent decided hole before it — or the flip, for a press on the tee.
  const pressedBy = (stack: OneDownStack, hole: number): Side | null => {
    for (let h = hole - 1; h >= stack.startHole; h -= 1) {
      const winner = holeWinner(h);
      if (winner !== null) return config.sides[winner === 0 ? 1 : 0];
    }
    if (stack.teeFlip !== null) return config.sides[stack.teeFlip === 0 ? 1 : 0];
    return null;
  };
  const times = (count: number) =>
    count === 1 ? "" : count === 2 ? " twice" : count === 3 ? " three times" : ` ${count} times`;

  const lines: string[] = [];
  lines.push(`${config.label} — ${sideA.name} vs ${sideB.name}, from ${us.name}'s side`);

  for (const stack of outcome.stacks) {
    lines.push(`${stack.label}: ${standingFor(stack, sign) || "—"} — ${up(stack.sideTotals[0])}`);
    for (let hole = stack.startHole; hole <= stack.endHole; hole += 1) {
      const count = pressesBefore(config, hole);
      if (count === 0) continue;
      const side = pressedBy(stack, hole);
      lines.push(
        side
          ? `  ${side.name} pressed${times(count)} before ${marker(hole)}`
          : `  ${count === 1 ? "Press" : `${count} presses`} before ${marker(hole)}`,
      );
    }
  }

  if (outcome.overall) {
    lines.push(
      `All day (${formatMoney(outcome.overall.amount)}): ${betStanding(
        outcome.overall,
        config.sides,
      )} — ${up(outcome.overallSideTotals[0])}`,
    );
  }

  if (outcome.greenies.enabled) {
    const greenies = outcome.greenies;
    const won = greenies.holes.filter((greenie) => greenie.winnerId);
    let line =
      won.length === 0
        ? "Greenies: none yet"
        : `Greenies: ${won
            .map((greenie) => `${marker(greenie.hole)} ${nameOf(greenie.winnerId as PlayerId)}`)
            .join(", ")}`;
    if (greenies.sweptBy !== null) {
      line += ` — swept by ${config.sides[greenies.sweptBy].name}, doubled`;
    }
    if (won.length > 0) line += ` — ${up(greenies.sideTotals[0])}`;
    lines.push(line);
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
