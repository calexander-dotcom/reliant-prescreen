import { balanceOnto, normalizeAmounts, teamTransfer, zeroAmounts } from "./bets/ledger";
import type { PlayerId, Round } from "./types";

/**
 * Pure round updates, kept out of the components so the rules that matter —
 * above all "a hole nets to zero" — are testable without rendering anything.
 */

function touch(round: Round): Round {
  return { ...round, updatedAt: new Date().toISOString() };
}

export function setScore(
  round: Round,
  playerId: PlayerId,
  hole: number,
  value: number | null,
): Round {
  return touch({
    ...round,
    scores: {
      ...round.scores,
      [playerId]: { ...(round.scores[playerId] ?? {}), [hole]: value },
    },
  });
}

/**
 * Set one player's money for a hole.
 *
 * With a banker named for the hole, the banker is on the other side of every
 * bet, so their number is re-derived on each edit and the hole stays balanced
 * without anyone doing arithmetic. Editing the banker's own cell instead
 * pushes the remainder back onto them, which is a no-op.
 */
export function setManualAmount(
  round: Round,
  hole: number,
  playerId: PlayerId,
  cents: number,
): Round {
  const ids = round.players.map((player) => player.id);
  const entry = round.manual[hole];
  const banker = entry?.bankerId ?? null;

  let amounts = {
    ...normalizeAmounts(entry?.amounts ?? {}, ids),
    [playerId]: cents,
  };

  if (banker && banker !== playerId && ids.includes(banker)) {
    amounts = balanceOnto(amounts, banker, ids);
  }

  return touch({
    ...round,
    manual: { ...round.manual, [hole]: { ...entry, amounts, bankerId: banker } },
  });
}

export function setBanker(
  round: Round,
  hole: number,
  bankerId: PlayerId | null,
): Round {
  const ids = round.players.map((player) => player.id);
  const entry = round.manual[hole];
  let amounts = normalizeAmounts(entry?.amounts ?? {}, ids);

  // Naming a banker settles the hole immediately against what is already in.
  if (bankerId && ids.includes(bankerId)) amounts = balanceOnto(amounts, bankerId, ids);

  return touch({
    ...round,
    manual: { ...round.manual, [hole]: { ...entry, amounts, bankerId } },
  });
}

export function balanceHoleOnto(
  round: Round,
  hole: number,
  playerId: PlayerId,
): Round {
  const ids = round.players.map((player) => player.id);
  const entry = round.manual[hole];
  const amounts = balanceOnto(
    normalizeAmounts(entry?.amounts ?? {}, ids),
    playerId,
    ids,
  );
  return touch({
    ...round,
    manual: { ...round.manual, [hole]: { ...entry, amounts } },
  });
}

export function applyTeamTransfer(
  round: Round,
  hole: number,
  winnerIds: PlayerId[],
  loserIds: PlayerId[],
  amountPerPair: number,
): Round {
  const ids = round.players.map((player) => player.id);
  const amounts = teamTransfer(winnerIds, loserIds, amountPerPair, ids);
  const entry = round.manual[hole];
  return touch({
    ...round,
    manual: { ...round.manual, [hole]: { ...entry, amounts } },
  });
}

export function clearHoleMoney(round: Round, hole: number): Round {
  const ids = round.players.map((player) => player.id);
  const entry = round.manual[hole];
  return touch({
    ...round,
    manual: {
      ...round.manual,
      [hole]: { ...entry, amounts: zeroAmounts(ids), bankerId: entry?.bankerId ?? null },
    },
  });
}

export function setHoleNote(round: Round, hole: number, note: string): Round {
  const entry = round.manual[hole];
  const ids = round.players.map((player) => player.id);
  return touch({
    ...round,
    manual: {
      ...round.manual,
      [hole]: {
        amounts: normalizeAmounts(entry?.amounts ?? {}, ids),
        bankerId: entry?.bankerId ?? null,
        note,
      },
    },
  });
}

/** Removing a player has to clean up their money and their side of every bet. */
export function removePlayer(round: Round, playerId: PlayerId): Round {
  const players = round.players.filter((player) => player.id !== playerId);
  const ids = players.map((player) => player.id);

  const scores = { ...round.scores };
  delete scores[playerId];

  const manual: Round["manual"] = {};
  for (const [hole, entry] of Object.entries(round.manual)) {
    manual[Number(hole)] = {
      ...entry,
      amounts: normalizeAmounts(entry.amounts, ids),
      bankerId: entry.bankerId === playerId ? null : entry.bankerId,
    };
  }

  const bets = round.bets.map((bet) => {
    if (bet.kind === "skins") {
      return { ...bet, playerIds: bet.playerIds.filter((id) => id !== playerId) };
    }
    return {
      ...bet,
      sides: bet.sides.map((side) => ({
        ...side,
        playerIds: side.playerIds.filter((id) => id !== playerId),
      })) as typeof bet.sides,
    };
  });

  return touch({ ...round, players, scores, manual, bets });
}
