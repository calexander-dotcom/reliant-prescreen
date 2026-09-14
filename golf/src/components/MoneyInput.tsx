"use client";

import { useEffect, useRef, useState } from "react";
import { parseMoney } from "@/lib/money";

/** 2000 -> "20", 2050 -> "20.50", 0 -> "" so the field reads as empty. */
function magnitudeText(cents: number): string {
  const abs = Math.abs(cents);
  if (!abs) return "";
  return abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
}

/**
 * A dollars field that commits whole cents.
 *
 * The field holds the amount and the button holds the sign. That split exists
 * because the iOS decimal keypad has no minus key, and half of every entry
 * here is money lost — so won/lost has to be one reliable tap. Typing a
 * leading "-" flips it too, for anyone on a keyboard.
 */
export function MoneyInput({
  value,
  onChange,
  label,
  showSign = true,
  placeholder = "0.00",
  tone = "neutral",
}: {
  value: number;
  onChange: (cents: number) => void;
  label: string;
  showSign?: boolean;
  placeholder?: string;
  tone?: "neutral" | "signed";
}) {
  const [text, setText] = useState(() => magnitudeText(value));
  const [negative, setNegative] = useState(value < 0);
  const focused = useRef(false);

  // Follow the parent while the user is not mid-keystroke: the balance helper
  // and the banker rule both rewrite these values from outside.
  useEffect(() => {
    if (focused.current) return;
    setText(magnitudeText(value));
    // At zero there is no sign to read, so the chosen direction is kept.
    if (value !== 0) setNegative(value < 0);
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseMoney(raw);
    const magnitude = Math.abs(parsed ?? 0);
    const typedNegative = parsed !== null && parsed < 0;
    const nextNegative = showSign && (typedNegative || negative);

    setNegative(nextNegative);
    setText(magnitudeText(magnitude));
    onChange(nextNegative ? -magnitude : magnitude);
  };

  const flip = () => {
    const next = !negative;
    setNegative(next);
    const magnitude = Math.abs(parseMoney(text) ?? value);
    onChange(next ? -magnitude : magnitude);
  };

  const valueClass =
    tone === "signed" && value > 0
      ? "text-turf-800"
      : tone === "signed" && value < 0
        ? "text-red-700"
        : "text-neutral-900";

  return (
    <div className="flex items-stretch gap-1.5">
      {showSign ? (
        <button
          type="button"
          aria-label={`${label}: switch to ${negative ? "won" : "lost"}`}
          onClick={flip}
          className={`w-11 shrink-0 rounded-xl text-xl font-bold ring-1 ring-inset transition-colors ${
            negative
              ? "bg-red-50 text-red-700 ring-red-200"
              : "bg-turf-50 text-turf-800 ring-turf-200"
          }`}
        >
          {negative ? "−" : "+"}
        </button>
      ) : null}
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-neutral-400">
          $
        </span>
        <input
          aria-label={label}
          value={text}
          inputMode="decimal"
          placeholder={placeholder}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => {
            focused.current = false;
            commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className={`tabular w-full rounded-xl border-0 bg-neutral-100 py-2.5 pl-7 pr-3 text-right text-base font-semibold ring-1 ring-inset ring-neutral-200 focus:ring-2 focus:ring-turf-500 ${valueClass}`}
        />
      </div>
    </div>
  );
}
