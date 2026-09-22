"use client";

import { useState } from "react";
import { normaliseStartHole, playOrder, startsOnFirst } from "@/lib/holes";
import { setStartHole } from "@/lib/mutations";
import type { Round } from "@/lib/types";
import { Button, Field } from "./ui";

/**
 * Which hole the group tees off on.
 *
 * A shotgun start sends groups out all over the course, and the match is still
 * a front nine and a back nine: the first nine holes played and the second.
 * Off the 7th that makes the front 7 through 15 and the back 16 onwards, the
 * aggregate holes 7, 9, 11, 13, 15, and the second tee flip the 16th.
 */

/** What choosing this hole does to the round, in one line. */
export function startHoleHint(round: Round, startHole: number): string {
  if (startsOnFirst(startHole, round.holeCount)) return "Straight off the 1st.";
  const order = playOrder(startHole, round.holeCount);
  if (round.holeCount <= 9) return `Nine holes, ${order[0]} round to ${order[order.length - 1]}.`;
  return `Front nine ${order[0]} to ${order[8]}, back nine from ${order[9]}. Aggregate holes and the tee flips follow the order you play.`;
}

/** The grid of hole numbers. Used on its own and inside the opening question. */
export function StartHoleGrid({
  round,
  update,
}: {
  round: Round;
  update: (next: Round) => void;
}) {
  const start = normaliseStartHole(round.startHole, round.holeCount);
  return (
    <div role="group" aria-label="Starting hole" className="flex flex-wrap gap-1.5">
      {Array.from({ length: round.holeCount }, (_, index) => index + 1).map((hole) => (
        <Button
          key={hole}
          variant={start === hole ? "primary" : "secondary"}
          onClick={() => update(setStartHole(round, hole))}
        >
          {hole}
        </Button>
      ))}
    </div>
  );
}

/**
 * The picker as a labelled field. On the new-round screen it stays folded away
 * until asked for, since nearly every round is off the 1st; in a round that is
 * already going it is open, because you only look for it to change something.
 */
export function StartHolePicker({
  round,
  update,
  collapsible = false,
}: {
  round: Round;
  update: (next: Round) => void;
  /** Hide behind a link until tapped. */
  collapsible?: boolean;
}) {
  const start = normaliseStartHole(round.startHole, round.holeCount);
  const [open, setOpen] = useState(!collapsible || start !== 1);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-turf-700 underline-offset-2 hover:underline"
      >
        Shotgun start? Choose the hole you tee off on
      </button>
    );
  }

  return (
    <Field label="Starting hole" hint={startHoleHint(round, start)}>
      <StartHoleGrid round={round} update={update} />
    </Field>
  );
}
