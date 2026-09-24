"use client";

import { useMemo, useState } from "react";
import type { Round } from "@/lib/types";
import { applyGgScores, matchPlayers, parsePastedScores } from "@/lib/gg/import";
import { Banner, Button, Card, SectionTitle } from "./ui";

/**
 * Pull the group's scores in from Golf Genius, so nobody types them twice.
 *
 * For now this takes a paste: copy your foursome's scores out of Golf Genius
 * and drop them in. It shows who it matched and how many holes it read before
 * anything is written, and it never blanks a score already entered. A live
 * reader that signs in with the Foursome GGID would plug in here the same way.
 */
export function GgImport({
  round,
  update,
}: {
  round: Round;
  update: (next: Round) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    const foursome = parsePastedScores(text, round.holeCount);
    const match = matchPlayers(foursome, round.players);
    const nameFor = (id: string) =>
      round.players.find((p) => p.id === id)?.name ?? id;
    const rows = foursome.players.map((gp) => ({
      name: gp.name,
      scored: gp.holes.filter((h) => h.strokes !== null).length,
      matchedTo: match.mapping[gp.name] ? nameFor(match.mapping[gp.name]) : null,
    }));
    return { foursome, match, rows };
  }, [text, round.holeCount, round.players]);

  const apply = () => {
    if (!preview) return;
    const { round: next, applied } = applyGgScores(round, preview.foursome, preview.match.mapping);
    update(next);
    setDone(`Brought in ${applied} hole score${applied === 1 ? "" : "s"}.`);
    setText("");
    setOpen(false);
  };

  if (!open) {
    return (
      <Card>
        <SectionTitle hint="Copy your group's scores out of Golf Genius and paste them here. It matches players by name and fills the card, without touching scores you have already entered. Golf Genius holes are lined up to this round's order, so a shotgun start lands right.">
          Scores from Golf Genius
        </SectionTitle>
        {done ? <Banner tone="good">{done}</Banner> : null}
        <Button variant="secondary" onClick={() => { setDone(null); setOpen(true); }}>
          Paste scores from Golf Genius
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle hint="One player per line: their name, then their hole scores left to right. Blanks and dashes are holes not played.">
        Paste from Golf Genius
      </SectionTitle>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"Chris 4 5 3 4 4 5 4 3 4 ...\nDale  5 4 4 5 4 6 4 4 5 ..."}
        className="w-full rounded-xl border border-neutral-300 p-2 font-mono text-sm"
      />
      {preview ? (
        <div className="mt-3 space-y-1 text-sm">
          {preview.rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-2">
              <span className={r.matchedTo ? "text-neutral-800" : "text-amber-700"}>
                {r.name}
                {r.matchedTo && r.matchedTo !== r.name ? ` → ${r.matchedTo}` : ""}
                {r.matchedTo ? "" : " (no match)"}
              </span>
              <span className="tabular text-neutral-500">{r.scored} holes</span>
            </div>
          ))}
          {preview.match.unmatchedGg.length > 0 ? (
            <Banner tone="warn">
              A name did not match a player, so its scores will be skipped. Fix the
              spelling in the paste, or rename the player on the Bets tab.
            </Banner>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          onClick={apply}
          disabled={!preview || Object.keys(preview.match.mapping).length === 0}
        >
          Bring in the scores
        </Button>
        <Button variant="ghost" onClick={() => { setText(""); setOpen(false); }}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
