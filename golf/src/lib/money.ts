/**
 * All money in this app is stored as an integer number of cents.
 *
 * Betting math sums and negates values constantly (a hole must net to zero,
 * a settlement must net to zero). Floating point breaks that invariant:
 * 0.1 + 0.2 !== 0.3, so a "balanced" hole could read as off by a fraction of
 * a cent and a settlement could drift. Integers make zero mean zero.
 */

/** Parse loose user input ("20", "$20.50", "-40", "(10)", "20.5") into cents. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }

  let text = input.trim();
  if (text === "" || text === "-" || text === "+" || text === ".") return null;

  // Accounting-style negatives: (10) means -10.
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  text = text.replace(/[$,\s]/g, "");

  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }

  if (!/^\d*(\.\d*)?$/.test(text) || text === "" || text === ".") return null;

  const [whole, fraction = ""] = text.split(".");
  const cents =
    Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2)) +
    // Round the third decimal place rather than truncating it.
    (Number(fraction[2] ?? "0") >= 5 ? 1 : 0);

  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/** "$20.00" — magnitude only, no sign decoration beyond a leading minus. */
export function formatMoney(cents: number, opts: { cents?: boolean } = {}): string {
  const showCents = opts.cents ?? true;
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const body = showCents
    ? `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
    : String(Math.round(abs / 100));
  return `${negative ? "-" : ""}$${body}`;
}

/** "+$20.00" / "-$40.00" / "$0.00" — for ledgers where the sign carries meaning. */
export function formatSigned(cents: number, opts: { cents?: boolean } = {}): string {
  if (cents === 0) return formatMoney(0, opts);
  return cents > 0 ? `+${formatMoney(cents, opts)}` : formatMoney(cents, opts);
}

/** Compact form for tight scorecard cells: "+20", "-40", "—". */
export function formatCompact(cents: number): string {
  if (cents === 0) return "—";
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  const body = Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
  return `${cents > 0 ? "+" : "-"}${body}`;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Split a pot into whole cents across recipients without losing or inventing
 * money. Remainder cents go to the earliest recipients, so the parts always
 * add back up to the original total.
 */
export function distributeCents(total: number, count: number): number[] {
  if (count <= 0) return [];
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / count);
  const remainder = abs % count;
  return Array.from({ length: count }, (_, index) =>
    sign * (base + (index < remainder ? 1 : 0)),
  );
}
