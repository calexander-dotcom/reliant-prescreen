import { balanceOnto, normalizeAmounts, teamTransfer, zeroAmounts } from "./bets/ledger";
import { MAX_PRESSES_PER_HOLE, pressCounts } from "./bets/onedown";
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

  const touched = new Set(entry?.touched ?? []);
  touched.add(playerId);

  let amounts = {
    ...normalizeAmounts(entry?.amounts ?? {}, ids),
    [playerId]: cents,
  };

  if (banker && banker !== playerId && ids.includes(banker)) {
    amounts = balanceOnto(amounts, banker, ids);
  } else {
    /*
     * Everyone entered but one: the last player's number is not a guess, it is
     * whatever makes the hole net to zero. Fill it in rather than making
     * somebody do the arithmetic. They stay untouched, so editing the others
     * keeps re-deriving their figure until they type in it themselves.
     */
    const untouched = ids.filter((id) => !touched.has(id));
    if (untouched.length === 1) {
      amounts = balanceOnto(amounts, untouched[0], ids);
    }
  }

  return touch({
    ...round,
    manual: {
      ...round.manual,
      [hole]: {
        ...entry,
        amounts,
        bankerId: banker,
        touched: [...touched],
      },
    },
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
      [hole]: {
        ...entry,
        amounts: zeroAmounts(ids),
        bankerId: entry?.bankerId ?? null,
        // Clearing puts every cell back to untouched, so autofill works again.
        touched: [],
      },
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

/**
 * Set how many presses were called by hand after a hole.
 *
 * A press is stored against the hole it was called after — one less than
 * the hole it opens on, so `0` is a press on the 1st tee — and each one
 * opens a bet covering that next hole onwards. Several on the same hole is
 * allowed, up to MAX_PRESSES_PER_HOLE, and means several bets riding on the
 * same golf. The screens talk in "before hole N": see setPressesBefore.
 */
export function setManualPresses(
  round: Round,
  betId: string,
  hole: number,
  count: number,
): Round {
  const clamped = Math.max(0, Math.min(MAX_PRESSES_PER_HOLE, Math.floor(count)));
  return touch({
    ...round,
    bets: round.bets.map((bet) => {
      if (bet.id !== betId || bet.kind !== "onedown") return bet;
      // Through pressCounts so a round saved in the old list shape becomes
      // counts here rather than being spread into nonsense keys.
      const presses = Object.fromEntries(pressCounts(bet.manualPresses));
      if (clamped === 0) delete presses[hole];
      else presses[hole] = clamped;
      return { ...bet, manualPresses: presses };
    }),
  });
}

/** Nudge the press count for a hole up or down. */
export function adjustManualPresses(
  round: Round,
  betId: string,
  hole: number,
  delta: number,
): Round {
  const bet = round.bets.find((entry) => entry.id === betId);
  const current =
    bet && bet.kind === "onedown" ? (pressCounts(bet.manualPresses).get(hole) ?? 0) : 0;
  return setManualPresses(round, betId, hole, current + delta);
}

/** A press before hole N is a bet opened by hand on N, stored against N − 1. */
export function setPressesBefore(
  round: Round,
  betId: string,
  hole: number,
  count: number,
): Round {
  return setManualPresses(round, betId, hole - 1, count);
}

/** Nudge the presses before a hole up or down. */
export function adjustPressesBefore(
  round: Round,
  betId: string,
  hole: number,
  delta: number,
): Round {
  return adjustManualPresses(round, betId, hole - 1, delta);
}

/** Hand the deal to a player for one hole, overriding the rotation. */
export function setHoleBanker(
  round: Round,
  betId: string,
  hole: number,
  playerId: PlayerId | null,
): Round {
  return touch({
    ...round,
    bets: round.bets.map((bet) => {
      if (bet.id !== betId || bet.kind !== "banker") return bet;
      const byHole = { ...(bet.bankerByHole ?? {}) };
      if (playerId) byHole[hole] = playerId;
      else delete byHole[hole];
      return { ...bet, bankerByHole: byHole };
    }),
  });
}

/**
 * Cycle one opponent's stake for a hole: flat, doubled, doubled back, flat.
 *
 * Kept as a single control because that is the order it happens in out there —
 * a player doubles, the banker doubles back — and it means one tap per step
 * with no separate "who doubled" bookkeeping.
 */
export function cycleBankerDouble(
  round: Round,
  betId: string,
  hole: number,
  playerId: PlayerId,
): Round {
  const steps = [1, 2, 4];
  return touch({
    ...round,
    bets: round.bets.map((bet) => {
      if (bet.id !== betId || bet.kind !== "banker") return bet;
      const holeDoubles = { ...(bet.doubles?.[hole] ?? {}) };
      const current = holeDoubles[playerId] ?? 1;
      const next = steps[(steps.indexOf(current) + 1) % steps.length] ?? 1;
      if (next === 1) delete holeDoubles[playerId];
      else holeDoubles[playerId] = next;

      const doubles = { ...(bet.doubles ?? {}) };
      if (Object.keys(holeDoubles).length === 0) delete doubles[hole];
      else doubles[hole] = holeDoubles;
      return { ...bet, doubles };
    }),
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
      touched: (entry.touched ?? []).filter((id) => id !== playerId),
    };
  }

  const bets = round.bets.map((bet) => {
    if (bet.kind === "skins") {
      return { ...bet, playerIds: bet.playerIds.filter((id) => id !== playerId) };
    }
    if (bet.kind === "banker") {
      const bankerByHole = Object.fromEntries(
        Object.entries(bet.bankerByHole ?? {}).filter(([, id]) => id !== playerId),
      );
      return {
        ...bet,
        playerIds: bet.playerIds.filter((id) => id !== playerId),
        firstBankerId:
          bet.firstBankerId === playerId ? (ids[0] ?? null) : bet.firstBankerId,
        bankerByHole,
      };
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

/** Whose side the standings are read from. null reads them from side A. */
export function setPerspective(round: Round, playerId: PlayerId | null): Round {
  return touch({ ...round, perspectiveId: playerId });
}

/**
 * Who won the greenie on a par 3: a player, null for nobody, or undefined to
 * take the answer back.
 */
export function setGreenie(
  round: Round,
  betId: string,
  hole: number,
  winnerId: PlayerId | null | undefined,
): Round {
  return touch({
    ...round,
    bets: round.bets.map((bet) => {
      if (bet.id !== betId || bet.kind !== "onedown") return bet;
      const winners = { ...(bet.greenieWinners ?? {}) };
      if (winnerId === undefined) delete winners[hole];
      else winners[hole] = winnerId;
      return { ...bet, greenieWinners: winners };
    }),
  });
}
