import { loadMe } from "./storage";
import type { Round } from "./types";

/**
 * Whose side to read the bets from, guessed once when a round is first
 * opened: the "me" player, if they are in it. Matched by id, or by GHIN
 * number for a copy of the account holder that came in through the
 * following list. Nobody, when they are not playing — then it is side A
 * until somebody picks on the Bets tab.
 */
export function guessPerspective(round: Round): Round {
  const me = loadMe();
  const mine = me
    ? round.players.find(
        (player) =>
          player.id === me.id ||
          (!!me.ghinNumber && player.ghinNumber === me.ghinNumber),
      )
    : undefined;
  return { ...round, perspectiveId: mine?.id ?? null };
}
