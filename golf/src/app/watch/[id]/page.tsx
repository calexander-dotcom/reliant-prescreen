"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BetsView } from "@/components/BetsView";
import { CardView } from "@/components/CardView";
import { SettleView } from "@/components/SettleView";
import { TotalsStrip } from "@/components/TotalsStrip";
import { Banner, Card, SectionTitle, Spinner } from "@/components/ui";
import { ApiError, apiFetchShare } from "@/lib/api";
import { computeRound } from "@/lib/bets";
import type { SharedRound } from "@/lib/share/payload";

type Tab = "card" | "bets" | "settle";

const TABS: { id: Tab; label: string }[] = [
  { id: "card", label: "Card" },
  { id: "bets", label: "Bets" },
  { id: "settle", label: "Settle" },
];

/**
 * How often to ask for a newer copy of the round.
 *
 * Starts quick after a change and eases off while nothing is happening, which
 * matters because these reads are the running cost of sharing: a fixed
 * ten-second poll for a four-hour round is well over a thousand reads per
 * follower, most of them returning the same card between holes.
 */
const POLL_MIN_MS = 10_000;
const POLL_MAX_MS = 45_000;

/**
 * Following a round, read only.
 *
 * There is no editing here by construction, not just by hiding buttons:
 * publishing an update needs the write token, and that never leaves the
 * scoring device. This page only ever issues a GET.
 */
export default function WatchPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : params.id?.[0];

  const [shared, setShared] = useState<SharedRound | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Current gap between polls, widened while nothing changes. */
  const delay = useRef(POLL_MIN_MS);
  const lastSeen = useRef<string | null>(null);

  /** Fetch, and say whether anything actually changed. */
  const load = useCallback(async (): Promise<boolean> => {
    if (!id) return false;
    try {
      const next = await apiFetchShare(id);
      setShared((current) =>
        current && current.updatedAt === next.updatedAt ? current : next,
      );
      setError(null);
      setGone(false);
      const changed = lastSeen.current !== next.updatedAt;
      lastSeen.current = next.updatedAt;
      return changed;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) setGone(true);
      else setError(caught instanceof ApiError ? caught.message : "Could not load.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      // A backgrounded tab polls nothing; coming back to it restarts this.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      const changed = await load();
      if (stopped) return;
      delay.current = changed
        ? POLL_MIN_MS
        : Math.min(POLL_MAX_MS, Math.round(delay.current * 1.5));
      timer = setTimeout(() => void tick(), delay.current);
    };

    void tick();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // Catch up straight away, and be quick again for a while.
      delay.current = POLL_MIN_MS;
      if (timer) clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const [tab, setTab] = useState<Tab>("card");
  const comp = useMemo(() => (shared ? computeRound(shared.round) : null), [shared]);

  if (loading) {
    return (
      <main className="py-8">
        <Spinner label="Loading the round…" />
      </main>
    );
  }

  if (gone) {
    return (
      <main className="space-y-4 pt-4">
        <Banner tone="warn">
          This round is not on the server right now. Shared rounds are removed a
          week after the last update, and whoever is keeping the card can stop
          sharing at any point. Leave this page open either way: if the card is
          still being kept, it will come back on its own within a minute.
        </Banner>
        <Link href="/" className="text-sm font-semibold text-turf-700">
          Go to Golf Bets
        </Link>
      </main>
    );
  }

  if (!shared || !comp) {
    return (
      <main className="space-y-4 pt-4">
        <Banner tone="error">{error ?? "Could not load that round."}</Banner>
      </main>
    );
  }

  const round = shared.round;

  return (
    <main className="space-y-4">
      <header className="pt-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-turf-100 px-2 py-0.5 text-xs font-bold text-turf-800">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-turf-600" />
            Following
          </span>
          <span className="text-xs text-neutral-500">
            updated {new Date(shared.updatedAt).toLocaleTimeString()}
          </span>
        </div>
        <h1 className="mt-1 truncate text-xl font-black tracking-tight text-turf-900">
          {round.courseName || "Round"}
        </h1>
        <p className="truncate text-xs text-neutral-500">
          {round.date} · {round.players.length} players · view only
        </p>
      </header>

      {error ? (
        <Banner tone="warn">
          {error} Showing the last copy that came through.
        </Banner>
      ) : null}

      <TotalsStrip round={round} comp={comp} />

      {round.players.length === 0 ? (
        <Card>
          <SectionTitle>Nothing to show yet</SectionTitle>
          <p className="text-sm text-neutral-600">
            The round has not been set up yet. This page updates on its own.
          </p>
        </Card>
      ) : null}

      {/* No editing handlers are passed in, so there is nothing to change. */}
      {tab === "card" ? (
        <CardView round={round} comp={comp} onPickHole={() => undefined} readOnly />
      ) : null}
      {tab === "bets" ? <BetsView round={round} comp={comp} readOnly /> : null}
      {tab === "settle" ? <SettleView round={round} comp={comp} /> : null}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur">
        <div
          className="mx-auto flex max-w-3xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${
                tab === entry.id
                  ? "text-turf-800"
                  : "text-neutral-500 active:text-neutral-700"
              }`}
            >
              <span
                className={`block ${
                  tab === entry.id ? "border-t-2 border-turf-700 pt-2" : "pt-2"
                }`}
              >
                {entry.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
