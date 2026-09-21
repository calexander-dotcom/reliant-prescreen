"use client";

import { teeFlipSide, teeFlipWinner, teeName } from "@/lib/bets/onedown";
import { setTeeFlipWinner } from "@/lib/mutations";
import type { OneDownConfig, Round } from "@/lib/types";
import { Button } from "./ui";

export { teeName };

/**
 * Who won the flip on a tee. The winners start one up in the opening bet of
 * that nine, which opens the first press by the 1-down rule: +1/0 before a
 * ball is hit. Tap the side that won; tap it again to take the answer back,
 * or "No flip" if there was none on this tee.
 */
export function TeeFlipChooser({
  round,
  config,
  startHole,
  update,
  label,
}: {
  round: Round;
  /** The bet with its sides labelled, as the round computation hands it out. */
  config: OneDownConfig;
  /** The first hole of the nine the flip is for: 1 or 10. */
  startHole: number;
  update: (next: Round) => void;
  /** A heading above the buttons, with the standing answer beside it. */
  label?: string;
}) {
  const answer = teeFlipWinner(config, startHole);
  const answered = answer !== undefined;
  const won = teeFlipSide(config, startHole);
  const set = (winnerId: string | null | undefined) =>
    update(setTeeFlipWinner(round, config.id, startHole, winnerId));

  return (
    <div>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-neutral-600">{label}</span>
          <span className={`text-xs ${won === null ? "text-neutral-400" : "text-turf-800"}`}>
            {won !== null
              ? `${config.sides[won].name} start 1 up`
              : answered
                ? "no flip"
                : "not answered"}
          </span>
        </div>
      ) : null}
      <div
        role="group"
        aria-label={`Tee flip on hole ${startHole}`}
        className={`flex flex-wrap gap-2 ${label ? "mt-1.5" : ""}`}
      >
        {config.sides.map((side, index) => (
          <Button
            key={side.id}
            variant={won === index ? "primary" : "secondary"}
            onClick={() => set(won === index ? undefined : (side.playerIds[0] ?? null))}
          >
            {side.name}
          </Button>
        ))}
        <Button
          variant={answered && won === null ? "primary" : "ghost"}
          onClick={() => set(answered && won === null ? undefined : null)}
        >
          No flip
        </Button>
      </div>
    </div>
  );
}
