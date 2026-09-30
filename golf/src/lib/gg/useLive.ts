"use client";

import { useEffect, useRef, useState } from "react";
import { apiGgFoursome } from "../api";
import type { Round } from "../types";
import { mergeGgFeed } from "./live";

/**
 * Poll a round's Golf Genius foursome while it is on screen.
 *
 * When a round is tied to a foursome, this re-reads its scores every so often
 * and folds any change back in through the round's own `update`, so the card
 * fills as the group scores in Golf Genius. It reads only — Golf Genius has no
 * way to write scores back. A backgrounded tab is left alone and picks straight
 * back up. The key stays on the server; this only ever calls our own route.
 */

export type GgLiveState = "off" | "syncing" | "ok" | "error";

export interface GgLiveStatus {
  state: GgLiveState;
  /** Epoch ms of the last successful read, for an "updated Ns ago" line. */
  lastOk: number | null;
  error: string | null;
}

/** ~15s: inside the "ten to twenty seconds" the group wants, gentle on the API. */
const INTERVAL_MS = 15_000;

export function useGgLive(
  round: Round | null,
  apply: (next: Round) => void,
): GgLiveStatus {
  const [status, setStatus] = useState<GgLiveStatus>({
    state: "off",
    lastOk: null,
    error: null,
  });

  // The latest round and update fn, so the poll runs on a stable schedule
  // without resubscribing every time a score changes.
  const roundRef = useRef(round);
  roundRef.current = round;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const gg = round?.gg ?? null;
  const ggid = gg?.ggid ?? null;
  const eventId = gg?.eventId ?? null;
  const roundId = gg?.roundId ?? null;

  useEffect(() => {
    if (!ggid || !eventId || !roundId) {
      setStatus({ state: "off", lastOk: null, error: null });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      // Don't spend a read on a tab nobody is looking at.
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, INTERVAL_MS);
        return;
      }
      // Only announce "syncing" before the first read; after that keep the last
      // good state so the line does not flicker every fifteen seconds.
      setStatus((s) => (s.lastOk ? s : { ...s, state: "syncing" }));
      try {
        const foursome = await apiGgFoursome({ eventId, roundId, ggid });
        if (cancelled) return;
        const current = roundRef.current;
        if (current) {
          const merged = mergeGgFeed(current, foursome);
          if (merged !== current) applyRef.current(merged);
        }
        setStatus({ state: "ok", lastOk: Date.now(), error: null });
      } catch (error) {
        if (cancelled) return;
        setStatus((s) => ({
          state: "error",
          lastOk: s.lastOk,
          error: error instanceof Error ? error.message : "Golf Genius read failed",
        }));
      } finally {
        if (!cancelled) timer = setTimeout(tick, INTERVAL_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ggid, eventId, roundId]);

  return status;
}
