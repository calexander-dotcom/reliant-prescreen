import type { StandingEntry } from "@/lib/bets/onedown";

/**
 * The standing as it is written — one signed number per bet, oldest first,
 * slashes between — with the presses called by hand in bold, so they can be
 * told from the bets the game opened itself.
 */
export function Standing({
  entries,
  empty = "—",
}: {
  entries: StandingEntry[];
  /** What to show when there is no standing yet. */
  empty?: string;
}) {
  if (entries.length === 0) return <>{empty}</>;
  return (
    <>
      {entries.map((entry, index) => {
        const text = entry.margin > 0 ? `+${entry.margin}` : String(entry.margin);
        return (
          <span key={index}>
            {index > 0 ? "/" : ""}
            {entry.pressed ? <strong className="font-extrabold">{text}</strong> : text}
          </span>
        );
      })}
    </>
  );
}
