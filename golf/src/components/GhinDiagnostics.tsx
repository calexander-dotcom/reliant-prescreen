"use client";

import { useState } from "react";
import { formatProbes, type GhinProbe } from "@/lib/ghin/shape";
import { Banner, Button } from "./ui";

/**
 * Shown when a GHIN import returns nothing.
 *
 * GHIN is undocumented, so "nothing came back" has several causes that look
 * identical from the outside: every candidate path 404'd, the network refused
 * the call, or a path answered fine and the field names were not the ones the
 * parser expected. This prints exactly which happened, in a form that is safe
 * to paste to someone who can fix it — endpoint, status, and the key names of
 * the response, never the values.
 */
export function GhinDiagnostics({
  probes,
  subject,
}: {
  probes: GhinProbe[];
  subject: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (probes.length === 0) return null;

  const answered = probes.filter((probe) => probe.ok);
  const text = formatProbes(probes);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setOpen(true);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <Banner tone={answered.length === 0 ? "error" : "warn"}>
        {answered.length === 0 ? (
          <>
            Every endpoint GHIN was asked for {subject} refused the request. This
            is a connection or permissions problem, not an empty list.
          </>
        ) : (
          <>
            GHIN answered, but no {subject} could be read out of the response.
            Either the account has none saved, or the field names have changed.
          </>
        )}
      </Banner>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          ariaLabel={`${open ? "Hide" : "Show"} what GHIN returned for ${subject}`}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide details" : "What GHIN returned"}
        </Button>
        <Button
          variant="ghost"
          ariaLabel={`Copy what GHIN returned for ${subject}`}
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy details"}
        </Button>
      </div>

      {open ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-neutral-900 p-3 text-[0.7rem] leading-relaxed text-neutral-100">
          {text}
        </pre>
      ) : null}

      <p className="text-xs text-neutral-500">
        Endpoints and field names only — no names, GHIN numbers or handicaps are
        included, so this is safe to share.
      </p>
    </div>
  );
}
