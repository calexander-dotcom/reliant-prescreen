"use client";

import { useState } from "react";
import { ApiError, apiCreateShare, apiStopShare } from "@/lib/api";
import { publishableRound } from "@/lib/share/payload";
import type { PublishStatus } from "@/lib/share/usePublisher";
import type { Round } from "@/lib/types";
import { Banner, Button, Card, SectionTitle, Spinner } from "./ui";

/**
 * Share a round read-only.
 *
 * The link carries only the share id. The token that permits publishing stays
 * on this device, so everyone who opens the link can watch and nobody can
 * change anything. The publishing itself runs above the tabs (see
 * useSharePublisher), so scores sent from the Hole tab reach followers even
 * though this card lives on the Card tab; here we start and stop sharing and
 * show that publisher's status.
 */
export function ShareCard({
  round,
  update,
  status,
}: {
  round: Round;
  update: (next: Round) => void;
  /** Live status from the page-level publisher. */
  status?: PublishStatus;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const share = round.share ?? null;

  const link =
    share && typeof window !== "undefined"
      ? `${window.location.origin}/watch/${share.id}`
      : "";

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await apiCreateShare(publishableRound(round));
      update({ ...round, share: created });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not start sharing.",
      );
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!share) return;
    setBusy(true);
    try {
      await apiStopShare(share.id, share.token);
    } catch {
      // The link stops working either way once it is off this round.
    } finally {
      update({ ...round, share: null });
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!share) {
    return (
      <Card>
        <SectionTitle hint="Anyone with the link can follow the scores and the money. Nobody can change anything.">
          Let others follow along
        </SectionTitle>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={() => void start()} disabled={busy}>
            {busy ? "Starting…" : "Create a view-only link"}
          </Button>
          {busy ? <Spinner /> : null}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          This copies the round to the server so other phones can read it. It is
          deleted a week after the last update. Treat the link as the password —
          anyone who has it can watch.
        </p>
      </Card>
    );
  }

  const state = status?.state ?? "idle";

  return (
    <Card>
      <SectionTitle hint="View only. They see each hole a few seconds after you enter it, from any tab.">
        Others are following
      </SectionTitle>

      <div className="rounded-xl bg-neutral-50 p-3">
        <div className="break-all font-mono text-xs text-neutral-800">{link}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</Button>
        <Button variant="ghost" onClick={() => void stop()} disabled={busy}>
          Stop sharing
        </Button>
      </div>

      <div className="mt-2 text-xs">
        {state === "publishing" ? (
          <span className="text-neutral-500">Sending the latest…</span>
        ) : state === "failed" ? (
          <span className="text-red-700">
            {status?.error} Changes here are still saved.
          </span>
        ) : status?.publishedAt ? (
          <span className="text-turf-700">Up to date as of {status.publishedAt}</span>
        ) : (
          <span className="text-neutral-500">Watching for the next change…</span>
        )}
      </div>
    </Card>
  );
}
