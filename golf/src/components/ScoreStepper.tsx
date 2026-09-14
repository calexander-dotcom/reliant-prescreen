"use client";

/**
 * Score entry as a stepper rather than a keyboard field.
 *
 * Scores move one shot at a time and the keyboard covers half the screen, so
 * plus and minus buttons beat typing when you are standing on the next tee.
 */
export function ScoreStepper({
  value,
  par,
  onChange,
  label,
}: {
  value: number | null;
  par: number;
  onChange: (value: number | null) => void;
  label: string;
}) {
  const step = (delta: number) => {
    // First tap starts from par, which is one tap from most scores.
    const base = value ?? par;
    const next = value === null ? base : base + delta;
    onChange(Math.max(1, Math.min(20, next)));
  };

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
        aria-label={`Clear the score for ${label}`}
        onClick={() => (value === null ? onChange(par) : onChange(null))}
        className={`tabular h-11 w-14 rounded-xl text-xl font-bold ring-1 ring-inset ${
          value === null
            ? "bg-white text-neutral-400 ring-neutral-200"
            : "bg-white text-neutral-900 ring-turf-300"
        }`}
      >
        {value ?? "–"}
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
