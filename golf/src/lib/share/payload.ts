import type { Round } from "../types";

/** How long a shared round sticks around after its last update. */
export const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** What a viewer receives. */
export interface SharedRound {
  round: Round;
  updatedAt: string;
}

/** What is actually kept in the store. */
export interface StoredShare extends SharedRound {
  writeTokenHash: string;
}

/**
 * Strip everything a viewer has no business receiving before publishing.
 *
 * Above all the write token: it lives on the round in local storage so the
 * scoring device can keep publishing, and sending the round as-is would hand
 * that token to everybody who opened the link, letting any of them rewrite the
 * card. Viewers get the round and nothing else.
 */
export function publishableRound(round: Round): Round {
  const { share: _share, ...rest } = round as Round & { share?: unknown };
  return rest as Round;
}

/** Basic shape check on data coming back from the store or the network. */
export function isSharedRound(value: unknown): value is SharedRound {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { round?: unknown };
  const round = candidate.round as { id?: unknown; players?: unknown } | undefined;
  return (
    !!round &&
    typeof round === "object" &&
    typeof round.id === "string" &&
    Array.isArray(round.players)
  );
}
