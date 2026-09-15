"use client";

import { useState } from "react";
import {
  ApiError,
  apiFollowing,
  apiGolferProfile,
  apiSearchGolfers,
  type GolferLookup,
} from "@/lib/api";
import { removePlayer } from "@/lib/mutations";
import { loadRoster, newId, saveMe, saveRoster } from "@/lib/storage";
import type { GhinProbe } from "@/lib/ghin/shape";
import type { Player, Round } from "@/lib/types";
import { GhinDiagnostics } from "./GhinDiagnostics";
import { Banner, Button, Card, Field, SectionTitle, Spinner, inputClass } from "./ui";

export function PlayerPicker({
  round,
  update,
  golferId,
  token,
  me,
  onSessionExpired,
}: {
  round: Round;
  update: (next: Round) => void;
  golferId: string | null;
  token: string | null;
  /** The account holder, offered as a one-tap add. */
  me?: Player | null;
  /** Called when a lookup shows the GHIN session has run out. */
  onSessionExpired?: () => void;
}) {
  const [following, setFollowing] = useState<GolferLookup | null>(null);
  const [search, setSearch] = useState<GolferLookup | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"following" | "search" | "me" | null>(null);
  const [foundMe, setFoundMe] = useState<Player | null>(null);
  const [meProbes, setMeProbes] = useState<GhinProbe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [index, setIndex] = useState("");
  const [roster] = useState<Player[]>(() => loadRoster());

  const inRound = new Set(round.players.map((player) => player.id));

  const addPlayer = (player: Player) => {
    if (inRound.has(player.id)) return;
    saveRoster([player]);
    update({ ...round, players: [...round.players, player] });
  };

  const run = async (
    kind: "following" | "search" | "me",
    call: () => Promise<GolferLookup>,
    apply: (result: GolferLookup) => void,
    fallbackMessage: string,
  ) => {
    setBusy(kind);
    setError(null);
    try {
      const result = await call();
      apply(result);
      if (result.players.length > 0) saveRoster(result.players);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : fallbackMessage);
      apply({ players: [], probes: [] });
    } finally {
      setBusy(null);
    }
  };

  const addManual = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // "+1.2" is a plus handicap, which is numerically negative.
    const parsed = Number.parseFloat(index.trim().replace("+", "-"));
    addPlayer({
      id: newId(),
      name: trimmed,
      handicapIndex: Number.isFinite(parsed) ? parsed : null,
      source: "manual",
    });
    setName("");
    setIndex("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          hint={
            round.players.length === 0
              ? "Add the group. Two to six players."
              : `${round.players.length} in the group.`
          }
        >
          Players
        </SectionTitle>

        {round.players.length === 0 ? (
          <Banner>Nobody added yet.</Banner>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {round.players.map((player) => (
              <li key={player.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-neutral-900">
                    {player.name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {player.ghinNumber ? `GHIN ${player.ghinNumber} · ` : ""}
                    {player.handicapIndex === null
                      ? "no index"
                      : `index ${player.handicapIndex.toFixed(1)}`}
                  </div>
                </div>
                <input
                  aria-label={`Handicap index for ${player.name}`}
                  defaultValue={
                    player.handicapIndex === null ? "" : String(player.handicapIndex)
                  }
                  inputMode="decimal"
                  placeholder="idx"
                  onBlur={(event) => {
                    const parsed = Number.parseFloat(
                      event.target.value.trim().replace("+", "-"),
                    );
                    update({
                      ...round,
                      players: round.players.map((existing) =>
                        existing.id === player.id
                          ? {
                              ...existing,
                              handicapIndex: Number.isFinite(parsed) ? parsed : null,
                            }
                          : existing,
                      ),
                    });
                  }}
                  className="tabular w-20 rounded-xl border-0 bg-neutral-100 px-2 py-2 text-right text-base ring-1 ring-inset ring-neutral-200 focus:ring-2 focus:ring-turf-500"
                />
                <Button
                  variant="ghost"
                  onClick={() => update(removePlayer(round, player.id))}
                >
                  Drop
                </Button>
              </li>
            ))}
          </ul>
        )}

        {round.course && round.course.tees.length > 1 && round.players.length > 0 ? (
          <div className="mt-4 border-t border-neutral-100 pt-3">
            <div className="mb-2 text-sm font-semibold text-neutral-700">
              Tees per player
            </div>
            <ul className="space-y-2">
              {round.players.map((player) => (
                <li key={player.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{player.name}</span>
                  <select
                    aria-label={`Tees for ${player.name}`}
                    value={player.teeId ?? round.teeId ?? ""}
                    onChange={(event) =>
                      update({
                        ...round,
                        players: round.players.map((existing) =>
                          existing.id === player.id
                            ? { ...existing, teeId: event.target.value }
                            : existing,
                        ),
                      })
                    }
                    className="w-40 rounded-xl border-0 bg-neutral-100 px-2 py-2 text-sm ring-1 ring-inset ring-neutral-200"
                  >
                    {round.course!.tees.map((tee) => (
                      <option key={tee.id} value={tee.id}>
                        {tee.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Add players</SectionTitle>

        {/*
          The following list is other people by definition, so without this the
          account holder is the one player who has to be typed in every round.
        */}
        {(() => {
          const self = me ?? foundMe;
          if (self) {
            return inRound.has(self.id) ? null : (
              <div className="mb-4 rounded-xl bg-turf-50 p-3 ring-1 ring-inset ring-turf-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-turf-900">
                      {self.name}
                    </div>
                    <div className="text-xs text-turf-800">
                      {self.handicapIndex === null
                        ? "no index"
                        : `index ${self.handicapIndex.toFixed(1)}`}
                      {self.ghinNumber ? ` · GHIN ${self.ghinNumber}` : ""}
                    </div>
                  </div>
                  <Button onClick={() => addPlayer(self)}>Add me</Button>
                </div>
              </div>
            );
          }
          if (!token || !golferId) return null;
          return (
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={busy === "me"}
                  onClick={() =>
                    void run(
                      "me",
                      () => apiGolferProfile(golferId, token),
                      (result) => {
                        const self = result.players[0] ?? null;
                        setFoundMe(self);
                        setMeProbes(self ? null : result.probes);
                        if (self) saveMe(self);
                      },
                      "Could not look you up on GHIN.",
                    )
                  }
                >
                  Find me on GHIN
                </Button>
                {busy === "me" ? <Spinner label="Asking GHIN…" /> : null}
              </div>
              {meProbes ? (
                <GhinDiagnostics
                  probes={meProbes}
                  subject="your own record"
                  onSignInAgain={onSessionExpired}
                />
              ) : null}
            </div>
          );
        })()}

        {token ? (
          <div className="mb-5 space-y-5">
            <div>
              <Field
                label="Find a golfer on GHIN"
                hint="Last name, or a full GHIN number. Pulls their current handicap index."
              >
                <div className="flex gap-2">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className={inputClass}
                    placeholder="Alexander  or  1234567"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && query.trim().length >= 3) {
                        void run(
                          "search",
                          () => apiSearchGolfers(token, query.trim()),
                          setSearch,
                          "Could not search GHIN.",
                        );
                      }
                    }}
                  />
                  <Button
                    onClick={() =>
                      void run(
                        "search",
                        () => apiSearchGolfers(token, query.trim()),
                        setSearch,
                        "Could not search GHIN.",
                      )
                    }
                    disabled={query.trim().length < 3 || busy === "search"}
                  >
                    Find golfer
                  </Button>
                </div>
              </Field>

              {busy === "search" ? (
                <div className="mt-2">
                  <Spinner label="Asking GHIN…" />
                </div>
              ) : null}

              {search && search.players.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {search.players.map((player) => (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      added={inRound.has(player.id)}
                      onAdd={() => addPlayer(player)}
                    />
                  ))}
                </ul>
              ) : null}

              {search && search.players.length === 0 && busy !== "search" ? (
                <GhinDiagnostics
                  probes={search.probes}
                  subject="golfers"
                  onSignInAgain={onSessionExpired}
                />
              ) : null}
            </div>

            <div className="border-t border-neutral-100 pt-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void run(
                      "following",
                      () => apiFollowing(golferId ?? "", token),
                      (result) => {
                        setFollowing(result);
                        /*
                         * Following yourself is a reasonable way to get your
                         * own record in, so if the account holder turns up in
                         * their own list, recognise them rather than leaving
                         * them as one name among many.
                         */
                        const self = golferId
                          ? result.players.find(
                              (player) => player.ghinNumber === golferId,
                            )
                          : undefined;
                        if (self && !me) {
                          setFoundMe(self);
                          saveMe(self);
                        }
                      },
                      "Could not read who you follow on GHIN.",
                    )
                  }
                  disabled={busy === "following" || !golferId}
                >
                  {following === null
                    ? "Import who you follow on GHIN"
                    : "Refresh"}
                </Button>
                {busy === "following" ? <Spinner label="Asking GHIN…" /> : null}
              </div>

              {following && following.players.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {[...following.players]
                    // You first, then everyone else in the order GHIN gave.
                    .sort((a, b) => {
                      const aSelf = a.ghinNumber === golferId ? 0 : 1;
                      const bSelf = b.ghinNumber === golferId ? 0 : 1;
                      return aSelf - bSelf;
                    })
                    .map((player) => (
                      <PlayerRow
                        key={player.id}
                        player={player}
                        added={inRound.has(player.id)}
                        isSelf={!!golferId && player.ghinNumber === golferId}
                        onAdd={() => addPlayer(player)}
                      />
                    ))}
                </ul>
              ) : null}

              {following && following.players.length === 0 && busy !== "following" ? (
                <GhinDiagnostics
                  probes={following.probes}
                  subject="the golfers you follow"
                  onSignInAgain={onSessionExpired}
                />
              ) : null}
            </div>

            {error ? <Banner tone="error">{error}</Banner> : null}
          </div>
        ) : null}

        {roster.filter((player) => !inRound.has(player.id)).length > 0 ? (
          <div className="mb-4">
            <div className="mb-1.5 text-sm font-semibold text-neutral-700">Regulars</div>
            <div className="flex flex-wrap gap-2">
              {roster
                .filter((player) => !inRound.has(player.id))
                .slice(0, 12)
                .map((player) => (
                  <Button
                    key={player.id}
                    variant="secondary"
                    onClick={() => addPlayer(player)}
                  >
                    + {player.name}
                  </Button>
                ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 border-t border-neutral-100 pt-4 sm:grid-cols-[1fr,6rem,auto]">
          <Field label="Or add by hand">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
              placeholder="Playing partner"
              onKeyDown={(event) => {
                if (event.key === "Enter") addManual();
              }}
            />
          </Field>
          <Field label="Index" hint="+1.2 for a plus">
            <input
              value={index}
              onChange={(event) => setIndex(event.target.value)}
              inputMode="decimal"
              className={inputClass}
              placeholder="12.4"
            />
          </Field>
          <div className="flex items-end">
            <Button onClick={addManual} disabled={!name.trim()} full>
              Add
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function PlayerRow({
  player,
  added,
  onAdd,
  isSelf = false,
}: {
  player: Player;
  added: boolean;
  onAdd: () => void;
  /** The account holder, when they turn up in their own following list. */
  isSelf?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        disabled={added}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${
          added
            ? "bg-turf-50"
            : isSelf
              ? "bg-turf-50 ring-1 ring-inset ring-turf-200 active:bg-turf-100"
              : "bg-neutral-50 active:bg-neutral-100"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-neutral-900">
            {player.name}
            {isSelf ? (
              <span className="ml-1.5 rounded bg-turf-200 px-1 text-[0.65rem] font-bold text-turf-900">
                YOU
              </span>
            ) : null}
          </span>
          <span className="block text-xs text-neutral-500">
            {player.handicapIndex === null
              ? "no index"
              : `index ${player.handicapIndex.toFixed(1)}`}
            {player.ghinNumber ? ` · GHIN ${player.ghinNumber}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-turf-700">
          {added ? "Added" : isSelf ? "Add me" : "Add"}
        </span>
      </button>
    </li>
  );
}
