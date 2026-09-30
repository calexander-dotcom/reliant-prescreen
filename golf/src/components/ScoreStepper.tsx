"use client";

/**
 * Score entry as a stepper rather than a keyboard field.
 *
 * Scores move one shot at a time and the keyboard covers half the screen, so
 * plus and minus buttons beat typing when you are standing on the next tee.
 *
 * `value` is the score to show — the number typed here if there is one, else the
 * one Golf Genius fed for the hole, so the box is never blank when a score is
 * actually in. `tone` says which it is: a fed score reads green (not yet your
 * own), a clash with the feed reads red. Plus/minus commit a number as your own;
 * clearing a typed number falls back to the fed one.
 */
export function ScoreStepper({
  value,
  par,
  onChange,
  label,
  tone = "manual",
}: {
  value: number | null;
  par: number;
  onChange: (value: number | null) => void;
  label: string;
  tone?: "manual" | "gg" | "mismatch";
}) {
  const step = (delta: number) => {
    // First tap starts from par, which is one tap from most scores.
    const base = value ?? par;
    const next = value === null ? base : base + delta;
    onChange(Math.max(1, Math.min(20, next)));
  };

  const centerClass =
    value === null
      ? "bg-white text-neutral-400 ring-neutral-200"
      : tone === "gg"
        ? "bg-turf-50 text-turf-700 ring-turf-300"
        : tone === "mismatch"
          ? "bg-red-50 text-red-700 ring-red-300"
          : "bg-white text-neutral-900 ring-turf-300";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`One fewer stroke for ${label}`}
        onClick={() => step(-1)}
        className="h-11 w-11 shrink-0 rounded-xl bg-neutral-100 text-2xl font-bold text-neutral-700 ring-1 ring-inset ring-neutral-200 active:bg-neutral-200"
      >
        &minus;
      </button>
      <button
        type="button"
        aria-label={`Score for ${label}`}
        onClick={() => (value === null ? onChange(par) : onChange(null))}
        className={`tabular relative h-11 w-14 rounded-xl text-xl font-bold ring-1 ring-inset ${centerClass}`}
      >
        {value ?? "–"}
        {value !== null && tone === "gg" ? (
          <span className="absolute right-1 top-0.5 text-[0.5rem] font-bold uppercase text-turf-500">
            gg
          </span>
        ) : null}
      </button>
      <button
        type="button"
        aria-label={`One more stroke for ${label}`}
        onClick={() => step(1)}
        className="h-11 w-11 shrink-0 rounded-xl bg-neutral-100 text-2xl font-bold text-neutral-700 ring-1 ring-inset ring-neutral-200 active:bg-neutral-200"
      >
        +
      </button>
    </div>
  );
}
