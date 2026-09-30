"use client";

import { useState } from "react";
import { apiGgResolve } from "@/lib/api";
import type { Round } from "@/lib/types";
import { Banner, Button, Card, Field, SectionTitle, inputClass } from "./ui";

/**
 * Start a round from a Golf Genius foursome.
 *
 * The club scores in Golf Genius, and a foursome gets a fresh GGID each round.
 * Type it here and the app pulls the four players, their handicaps and the
 * course straight in, so all that is left to set is partners and the bet. During
 * play the scores flow in on their own and cross-check whatever gets entered by
 * hand. Reading only — nothing is ever written back to Golf Genius.
 */
export function GgRoundSetup({
  round,
  update,
}: {
  round: Round;
  update: (next: Round) => void;
}) {
  const [ggid, setGgid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loaded = round.gg ?? null;

  const load = async () => {
    const id = ggid.trim();
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiGgResolve(id);
      const f = result.foursome;
      if (!f.players.length) {
        setError("That GGID resolved, but the foursome had no players yet.");
        return;
      }
      update({
        ...round,
        courseName: f.course?.name ?? round.courseName,
        course: f.course ?? round.course,
        teeId: f.teeId ?? round.teeId,
        players: f.players,
        gg: {
          ggid: f.ggid ?? id,
          eventId: result.eventId,
          roundId: result.roundId,
          eventName: result.eventName,
          scores: f.scores,
          updatedAt: new Date().toISOString(),
        },
      });
      setGgid("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reach Golf Genius. Check the GGID and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    // Leave the players and course in place — only drop the live tie-in, so a
    // mistyped GGID does not wipe a roster the group can still play off by hand.
    const { gg: _gg, ...rest } = round;
    update({ ...rest, gg: null });
  };

  if (loaded) {
    return (
      <Card>
        <SectionTitle hint="Scores from this foursome flow in during play and cross-check anything entered by hand.">
          Golf Genius foursome
        </SectionTitle>
        <Banner tone="good">
          Loaded {loaded.eventName ? `“${loaded.eventName}” — ` : ""}
          {round.players.length} player{round.players.length === 1 ? "" : "s"}
          {round.courseName ? ` at ${round.courseName}` : ""}.
        </Banner>
        <ul className="mt-3 divide-y divide-neutral-100">
          {round.players.map((player) => (
            <li key={player.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate font-semibold text-neutral-900">
                {player.name}
              </span>
              <span className="tabular shrink-0 text-sm text-neutral-500">
                {formatIndex(player.handicapIndex)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="tabular text-xs text-neutral-400">GGID {loaded.ggid}</span>
          <Button variant="ghost" onClick={clear}>
            Use a different GGID
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle hint="Your foursome's GGID for today's round — you get a new one each time you play. It fills in the four players, their handicaps and the course.">
        Start from Golf Genius
      </SectionTitle>
      <Field label="Foursome GGID">
        <div className="flex gap-2">
          <input
            value={ggid}
            onChange={(event) => setGgid(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
            placeholder="e.g. udvx5u"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={inputClass}
            aria-label="Foursome GGID"
          />
          <Button variant="primary" onClick={load} disabled={busy || !ggid.trim()}>
            {busy ? "Loading…" : "Load"}
          </Button>
        </div>
      </Field>
      {error ? <Banner tone="warn">{error}</Banner> : null}
      <p className="mt-2 text-xs text-neutral-500">
        Optional. You can still set up the round by hand below.
      </p>
    </Card>
  );
}

/** Golf Genius keeps a plus handicap as a negative index; show it the plus way. */
function formatIndex(index: number | null): string {
  if (index === null) return "no index";
  if (index < 0) return `+${(-index).toFixed(1)}`;
  return index.toFixed(1);
}
