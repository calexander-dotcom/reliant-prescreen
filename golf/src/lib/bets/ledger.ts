import { sumCents } from "../money";
import type { ManualHoleEntry, PlayerId, Round } from "../types";

/**
 * The manual money ledger.
 *
 * Every hole is a closed system: the money one player wins came out of the
 * other players' pockets, so the signed amounts for a hole must sum to zero.
 * +20 / +30 / -40 / -10 balances. +20 / +30 / -40 / -20 does not, and the UI
 * refuses to call the hole settled until it does.
 */

/** How far a hole is from balancing. 0 means settled. */
export function imbalance(
  amounts: Record<PlayerId, number>,
  playerIds?: PlayerId[],
): number {
  const ids = playerIds ?? Object.keys(amounts);
  return sumCents(ids.map((id) => amounts[id] ?? 0));
}

export function isBalanced(
  amounts: Record<PlayerId, number>,
  playerIds?: PlayerId[],
): boolean {
  return imbalance(amounts, playerIds) === 0;
}

export function zeroAmounts(playerIds: PlayerId[]): Record<PlayerId, number> {
  return Object.fromEntries(playerIds.map((id) => [id, 0]));
}

/** Drop unknown players and fill in missing ones with 0. */
export function normalizeAmounts(
  amounts: Record<PlayerId, number>,
  playerIds: PlayerId[],
): Record<PlayerId, number> {
  const next: Record<PlayerId, number> = {};
  for (const id of playerIds) next[id] = amounts[id] ?? 0;
  return next;
}

/**
 * Push the whole remainder onto one player so the hole nets to zero.
 *
 * This is also exactly how a banker hole works: enter what each opponent won or
 * lost, and the banker absorbs the other side of every one of those bets.
 */
export function balanceOnto(
  amounts: Record<PlayerId, number>,
  absorberId: PlayerId,
  playerIds: PlayerId[],
): Record<PlayerId, number> {
  const others = playerIds.filter((id) => id !== absorberId);
  const next = normalizeAmounts(amounts, playerIds);
  next[absorberId] = -sumCents(others.map((id) => next[id] ?? 0));
  return next;
}

/**
 * Quick entry for the common "our team beat your team" hole: every player on
 * the losing side pays every player on the winning side `amountPerPair`.
 * Zero-sum by construction.
 */
export function teamTransfer(
  winnerIds: PlayerId[],
  loserIds: PlayerId[],
  amountPerPair: number,
  playerIds: PlayerId[],
): Record<PlayerId, number> {
  const next = zeroAmounts(playerIds);
  for (const winner of winnerIds) {
    if (!(winner in next)) continue;
    next[winner] += amountPerPair * loserIds.length;
  }
  for (const loser of loserIds) {
    if (!(loser in next)) continue;
    next[loser] -= amountPerPair * winnerIds.length;
  }
  return next;
}

export interface LedgerHoleStatus {
  hole: number;
  entered: boolean;
  balanced: boolean;
  imbalance: number;
  amounts: Record<PlayerId, number>;
}

/** Per-hole status for the whole card, in hole order. */
export function ledgerStatus(
  manual: Record<number, ManualHoleEntry>,
  playerIds: PlayerId[],
  holeCount: number,
): LedgerHoleStatus[] {
  const out: LedgerHoleStatus[] = [];
  for (let hole = 1; hole <= holeCount; hole += 1) {
    const entry = manual[hole];
    const amounts = normalizeAmounts(entry?.amounts ?? {}, playerIds);
    const entered = playerIds.some((id) => (amounts[id] ?? 0) !== 0);
    out.push({
      hole,
      entered,
      balanced: isBalanced(amounts, playerIds),
      imbalance: imbalance(amounts, playerIds),
      amounts,
    });
  }
  return out;
}

/** Running manual-ledger total per player, counting balanced holes only. */
export function ledgerTotals(
  manual: Record<number, ManualHoleEntry>,
  playerIds: PlayerId[],
  holeCount: number,
  options: { includeUnbalanced?: boolean } = {},
): Record<PlayerId, number> {
  const totals = zeroAmounts(playerIds);
  for (const status of ledgerStatus(manual, playerIds, holeCount)) {
    if (!status.balanced && !options.includeUnbalanced) continue;
    for (const id of playerIds) totals[id] += status.amounts[id] ?? 0;
  }
  return totals;
}

/** Cumulative ledger total through each hole, for the running-total row. */
export function ledgerRunning(
  manual: Record<number, ManualHoleEntry>,
  playerIds: PlayerId[],
  holeCount: number,
): Record<PlayerId, number>[] {
  const running: Record<PlayerId, number>[] = [];
  const totals = zeroAmounts(playerIds);
  for (const status of ledgerStatus(manual, playerIds, holeCount)) {
    for (const id of playerIds) totals[id] += status.amounts[id] ?? 0;
    running.push({ ...totals });
  }
  return running;
}

export function manualEntryFor(round: Round, hole: number): ManualHoleEntry {
  const ids = round.players.map((p) => p.id);
  const entry = round.manual[hole];
  return {
    amounts: normalizeAmounts(entry?.amounts ?? {}, ids),
    bankerId: entry?.bankerId ?? null,
    note: entry?.note,
  };
}
