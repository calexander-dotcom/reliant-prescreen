"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BetEditor } from "@/components/BetEditor";
import { CoursePicker } from "@/components/CoursePicker";
import { GhinPanel, type GhinConnection } from "@/components/GhinPanel";
import { signInAgain } from "@/lib/ghin/session";
import { defaultSides } from "@/lib/bets/defaults";
import { PlayerPicker } from "@/components/PlayerPicker";
import { Button, Card, Field, LinkButton, SectionTitle } from "@/components/ui";
import { createRound, houseOneDown, newId, saveHouseRules, saveRound, saveToken } from "@/lib/storage";
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
  // Two screens: who is playing and where, then the game.
  const [step, setStep] = useState<"who" | "game">("who");
  const [ghin, setGhin] = useState<GhinConnection>({ token: null, golferId: null, me: null });

  useEffect(() => {
    setRound(createRound());
  }, []);

  // The house game, on the group's remembered terms, appears as soon as there
  // are two players, so the stake and the rest are in view before the round
  // starts. Once, so that choosing "no automatic game" sticks.
  const seeded = useRef(false);
  useEffect(() => {
    if (!round || seeded.current) return;
    if (round.players.length >= 2 && round.bets.length === 0) {
      seeded.current = true;
      setRound({ ...round, bets: [houseOneDown(round.players, newId())] });
    }
  }, [round]);

  // Sides follow the roster while it is still being put together: a player
  // added after the game was set up goes on a side rather than nowhere.
  useEffect(() => {
    if (!round) return;
    const ids = new Set(round.players.map((player) => player.id));
    let changed = false;
    const bets = round.bets.map((bet) => {
      if (bet.kind !== "onedown" && bet.kind !== "nassau") return bet;
      const onSides = new Set([...bet.sides[0].playerIds, ...bet.sides[1].playerIds]);
      const stale =
        round.players.some((player) => !onSides.has(player.id)) ||
        [...onSides].some((id) => !ids.has(id));
      if (!stale) return bet;
      changed = true;
      return { ...bet, sides: defaultSides(round.players) };
    });
    if (changed) setRound({ ...round, bets });
  }, [round]);

  /**
   * A lookup has shown the GHIN session is dead. With the password kept on
   * this phone the app signs in again by itself and the lookups, which watch
   * the token, run again; otherwise the panel offers signing in.
   */
  const sessionExpired = async () => {
    const session = await signInAgain();
    if (session) {
      setGhin((current) => ({
        token: session.token,
        golferId: session.golferId ?? current.golferId,
        me: session.me ?? current.me,
      }));
      return;
    }
    saveToken(null);
    setGhin((current) => ({ ...current, token: null, expired: true }));
  };

  if (!round) return <main className="py-8 text-neutral-500">Loading…</main>;

  // A course first — its pars, stroke index and tees are what the game runs
  // on — then the players. A typed name counts only because the course
  // picker hides it behind a deliberate "start without course data".
  const hasCourse = round.course !== null || round.courseName.trim().length > 0;
  const ready = hasCourse && round.players.length >= 2;

  const start = () => {
    const bets =
      round.bets.length > 0
        ? round.bets
        // One game, since that is how a round is actually played.
        : [houseOneDown(round.players, newId())];
    // What this round starts with is what the next one starts from.
    const oneDown = bets.find((bet) => bet.kind === "onedown");
    if (oneDown && oneDown.kind === "onedown") saveHouseRules(oneDown);
    const next = { ...round, bets, courseName: round.courseName || "Untitled round" };
    saveRound(next);
    router.push(`/round/${next.id}`);
  };

  const goToGame = () => {
    setStep("game");
    window.scrollTo({ top: 0 });
  };
  const goBack = () => {
    setStep("who");
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="space-y-4">
      <header className="flex items-center justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-turf-900">New round</h1>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {step === "who" ? "1 of 2 · Course and players" : "2 of 2 · The game"}
          </p>
        </div>
        {step === "who" ? (
          <LinkButton href="/" variant="ghost">
            Cancel
          </LinkButton>
        ) : (
          <Button variant="ghost" onClick={goBack}>
            Back
          </Button>
        )}
      </header>

      {step === "who" ? (
        <>
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

          <div className="sticky bottom-4 z-10">
            <Button onClick={goToGame} disabled={!ready} full>
              {!hasCourse
                ? "Choose a course to start"
                : round.players.length < 2
                  ? "Add at least two players"
                  : "Next: set up the game"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-bold text-turf-900">
                  {round.courseName || "Untitled round"}
                </div>
                <p className="text-sm text-neutral-600">
                  {round.players.map((player) => player.name.split(" ")[0]).join(", ")} ·{" "}
                  {round.holeCount} holes
                </p>
              </div>
              <Button variant="secondary" onClick={goBack}>
                Change
              </Button>
            </div>
          </Card>

          <Card>
            <SectionTitle hint="One game per round. Skip this and you get $10 one downs. Change it any time.">
              The game
            </SectionTitle>
            <BetEditor round={round} update={setRound} />
          </Card>

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

          <div className="sticky bottom-4 z-10">
            <Button onClick={start} disabled={!ready} full>
              Start round
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
