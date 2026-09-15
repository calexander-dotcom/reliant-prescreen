"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BetsView } from "@/components/BetsView";
import { CardView } from "@/components/CardView";
import { HoleView } from "@/components/HoleView";
import { SettleView } from "@/components/SettleView";
import { ShareCard } from "@/components/ShareCard";
import { TotalsStrip } from "@/components/TotalsStrip";
import { Banner, Card, LinkButton, SectionTitle } from "@/components/ui";
import { computeRound } from "@/lib/bets";
import { loadRound, saveRound } from "@/lib/storage";
import type { Round } from "@/lib/types";

type Tab = "hole" | "card" | "bets" | "settle";

const TABS: { id: Tab; label: string }[] = [
  { id: "hole", label: "Hole" },
  { id: "card", label: "Card" },
  { id: "bets", label: "Bets" },
  { id: "settle", label: "Settle" },
];

export default function RoundPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : params.id?.[0];

  const [round, setRound] = useState<Round | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("hole");
  const [hole, setHole] = useState(1);

  useEffect(() => {
    if (!id) return;
    const found = loadRound(id);
    if (found) setRound(found);
    else setMissing(true);
  }, [id]);

  // Persist on every change: the tab can be closed at any moment out there.
  const update = (next: Round) => {
    setRound(next);
    saveRound(next);
  };

  const comp = useMemo(() => (round ? computeRound(round) : null), [round]);

  if (missing) {
    return (
      <main className="space-y-4 pt-4">
        <Banner tone="warn">
          That round is not on this device. Rounds are stored in the browser, so
          they do not follow you to another phone or a private window.
        </Banner>
        <LinkButton href="/">Back to rounds</LinkButton>
      </main>
    );
  }

  if (!round || !comp) {
    return <main className="py-8 text-neutral-500">Loading…</main>;
  }

  return (
    <main className="space-y-4">
      <header className="flex items-baseline justify-between gap-3 pt-2">
        <div className="min-w-0">
          <Link href="/" className="text-xs font-semibold text-turf-700">
            ← Rounds
          </Link>
          <h1 className="truncate text-xl font-black tracking-tight text-turf-900">
            {round.courseName || "Round"}
          </h1>
          <p className="truncate text-xs text-neutral-500">
            {round.date} · {comp.tee ? `${comp.tee.name} tees · ` : ""}
            {round.holeCount} holes
          </p>
        </div>
      </header>

      <TotalsStrip round={round} comp={comp} />

      {round.players.length < 2 ? (
        <Card>
          <SectionTitle>This round has fewer than two players</SectionTitle>
          <p className="text-sm text-neutral-600">
            Add players from the Bets tab setup, or start a new round.
          </p>
        </Card>
      ) : null}

      {tab === "hole" ? (
        <HoleView
          round={round}
          comp={comp}
          hole={Math.min(hole, round.holeCount)}
          onHoleChange={setHole}
          update={update}
        />
      ) : null}
      {tab === "card" ? (
        <>
          <CardView
            round={round}
            comp={comp}
            onPickHole={(picked) => {
              setHole(picked);
              setTab("hole");
            }}
          />
          <ShareCard round={round} update={update} />
        </>
      ) : null}
      {tab === "bets" ? <BetsView round={round} comp={comp} update={update} /> : null}
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
