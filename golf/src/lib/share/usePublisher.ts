"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, apiPublishShare } from "../api";
import { publishableRound } from "./payload";
import type { Round } from "../types";

/** Wait this long after the last edit before publishing. */
const DEBOUNCE_MS = 4000;

export type PublishState = "idle" | "publishing" | "published" | "failed";

export interface PublishStatus {
  state: PublishState;
  /** Local time of the last successful publish. */
  publishedAt: string | null;
  error: string | null;
}

/**
 * Keep the shared copy of a round current, from wherever the scorer is.
 *
 * This has to live above the tabs. Scores are entered on the Hole tab, but the
 * share card sits on the Card tab, so when the publisher lived inside that card
 * it only ran while the card was on screen — and a round is scored on the Hole
 * tab, so not one hole was sent as it was played. Followers saw the snapshot
 * from the moment sharing started and nothing after. Run from the page instead,
 * it publishes on every change on any tab.
 *
 * Debounced, because entering a hole is several edits in a row that only need
 * to land once. `updatedAt` is the change signal: every mutation bumps it.
 */
export function useSharePublisher(round: Round | null): PublishStatus {
  const [state, setState] = useState<PublishState>("idle");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read at fire time so the publish always sends the newest round.
  const latest = useRef<Round | null>(round);
  latest.current = round;

  const shareId = round?.share?.id ?? null;
  const shareToken = round?.share?.token ?? null;
  const stamp = round?.updatedAt ?? null;

  useEffect(() => {
    if (!shareId || !shareToken) {
      setState("idle");
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const current = latest.current;
      if (!current) return;
      setState("publishing");
      setError(null);
      apiPublishShare(shareId, shareToken, publishableRound(current))
        .then(() => {
          setState("published");
          setPublishedAt(new Date().toLocaleTimeString());
        })
        .catch((caught) => {
          setState("failed");
          setError(caught instanceof ApiError ? caught.message : "Could not publish.");
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // shareId/shareToken start and stop it; stamp reschedules on every edit.
  }, [shareId, shareToken, stamp]);

  return { state, publishedAt, error };
}
