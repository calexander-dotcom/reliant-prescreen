"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { loadPanelOpen, savePanelOpen } from "@/lib/storage";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-turf-700 text-white active:bg-turf-800 disabled:bg-turf-700/40",
  secondary:
    "bg-white text-turf-900 ring-1 ring-inset ring-turf-200 active:bg-turf-50 disabled:text-turf-900/40",
  ghost: "text-turf-800 active:bg-turf-50 disabled:text-turf-800/40",
  danger: "bg-red-600 text-white active:bg-red-700 disabled:bg-red-600/40",
};

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
  full,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  full?: boolean;
  /** Distinct accessible name, for when the visible label has to stay short. */
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      // min-h-11 keeps every tap target thumb-sized for one-handed use.
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors ${
        VARIANTS[variant]
      } ${full ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  full,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  full?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors ${
        VARIANTS[variant]
      } ${full ? "w-full" : ""}`}
    >
      {children}
    </Link>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-base font-bold text-turf-900">{children}</h2>
      {hint ? <p className="mt-0.5 text-sm text-neutral-600">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-neutral-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

/** The look of a text field, without a width, for a box that has its own. */
export const inputBaseClass =
  "rounded-xl border-0 bg-neutral-100 px-3 py-2.5 text-base text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-turf-500";

/**
 * A full-width text field. A `w-*` added after this does not win — Tailwind
 * orders its width utilities, not the class list — so a narrow field uses
 * inputBaseClass instead.
 */
export const inputClass = `w-full ${inputBaseClass}`;

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "good";
  children: ReactNode;
}) {
  const tones = {
    info: "bg-neutral-100 text-neutral-800 ring-neutral-200",
    warn: "bg-amber-50 text-amber-900 ring-amber-200",
    error: "bg-red-50 text-red-900 ring-red-200",
    good: "bg-turf-50 text-turf-900 ring-turf-200",
  } as const;
  return (
    <div className={`rounded-xl px-3 py-2 text-sm ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-neutral-600">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-turf-300 border-t-turf-700" />
      {label}
    </span>
  );
}

/**
 * A card that can be folded away, remembering the choice.
 *
 * Built for the hole screen, where a group playing banker on money alone has
 * no use for the score steppers and a group only keeping score has no use for
 * the money grid. Collapsed it still shows a one-line summary, so folding a
 * section away does not mean losing sight of it.
 */
export function CollapsibleCard({
  title,
  hint,
  summary,
  storageKey,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: ReactNode;
  /** Shown in place of the contents when folded away. */
  summary?: ReactNode;
  /** Where the open/closed choice is remembered. */
  storageKey: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  // Starts at the default and picks up the stored choice after mount, so the
  // server and the first client render agree.
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(loadPanelOpen(storageKey, defaultOpen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    savePanelOpen(storageKey, next);
  };

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-base font-bold text-turf-900">{title}</span>
          {open && hint ? (
            <span className="mt-0.5 block text-sm text-neutral-600">{hint}</span>
          ) : null}
          {!open && summary ? (
            <span className="mt-0.5 block text-sm text-neutral-600">{summary}</span>
          ) : null}
        </span>
        <span className="shrink-0 pt-0.5 text-sm font-semibold text-turf-700">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      <div hidden={!open} className="mt-3">
        {children}
      </div>
    </section>
  );
}
