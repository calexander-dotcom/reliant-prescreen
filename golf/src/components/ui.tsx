"use client";

import Link from "next/link";
import type { ReactNode } from "react";

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
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  full?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
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

export const inputClass =
  "w-full rounded-xl border-0 bg-neutral-100 px-3 py-2.5 text-base text-neutral-900 ring-1 ring-inset ring-neutral-200 placeholder:text-neutral-400 focus:ring-2 focus:ring-turf-500";

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
