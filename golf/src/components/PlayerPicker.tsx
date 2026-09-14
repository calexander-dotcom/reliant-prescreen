"use client";

import { useState } from "react";
import { ApiError, apiFavorites } from "@/lib/api";
import { removePlayer } from "@/lib/mutations";
import { loadRoster, newId, saveRoster } from "@/lib/storage";
import type { Player, Round } from "@/lib/types";
import { Banner, Button, Card, Field, SectionTitle, Spinner, inputClass } from "./ui";

export function PlayerPicker({
  round,
  update,
  token,
}: {
  round: Round;
  update: (next: Round) => void;
  token: string | null;
}) {
  const [favorites, setFavorites] = useState<Player[] | null>(null);
  const [busy, setBusy] = useState(false);
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

  const importFavorites = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const players = await apiFavorites(token);
      setFavorites(players);
      if (players.length > 0) saveRoster(players);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not read your GHIN favorites.",
      );
      setFavorites([]);
    } finally {
      setBusy(false);
    }
  };

  const addManual = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const parsed = Number.parseFloat(index.replace("+", "-"));
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
                      event.target.value.replace("+", "-"),
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

        {token ? (
          <div className="mb-4">
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => void importFavorites()} disabled={busy}>
                {favorites === null ? "Import GHIN favorites" : "Refresh favorites"}
              </Button>
              {busy ? <Spinner label="Asking GHIN…" /> : null}
            </div>

            {error ? (
              <div className="mt-2">
                <Banner tone="error">{error}</Banner>
              </div>
            ) : null}

            {favorites !== null && favorites.length === 0 && !busy && !error ? (
              <p className="mt-2 text-sm text-neutral-600">
                GHIN returned no favorites for this account. Add players by hand
                below.
              </p>
            ) : null}

            {favorites && favorites.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {favorites.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    added={inRound.has(player.id)}
                    onAdd={() => addPlayer(player)}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {roster.filter((player) => !inRound.has(player.id)).length > 0 ? (
          <div className="mb-4">
            <div className="mb-1.5 text-sm font-semibold text-neutral-700">
              Regulars
            </div>
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

        <div className="grid gap-2 sm:grid-cols-[1fr,6rem,auto]">
          <Field label="Name">
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
}: {
  player: Player;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        disabled={added}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${
          added ? "bg-turf-50" : "bg-neutral-50 active:bg-neutral-100"
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-neutral-900">
            {player.name}
          </span>
          <span className="block text-xs text-neutral-500">
            {player.handicapIndex === null
              ? "no index"
              : `index ${player.handicapIndex.toFixed(1)}`}
            {player.ghinNumber ? ` · GHIN ${player.ghinNumber}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-turf-700">
          {added ? "Added" : "Add"}
        </span>
      </button>
    </li>
  );
}
