"use client";

import { useEffect, useState } from "react";
import { normalizeGolferId } from "@/lib/ghin/client";
import { loadGolferId, saveGolferId } from "@/lib/storage";
import { Banner, Button, Card, Field, SectionTitle, inputClass } from "./ui";

/**
 * GHIN connection — a golfer number, not a password.
 *
 * The endpoints this app reads (who you follow, your courses, course ratings)
 * are served from the GHIN number alone, with no Authorization header and no
 * cookie. So there is nothing to gain by asking for a password, and a password
 * we do not need is a password we should not be handling.
 */
export function GhinPanel({
  golferId,
  onChange,
}: {
  golferId: string | null;
  onChange: (golferId: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Remember the number between rounds; it is not a secret and it is tedious.
  useEffect(() => {
    const stored = loadGolferId();
    if (stored && !golferId) onChange(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = () => {
    const id = normalizeGolferId(draft);
    if (!id) {
      setError("A GHIN number is 7 digits, give or take. Check the GHIN app.");
      return;
    }
    setError(null);
    saveGolferId(id);
    onChange(id);
    setDraft("");
  };

  if (golferId) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-turf-900">GHIN {golferId}</div>
            <p className="text-sm text-neutral-600">
              You can pull in the golfers you follow and your courses.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              saveGolferId(null);
              onChange(null);
            }}
          >
            Change
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle hint="Optional. It saves typing names and handicap indexes — you can enter players by hand instead.">
        Connect GHIN
      </SectionTitle>

      <div className="space-y-3">
        <Field
          label="Your GHIN number"
          hint="No password needed. GHIN serves this data from the number alone."
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            className={inputClass}
            placeholder="1234567"
            onKeyDown={(event) => {
              if (event.key === "Enter") connect();
            }}
          />
        </Field>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Button onClick={connect} disabled={!draft.trim()}>
          Connect
        </Button>

        <p className="text-xs text-neutral-500">
          GHIN has no public API, so this uses the same endpoints the GHIN site
          uses. It can break without warning, and everything here works without
          it.
        </p>
      </div>
    </Card>
  );
}
