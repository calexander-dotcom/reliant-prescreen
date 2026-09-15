import type { Player, Side } from "../types";

/**
 * A side's label follows the people on it.
 *
 * The app names a side by its players' first names — "Charles / Andy" — and
 * it did that once, when the round was made. Move players between the sides
 * afterwards and the money followed them while the label did not: a round
 * read "Charles / Andrew up $80 each" while paying Charles and Andy. So a
 * name the app made up is refreshed from the side's current players every
 * time it is shown; a name somebody typed is theirs and stays.
 */

function firstName(player: Player): string {
  return player.name.trim().split(/\s+/)[0] ?? "";
}

/**
 * First names of the side's players, as the app would write them — in the
 * round's order, not the order they were moved onto the side, so a swap
 * does not also shuffle the label.
 */
export function autoSideName(side: Side, players: Player[], fallback: string): string {
  const names = players
    .filter((player) => side.playerIds.includes(player.id))
    .map(firstName)
    .filter(Boolean);
  return names.length > 0 ? names.join(" / ") : fallback;
}

/**
 * Whether a stored name is one the app made up rather than one somebody
 * typed: empty, a placeholder, or first names of players in the round joined
 * the way the app joins them — in any order, since the order is exactly what
 * goes stale.
 */
export function isAutoSideName(name: string, players: Player[]): boolean {
  const trimmed = name.trim();
  if (trimmed === "" || /^Side [AB]$/.test(trimmed)) return true;
  const known = new Set(players.map(firstName).filter(Boolean));
  const tokens = trimmed.split(" / ");
  return tokens.length > 0 && tokens.every((token) => known.has(token));
}

/** The label to show for a side, given the round's players. */
export function sideLabel(side: Side, players: Player[], fallback: string): string {
  return isAutoSideName(side.name, players)
    ? autoSideName(side, players, fallback)
    : side.name;
}

/** Both sides with their labels refreshed, for anything that reads `side.name`. */
export function labelledSides(sides: [Side, Side], players: Player[]): [Side, Side] {
  return [
    { ...sides[0], name: sideLabel(sides[0], players, "Side A") },
    { ...sides[1], name: sideLabel(sides[1], players, "Side B") },
  ];
}
