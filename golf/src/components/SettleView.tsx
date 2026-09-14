"use client";

import { useState } from "react";
import type { RoundComputation } from "@/lib/bets";
import { formatMoney, formatSigned } from "@/lib/money";
import type { Round } from "@/lib/types";
import { Banner, Button, Card, SectionTitle } from "./ui";

/** Who owes whom, in the fewest payments, plus a summary to paste into a text. */
export function SettleView({
  round,
  comp,
}: {
  round: Round;
  comp: RoundComputation;
}) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  const nameOf = (playerId: string) =>
    round.players.find((player) => player.id === playerId)?.name ?? "—";

  const ranked = [...round.players].sort(
    (a, b) => (comp.grandTotals[b.id] ?? 0) - (comp.grandTotals[a.id] ?? 0),
  );

  const summary = buildSummary(round, comp, nameOf);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  return (
    <div className="space-y-4">
      {comp.unbalancedHoles.length > 0 ? (
        <Banner tone="warn">
          {comp.unbalancedHoles.length === 1
            ? `Hole ${comp.unbalancedHoles[0]} does not net to zero and is not counted.`
            : `Holes ${comp.unbalancedHoles.join(", ")} do not net to zero and are not counted.`}{" "}
          Fix them on the Hole tab before settling.
        </Banner>
      ) : null}

      {comp.residual !== 0 ? (
        <Banner tone="error">
          The books are off by {formatMoney(comp.residual)}. That should not happen
          — check the bet setup before anyone pays.
        </Banner>
      ) : null}

      <Card>
        <SectionTitle hint="Manual holes plus every settled nassau, press and skin.">
          Where everyone stands
        </SectionTitle>
        <ul className="divide-y divide-neutral-100">
          {ranked.map((player) => {
            const total = comp.grandTotals[player.id] ?? 0;
            return (
              <li key={player.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-neutral-900">
                    {player.name}
                  </div>
                  <div className="tabular text-xs text-neutral-500">
                    holes {formatSigned(comp.manualTotals[player.id] ?? 0)} · bets{" "}
                    {formatSigned(comp.betTotals[player.id] ?? 0)}
                  </div>
                </div>
                <span
                  className={`tabular text-xl font-bold ${
                    total > 0
                      ? "text-turf-700"
                      : total < 0
                        ? "text-red-700"
                        : "text-neutral-400"
                  }`}
                >
                  {formatSigned(total)}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <SectionTitle hint="The fewest payments that clear every balance.">
          Settle up
        </SectionTitle>
        {comp.transfers.length === 0 ? (
          <Banner tone="good">Nobody owes anybody. All square.</Banner>
        ) : (
          <ul className="space-y-2">
            {comp.transfers.map((transfer, index) => (
              <li
                key={`${transfer.fromId}-${transfer.toId}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2.5"
              >
                <span className="min-w-0 text-sm">
                  <strong className="font-semibold text-neutral-900">
                    {nameOf(transfer.fromId)}
                  </strong>
                  <span className="text-neutral-500"> pays </span>
                  <strong className="font-semibold text-neutral-900">
                    {nameOf(transfer.toId)}
                  </strong>
                </span>
                <span className="tabular shrink-0 text-base font-bold text-turf-800">
                  {formatMoney(transfer.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>Share it</SectionTitle>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800">
          {summary}
        </pre>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={copy}>Copy summary</Button>
          {copied === "ok" ? (
            <span className="text-sm text-turf-700">Copied.</span>
          ) : copied === "fail" ? (
            <span className="text-sm text-neutral-600">
              Copy blocked — select the text above instead.
            </span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function buildSummary(
  round: Round,
  comp: RoundComputation,
  nameOf: (playerId: string) => string,
): string {
  const lines: string[] = [];
  lines.push(`${round.courseName || "Round"} — ${round.date}`);

  const ranked = [...round.players].sort(
    (a, b) => (comp.grandTotals[b.id] ?? 0) - (comp.grandTotals[a.id] ?? 0),
  );

  lines.push("");
  for (const player of ranked) {
    const gross = comp.totalsByPlayer[player.id];
    const score = gross?.holesPosted ? ` (${gross.gross} gross)` : "";
    lines.push(
      `${player.name}${score}: ${formatSigned(comp.grandTotals[player.id] ?? 0)}`,
    );
  }

  if (comp.transfers.length > 0) {
    lines.push("");
    lines.push("Settle up:");
    for (const transfer of comp.transfers) {
      lines.push(
        `  ${nameOf(transfer.fromId)} pays ${nameOf(transfer.toId)} ${formatMoney(
          transfer.amount,
        )}`,
      );
    }
  }

  if (comp.unbalancedHoles.length > 0) {
    lines.push("");
    lines.push(
      `Not counted (does not net to zero): hole ${comp.unbalancedHoles.join(", ")}`,
    );
  }

  return lines.join("\n");
}
