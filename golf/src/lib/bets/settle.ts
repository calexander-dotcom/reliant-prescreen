import { sumCents } from "../money";
import type { PlayerId } from "../types";

export interface Transfer {
  fromId: PlayerId;
  toId: PlayerId;
  amount: number;
}

/**
 * Turn net positions into the fewest payments that clear them.
 *
 * Greedy largest-debtor-pays-largest-creditor. For n players with money owed it
 * produces at most n-1 payments, which is the practical minimum for the
 * "settle up in the parking lot" use case.
 */
export function settle(totals: Record<PlayerId, number>): Transfer[] {
  const creditors = Object.entries(totals)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const debtors = Object.entries(totals)
    .filter(([, amount]) => amount < 0)
    .map(([id, amount]) => ({ id, amount: -amount }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      transfers.push({ fromId: debtor.id, toId: creditor.id, amount });
      creditor.amount -= amount;
      debtor.amount -= amount;
    }

    if (creditor.amount === 0) ci += 1;
    if (debtor.amount === 0) di += 1;
  }

  return transfers;
}

/**
 * Non-zero total means a hole was left unbalanced somewhere. The UI surfaces
 * this rather than silently paying out money that nobody put in.
 */
export function settlementResidual(totals: Record<PlayerId, number>): number {
  return sumCents(Object.values(totals));
}
