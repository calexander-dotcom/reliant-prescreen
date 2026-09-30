"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { computeRound } from "@/lib/bets";
import { formatSigned } from "@/lib/money";
import { deleteRound, loadRounds } from "@/lib/storage";
import type { Round } from "@/lib/types";
import { Hero } from "@/components/Hero";
import { Banner, Button, Card, LinkButton, SectionTitle } from "@/components/ui";

export default function HomePage() {
  const [rounds, setRounds] = useState<Round[] | null>(null);

  useEffect(() => {
    setRounds(loadRounds());
  }, []);

  return (
    <main className="space-y-5">
      <Hero />

      {rounds && rounds.length > 0 ? <ResumeCard round={rounds[0]} /> : null}

      <Card>
        <SectionTitle hint="Saved on this device. Works with no signal.">
          Rounds
        </SectionTitle>

        {rounds === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : rounds.length === 0 ? (
          <Banner>No rounds yet. Start one above.</Banner>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {rounds.map((round) => (
              <RoundRow
                key={round.id}
                round={round}
                onDelete={() => {
                  deleteRound(round.id);
                  setRounds(loadRounds());
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>How the money works</SectionTitle>
        <ul className="space-y-2 text-sm text-neutral-700">
          <li>
            <strong className="text-neutral-900">Hole by hole.</strong> Type what
            each player won or lost. The app holds the hole open until it nets to
            zero, so nothing gets paid out that nobody put in.
          </li>
          <li>
            <strong className="text-neutral-900">Banker.</strong> Name a banker and
            enter everyone else&apos;s result — the banker automatically takes the
            other side of every bet on that hole.
          </li>
          <li>
            <strong className="text-neutral-900">Nassau with presses.</strong> Front,
            back and total. Go one down and a new bet opens over the rest of the
            segment, automatically.
          </li>
          <li>
            <strong className="text-neutral-900">Skins.</strong> Low score takes the
            hole, ties carry over.
          </li>
        </ul>
      </Card>
    </main>
  );
}

/** Every player has a score on every hole — the round is done, not mid-play. */
function roundComplete(round: Round): boolean {
  return (
    round.players.length > 0 &&
    round.players.every((player) => {
      for (let hole = 1; hole <= round.holeCount; hole += 1) {
        if ((round.scores[player.id]?.[hole] ?? null) === null) return false;
      }
      return true;
    })
  );
}

/**
 * A jump straight back into the round in progress — the most recent one, with
 * its Golf Genius tie-in and all. Rounds live in the browser, so closing the
 * app never loses them; this just saves hunting for it in the list. Hidden once
 * every hole has a score, when there is nothing left to resume.
 */
function ResumeCard({ round }: { round: Round }) {
  const comp = computeRound(round);
  const posted = Object.values(comp.totalsByPlayer).reduce(
    (max, entry) => Math.max(max, entry.holesPosted),
    0,
  );
  if (roundComplete(round)) return null;

  return (
    <Link
      href={`/round/${round.id}`}
      className="block rounded-2xl bg-turf-700 p-4 text-white shadow-sm active:bg-turf-800"
    >
      <div className="text-xs font-bold uppercase tracking-wide text-turf-100">
        Resume round
      </div>
      <div className="mt-0.5 truncate text-lg font-black">
        {round.courseName || "Untitled round"}
      </div>
      <div className="text-sm text-turf-100">
        {round.date} · thru {posted} of {round.holeCount}
        {round.gg ? " · Golf Genius" : ""}
      </div>
    </Link>
  );
}

function RoundRow({ round, onDelete }: { round: Round; onDelete: () => void }) {
  const comp = computeRound(round);
  const leader = [...round.players].sort(
    (a, b) => (comp.grandTotals[b.id] ?? 0) - (comp.grandTotals[a.id] ?? 0),
  )[0];
  const posted = Object.values(comp.totalsByPlayer).reduce(
    (max, entry) => Math.max(max, entry.holesPosted),
    0,
  );

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-3">
      {/* The name gets the whole width; the buttons sit under it. */}
      <Link href={`/round/${round.id}`} className="min-w-0 basis-full">
        <div className="truncate font-bold text-neutral-900">
          {round.courseName || "Untitled round"}
        </div>
        <div className="text-xs text-neutral-500">
          {round.date} · {round.players.length} players · thru {posted}
          {leader && (comp.grandTotals[leader.id] ?? 0) !== 0
            ? ` · ${leader.name.split(" ")[0]} ${formatSigned(
                comp.grandTotals[leader.id] ?? 0,
              )}`
            : ""}
        </div>
      </Link>
      {posted > 0 && !roundComplete(round) ? (
        <LinkButton href={`/round/${round.id}`} variant="primary">
          Resume
        </LinkButton>
      ) : (
        <LinkButton href={`/round/${round.id}?tab=bets&edit=1`} variant="secondary">
          Setup
        </LinkButton>
      )}
      <Button
        variant="ghost"
        onClick={() => {
          if (
            typeof window !== "undefined" &&
            window.confirm(`Delete ${round.courseName || "this round"}? This cannot be undone.`)
          ) {
            onDelete();
          }
        }}
      >
        Delete
      </Button>
    </li>
  );
}
