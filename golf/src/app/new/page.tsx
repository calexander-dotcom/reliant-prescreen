"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BetEditor } from "@/components/BetEditor";
import { CoursePicker } from "@/components/CoursePicker";
import { GhinPanel, type GhinConnection } from "@/components/GhinPanel";
import { PlayerPicker } from "@/components/PlayerPicker";
import { Banner, Button, Card, Field, LinkButton, SectionTitle } from "@/components/ui";
import { defaultOneDown, defaultSkins } from "@/lib/bets/defaults";
import { createRound, newId, saveRound, saveToken } from "@/lib/storage";
import type { HandicapMode, Round } from "@/lib/types";

const HANDICAP_LABELS: Record<HandicapMode, { label: string; hint: string }> = {
  "off-low": {
    label: "Strokes off the low",
    hint: "The low handicap plays scratch, everyone else gets the difference. The usual money game.",
  },
  full: {
    label: "Full handicap",
    hint: "Everyone plays their own full course handicap.",
  },
  none: { label: "Gross only", hint: "No strokes given." },
};

export default function NewRoundPage() {
  const router = useRouter();
  const [round, setRound] = useState<Round | null>(null);
  const [ghin, setGhin] = useState<GhinConnection>({ token: null, golferId: null, me: null });

  useEffect(() => {
    setRound(createRound());
  }, []);

  /**
   * Drop a GHIN session the lookups have shown to be dead, so the panel offers
   * signing in again rather than repeating a call that cannot work.
   */
  const sessionExpired = () => {
    saveToken(null);
    setGhin((current) => ({ ...current, token: null }));
  };

  if (!round) return <main className="py-8 text-neutral-500">Loading…</main>;

  const ready = round.players.length >= 2;

  const start = () => {
    const bets =
      round.bets.length > 0
        ? round.bets
        : [defaultOneDown(round.players, newId()), defaultSkins(round.players, newId())];
    const next = { ...round, bets, courseName: round.courseName || "Untitled round" };
    saveRound(next);
    router.push(`/round/${next.id}`);
  };

  return (
    <main className="space-y-4">
      <header className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-2xl font-black tracking-tight text-turf-900">New round</h1>
        <LinkButton href="/" variant="ghost">
          Cancel
        </LinkButton>
      </header>

      <GhinPanel connection={ghin} onChange={setGhin} />

      <CoursePicker
        round={round}
        update={setRound}
        golferId={ghin.golferId}
        token={ghin.token}
        onSessionExpired={sessionExpired}
      />

      <PlayerPicker
        round={round}
        update={setRound}
        golferId={ghin.golferId}
        token={ghin.token}
        me={ghin.me}
        onSessionExpired={sessionExpired}
      />

      <Card>
        <SectionTitle>Handicaps</SectionTitle>
        <Field label="How strokes are given">
          <div className="space-y-2">
            {(Object.keys(HANDICAP_LABELS) as HandicapMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRound({ ...round, handicapMode: mode })}
                className={`block w-full rounded-xl px-3 py-2.5 text-left ring-1 ring-inset ${
                  round.handicapMode === mode
                    ? "bg-turf-50 ring-turf-300"
                    : "bg-neutral-50 ring-neutral-200"
                }`}
              >
                <span className="block font-semibold text-neutral-900">
                  {HANDICAP_LABELS[mode].label}
                </span>
                <span className="block text-xs text-neutral-600">
                  {HANDICAP_LABELS[mode].hint}
                </span>
              </button>
            ))}
          </div>
        </Field>
        <div className="mt-3">
          <Field label="Date">
            <input
              type="date"
              value={round.date}
              onChange={(event) => setRound({ ...round, date: event.target.value })}
              className="w-full rounded-xl border-0 bg-neutral-100 px-3 py-2.5 text-base ring-1 ring-inset ring-neutral-200"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle hint="Skip this and you get $10 one downs plus $5 skins. Change it any time.">
          Bets
        </SectionTitle>
        {round.players.length < 2 ? (
          <Banner>Add at least two players first.</Banner>
        ) : (
          <BetEditor round={round} update={setRound} />
        )}
      </Card>

      <div className="sticky bottom-4 z-10">
        <Button onClick={start} disabled={!ready} full>
          {ready ? "Start round" : "Add at least two players"}
        </Button>
      </div>
    </main>
  );
}
