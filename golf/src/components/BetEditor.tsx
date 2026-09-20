"use client";

import { labelledSides, sideLabel } from "@/lib/bets/sides";
import {
  defaultBanker,
  defaultNassau,
  defaultOneDown,
  defaultSkins,
} from "@/lib/bets/defaults";
import { newId } from "@/lib/storage";
import type {
  BankerConfig,
  BetConfig,
  NassauConfig,
  OneDownConfig,
  Player,
  Round,
  SkinsConfig,
  Side,
} from "@/lib/types";
import { MoneyInput } from "./MoneyInput";
import { Button, Card, Field, inputClass } from "./ui";

/** The games, in the order they are offered. */
const GAMES = [
  { kind: "onedown", label: "One downs" },
  { kind: "banker", label: "Banker" },
  { kind: "nassau", label: "Nassau" },
  { kind: "skins", label: "Skins" },
] as const;

type GameKind = (typeof GAMES)[number]["kind"];

const BUILDERS = {
  onedown: defaultOneDown,
  banker: defaultBanker,
  nassau: defaultNassau,
  skins: defaultSkins,
} as const;

export function BetEditor({
  round,
  update,
}: {
  round: Round;
  update: (next: Round) => void;
}) {
  const setBets = (bets: BetConfig[]) => update({ ...round, bets });

  const replace = (bet: BetConfig) =>
    setBets(round.bets.map((existing) => (existing.id === bet.id ? bet : existing)));

  /**
   * One game at a time.
   *
   * A group plays banker, or one downs, or a nassau — not several at once —
   * and the settings for games nobody is playing are just noise on a phone.
   * So choosing a game replaces whatever was set rather than adding to it.
   */
  const chosen: GameKind | null = (round.bets[0]?.kind as GameKind) ?? null;

  const choose = (kind: GameKind | null) => {
    if (kind === null) {
      setBets([]);
      return;
    }
    // Already the only game running: leave its settings alone.
    if (kind === chosen && round.bets.length === 1) return;
    setBets([BUILDERS[kind](round.players, newId())]);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-sm font-semibold text-neutral-700">
          Game for this round
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GAMES.map((game) => (
            <Button
              key={game.kind}
              variant={chosen === game.kind ? "primary" : "secondary"}
              onClick={() => choose(game.kind)}
            >
              {game.label}
            </Button>
          ))}
        </div>
        <div className="mt-2">
          <Button
            variant={chosen === null ? "primary" : "ghost"}
            onClick={() => choose(null)}
            full
          >
            No automatic game
          </Button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          One game at a time. Whichever you pick, money can still be entered by
          hand on any hole.
        </p>
      </div>

      {round.bets.map((bet) => {
        if (bet.kind === "nassau") {
          return (
            <NassauFields
              key={bet.id}
              bet={bet}
              players={round.players}
              onChange={replace}
            />
          );
        }
        if (bet.kind === "banker") {
          return (
            <BankerFields
              key={bet.id}
              bet={bet}
              players={round.players}
              onChange={replace}
            />
          );
        }
        if (bet.kind === "onedown") {
          return (
            <OneDownFields
              key={bet.id}
              bet={bet}
              players={round.players}
              onChange={replace}
            />
          );
        }
        return (
          <SkinsFields
            key={bet.id}
            bet={bet}
            players={round.players}
            onChange={replace}
          />
        );
      })}

    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /**
   * What the choice is about, for a screen reader: several of these on one
   * screen would otherwise all be "A", "B", "Out".
   */
  name?: string;
}) {
  return (
    <div
      className="flex gap-1 rounded-xl bg-neutral-100 p-1"
      role={name ? "group" : undefined}
      aria-label={name}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={name ? `${name}: ${option.label}` : undefined}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-9 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors ${
            value === option.value
              ? "bg-white text-turf-900 shadow-sm"
              : "text-neutral-600"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SideAssignment({
  sides,
  players,
  onSides,
}: {
  sides: [Side, Side];
  players: Player[];
  onSides: (sides: [Side, Side]) => void;
}) {
  const sideOf = (playerId: string): "a" | "b" | "out" => {
    if (sides[0].playerIds.includes(playerId)) return "a";
    if (sides[1].playerIds.includes(playerId)) return "b";
    return "out";
  };

  const assign = (playerId: string, target: "a" | "b" | "out") => {
    const next: [Side, Side] = [
      { ...sides[0], playerIds: sides[0].playerIds.filter((id) => id !== playerId) },
      { ...sides[1], playerIds: sides[1].playerIds.filter((id) => id !== playerId) },
    ];
    if (target === "a") next[0].playerIds = [...next[0].playerIds, playerId];
    if (target === "b") next[1].playerIds = [...next[1].playerIds, playerId];
    onSides(next);
  };

  return (
    <div className="mt-4">
      <div className="mb-2 text-sm font-semibold text-neutral-700">Sides</div>
      <ul className="space-y-2">
        {players.map((player) => (
          <li key={player.id} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
              {player.name}
            </span>
            <div className="w-44">
              <Toggle
                name={`${player.name} side`}
                value={sideOf(player.id)}
                onChange={(value) => assign(player.id, value as "a" | "b" | "out")}
                options={[
                  { value: "a", label: "A" },
                  { value: "b", label: "B" },
                  { value: "out", label: "Out" },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Side A name" hint="Follows who is on the side unless you type one.">
          <input
            value={sideLabel(sides[0], players, "Side A")}
            onChange={(event) =>
              onSides([{ ...sides[0], name: event.target.value }, sides[1]])
            }
            className={inputClass}
          />
        </Field>
        <Field label="Side B name">
          <input
            value={sideLabel(sides[1], players, "Side B")}
            onChange={(event) =>
              onSides([sides[0], { ...sides[1], name: event.target.value }])
            }
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}

function OneDownFields({
  bet,
  players,
  onChange,
}: {
  bet: OneDownConfig;
  players: Player[];
  onChange: (bet: OneDownConfig) => void;
}) {
  return (
    <Card>
      <div className="mb-3">
        <input
          aria-label="Bet name"
          value={bet.label}
          onChange={(event) => onChange({ ...bet, label: event.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent text-base font-bold text-turf-900 focus:bg-neutral-50"
        />
      </div>

      <p className="mb-3 text-xs text-neutral-600">
        A new bet opens whenever somebody is down in the newest one, so bets
        stack up as the round goes. Standing reads oldest bet first, e.g.{" "}
        <span className="font-mono font-semibold">3-2-1-1-0</span>.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Each bet" hint="Every bet in the stack is worth this.">
          <MoneyInput
            label="One down amount"
            showSign={false}
            value={bet.amount}
            onChange={(amount) => onChange({ ...bet, amount })}
          />
        </Field>
        <Field label="Scored on">
          <Toggle
            value={bet.basis}
            onChange={(basis) =>
              onChange({ ...bet, basis: basis as OneDownConfig["basis"] })
            }
            options={[
              { value: "net", label: "Net" },
              { value: "gross", label: "Gross" },
            ]}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="New bet opens at" hint="Presses can always be added by hand too.">
          <Toggle
            value={String(bet.autoPressAt)}
            onChange={(value) => onChange({ ...bet, autoPressAt: Number(value) })}
            options={[
              { value: "1", label: "1 down" },
              { value: "2", label: "2 down" },
              { value: "0", label: "By hand" },
            ]}
          />
        </Field>
        <Field label="Stack" hint="Whether it carries through the turn or restarts.">
          <Toggle
            value={bet.reset}
            onChange={(value) =>
              onChange({ ...bet, reset: value as OneDownConfig["reset"] })
            }
            options={[
              { value: "round", label: "All 18" },
              { value: "nines", label: "Per nine" },
            ]}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          label="Overall 18 bet"
          hint="One bet over all 18 alongside the nines. Never presses."
        >
          <Toggle
            value={String(bet.overallMultiplier)}
            onChange={(value) =>
              onChange({ ...bet, overallMultiplier: Number(value) })
            }
            options={[
              { value: "0", label: "Off" },
              { value: "1", label: "1x" },
              { value: "2", label: "2x" },
            ]}
          />
        </Field>
        <Field label="Greenies" hint="Closest to the hole on the par 3s, for the stake. Every par 3 to one side doubles them.">
          <Toggle
            name="Greenies"
            value={bet.greenies === false ? "off" : "on"}
            onChange={(value) => onChange({ ...bet, greenies: value === "on" })}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </Field>
        <Field
          label="Alternate holes"
          hint="1, 3, 5, 7, 9 and 10, 12, 14, 16, 18 on both partners' scores added together; the even holes of each nine are best ball."
        >
          <Toggle
            name="Alternate holes"
            value={bet.alternateAggregate === false ? "best-ball" : "aggregate"}
            onChange={(value) => onChange({ ...bet, alternateAggregate: value === "aggregate" })}
            options={[
              { value: "best-ball", label: "Best ball" },
              { value: "aggregate", label: "Aggregate" },
            ]}
          />
        </Field>
        <Field label="Team stake" hint="Per player: everyone on the side that is down is in for it. Per side: one stake, split.">
          <Toggle
            value={bet.stakeMode}
            onChange={(value) =>
              onChange({ ...bet, stakeMode: value as OneDownConfig["stakeMode"] })
            }
            options={[
              { value: "per-player", label: "Per player" },
              { value: "per-side", label: "Per side" },
            ]}
          />
        </Field>
      </div>

      <SideAssignment
        sides={bet.sides}
        players={players}
        onSides={(sides) => onChange({ ...bet, sides })}
      />
    </Card>
  );
}

function NassauFields({
  bet,
  players,
  onChange,
}: {
  bet: NassauConfig;
  players: Player[];
  onChange: (bet: NassauConfig) => void;
}) {
  return (
    <Card>
      <div className="mb-3">
        <input
          aria-label="Bet name"
          value={bet.label}
          onChange={(event) => onChange({ ...bet, label: event.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent text-base font-bold text-turf-900 focus:bg-neutral-50"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Per segment" hint="Front, back and total each play for this.">
          <MoneyInput
            label="Nassau amount"
            showSign={false}
            value={bet.amount}
            onChange={(amount) => onChange({ ...bet, amount })}
          />
        </Field>
        <Field label="Scored on">
          <Toggle
            value={bet.basis}
            onChange={(basis) => onChange({ ...bet, basis: basis as NassauConfig["basis"] })}
            options={[
              { value: "net", label: "Net" },
              { value: "gross", label: "Gross" },
            ]}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          label="Automatic press"
          hint="A new bet over the rest of the segment opens when a side falls this far behind."
        >
          <Toggle
            value={String(bet.autoPressAt)}
            onChange={(value) => onChange({ ...bet, autoPressAt: Number(value) })}
            options={[
              { value: "0", label: "Off" },
              { value: "1", label: "1 down" },
              { value: "2", label: "2 down" },
            ]}
          />
        </Field>
        <Field label="Press cap" hint="Per segment.">
          <select
            aria-label="Maximum presses per segment"
            value={bet.maxPresses}
            onChange={(event) =>
              onChange({ ...bet, maxPresses: Number(event.target.value) })
            }
            className={inputClass}
          >
            {[0, 1, 2, 3, 4, 6, 8, 12, 18].map((value) => (
              <option key={value} value={value}>
                {value === 0 ? "No presses" : `${value} max`}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Total 18 bet">
          <Toggle
            value={bet.includeTotal ? "yes" : "no"}
            onChange={(value) => onChange({ ...bet, includeTotal: value === "yes" })}
            options={[
              { value: "yes", label: "On" },
              { value: "no", label: "Off" },
            ]}
          />
        </Field>
        <Field label="Team stake" hint="Per player: everyone on the side that is down is in for it. Per side: one stake, split.">
          <Toggle
            value={bet.stakeMode}
            onChange={(value) =>
              onChange({ ...bet, stakeMode: value as NassauConfig["stakeMode"] })
            }
            options={[
              { value: "per-player", label: "Per player" },
              { value: "per-side", label: "Per side" },
            ]}
          />
        </Field>
      </div>

      <SideAssignment
        sides={bet.sides}
        players={players}
        onSides={(sides) => onChange({ ...bet, sides })}
      />
    </Card>
  );
}

function BankerFields({
  bet,
  players,
  onChange,
}: {
  bet: BankerConfig;
  players: Player[];
  onChange: (bet: BankerConfig) => void;
}) {
  const playing = players.filter((player) => bet.playerIds.includes(player.id));

  return (
    <Card>
      <div className="mb-3">
        <input
          aria-label="Bet name"
          value={bet.label}
          onChange={(event) => onChange({ ...bet, label: event.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent text-base font-bold text-turf-900 focus:bg-neutral-50"
        />
      </div>

      <p className="mb-3 text-xs text-neutral-600">
        The banker plays a separate bet against every other player, so a good
        hole collects from everybody.
      </p>

      <Field
        label="Money comes from"
        hint={
          bet.source === "manual"
            ? "You type what each player won or lost on the hole. No scores needed."
            : "Worked out from the scores and the doubles set on each hole."
        }
      >
        <Toggle
          value={bet.source}
          onChange={(value) =>
            onChange({ ...bet, source: value as BankerConfig["source"] })
          }
          options={[
            { value: "manual", label: "What I type" },
            { value: "scores", label: "The scores" },
          ]}
        />
      </Field>

      {bet.source === "scores" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Per player" hint="What each opponent plays the banker for.">
            <MoneyInput
              label="Banker amount"
              showSign={false}
              value={bet.amount}
              onChange={(amount) => onChange({ ...bet, amount })}
            />
          </Field>
          <Field label="Scored on">
            <Toggle
              value={bet.basis}
              onChange={(basis) =>
                onChange({ ...bet, basis: basis as BankerConfig["basis"] })
              }
              options={[
                { value: "net", label: "Net" },
                { value: "gross", label: "Gross" },
              ]}
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-3">
        <Field label="The deal passes to">
          <select
            aria-label="How the banker rotates"
            value={bet.rotation}
            onChange={(event) =>
              onChange({ ...bet, rotation: event.target.value as BankerConfig["rotation"] })
            }
            className={inputClass}
          >
            <option value="most-money">Whoever won the most money on the hole</option>
            <option value="hole-winner">Whoever had the low score on the hole</option>
            <option value="order">The next player in order</option>
            <option value="manual">Nobody — I set it each hole</option>
          </select>
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Banks the first hole">
          <select
            aria-label="First banker"
            value={bet.firstBankerId ?? ""}
            onChange={(event) =>
              onChange({ ...bet, firstBankerId: event.target.value || null })
            }
            className={inputClass}
          >
            {playing.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-sm font-semibold text-neutral-700">Playing</div>
        <div className="flex flex-wrap gap-2">
          {players.map((player) => (
            <Button
              key={player.id}
              variant={bet.playerIds.includes(player.id) ? "primary" : "secondary"}
              onClick={() =>
                onChange({
                  ...bet,
                  playerIds: bet.playerIds.includes(player.id)
                    ? bet.playerIds.filter((id) => id !== player.id)
                    : [...bet.playerIds, player.id],
                })
              }
            >
              {player.name}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function SkinsFields({
  bet,
  players,
  onChange,
}: {
  bet: SkinsConfig;
  players: Player[];
  onChange: (bet: SkinsConfig) => void;
}) {
  const toggle = (playerId: string) =>
    onChange({
      ...bet,
      playerIds: bet.playerIds.includes(playerId)
        ? bet.playerIds.filter((id) => id !== playerId)
        : [...bet.playerIds, playerId],
    });

  return (
    <Card>
      <div className="mb-3">
        <input
          aria-label="Bet name"
          value={bet.label}
          onChange={(event) => onChange({ ...bet, label: event.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent text-base font-bold text-turf-900 focus:bg-neutral-50"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Per skin" hint="What each other player pays the winner.">
          <MoneyInput
            label="Skin amount"
            showSign={false}
            value={bet.amount}
            onChange={(amount) => onChange({ ...bet, amount })}
          />
        </Field>
        <Field label="Scored on">
          <Toggle
            value={bet.basis}
            onChange={(basis) => onChange({ ...bet, basis: basis as SkinsConfig["basis"] })}
            options={[
              { value: "net", label: "Net" },
              { value: "gross", label: "Gross" },
            ]}
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Tied hole">
          <Toggle
            value={bet.carryOver ? "carry" : "void"}
            onChange={(value) => onChange({ ...bet, carryOver: value === "carry" })}
            options={[
              { value: "carry", label: "Carries" },
              { value: "void", label: "Voids" },
            ]}
          />
        </Field>
        <Field label="Validation" hint="Birdie or better required to take a skin.">
          <Toggle
            value={bet.requireBirdie ? "yes" : "no"}
            onChange={(value) => onChange({ ...bet, requireBirdie: value === "yes" })}
            options={[
              { value: "no", label: "Any score" },
              { value: "yes", label: "Birdie+" },
            ]}
          />
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-2 text-sm font-semibold text-neutral-700">Playing</div>
        <div className="flex flex-wrap gap-2">
          {players.map((player) => (
            <Button
              key={player.id}
              variant={bet.playerIds.includes(player.id) ? "primary" : "secondary"}
              onClick={() => toggle(player.id)}
            >
              {player.name}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}

const ROTATION_LABELS: Record<BankerConfig["rotation"], string> = {
  "most-money": "deal to the biggest winner",
  "hole-winner": "deal to the low score",
  order: "deal in order",
  manual: "deal set by hand",
};

export function BetSummaryLine({ bet, players }: { bet: BetConfig; players: Player[] }) {
  const sides =
    bet.kind === "onedown" || bet.kind === "nassau"
      ? labelledSides(bet.sides, players)
      : null;
  if (bet.kind === "banker") {
    return (
      <span>
        {bet.playerIds.length} players ·{" "}
        {bet.source === "manual" ? "money typed in" : `${bet.basis} scores`} ·{" "}
        {ROTATION_LABELS[bet.rotation]}
      </span>
    );
  }
  if (bet.kind === "onedown") {
    return (
      <span>
        {sides?.[0].name} vs {sides?.[1].name} · {bet.basis} ·{" "}
        {bet.autoPressAt > 0
          ? `new bet at ${bet.autoPressAt} down`
          : "presses by hand"}
        {bet.reset === "nines" ? " · per nine" : " · all 18"}
        {bet.overallMultiplier > 0
          ? ` · overall ${bet.overallMultiplier}x`
          : ""}
        {bet.greenies === false ? "" : " · greenies"}
        {bet.alternateAggregate === false ? "" : " · aggregate on 1, 3, 5, 7, 9 and 10, 12, 14, 16, 18"}
      </span>
    );
  }
  if (bet.kind === "nassau") {
    return (
      <span>
        {sides?.[0].name} vs {sides?.[1].name} · {bet.basis} ·{" "}
        {bet.autoPressAt > 0
          ? `auto press at ${bet.autoPressAt} down`
          : "no presses"}
      </span>
    );
  }
  return (
    <span>
      {bet.playerIds.length} players · {bet.basis} ·{" "}
      {bet.carryOver ? "ties carry" : "ties void"}
      {bet.requireBirdie ? " · birdie+" : ""}
    </span>
  );
}
