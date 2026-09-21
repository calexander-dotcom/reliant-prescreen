"use client";

import { teeFlipSide } from "@/lib/bets/onedown";
import { setTeeFlipWinner } from "@/lib/mutations";
import type { OneDownConfig, Round } from "@/lib/types";
import { Button } from "./ui";

/**
 * Who won the flip on the 1st tee. The winners start one up in the opening
 * bet, which opens the first press by the 1-down rule: +1/0 before a ball is
 * hit. Tap the side that won; tap it again, or "No flip", to clear it.
 */
export function TeeFlipChooser({
  round,
  config,
  update,
}: {
  round: Round;
  /** The bet with its sides labelled, as the round computation hands it out. */
  config: OneDownConfig;
  update: (next: Round) => void;
}) {
  const won = teeFlipSide(config);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-neutral-600">Tee flip</span>
        <span className={`text-xs ${won === null ? "text-neutral-400" : "text-turf-800"}`}>
          {won === null ? "not flipped" : `${config.sides[won].name} start 1 up`}
        </span>
      </div>
      <div role="group" aria-label="Who won the tee flip" className="mt-1.5 flex flex-wrap gap-2">
        {config.sides.map((side, index) => (
          <Button
            key={side.id}
            variant={won === index ? "primary" : "secondary"}
            onClick={() =>
              update(
                setTeeFlipWinner(
                  round,
                  config.id,
                  won === index ? null : (side.playerIds[0] ?? null),
                ),
              )
            }
          >
            {side.name}
          </Button>
        ))}
        <Button
          variant="ghost"
          disabled={won === null}
          onClick={() => update(setTeeFlipWinner(round, config.id, null))}
        >
          No flip
        </Button>
      </div>
    </div>
  );
}
