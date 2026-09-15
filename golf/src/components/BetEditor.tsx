"use client";

import { defaultNassau, defaultOneDown, defaultSkins } from "@/lib/bets/defaults";
import { newId } from "@/lib/storage";
import type {
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

  return (
    <div className="space-y-4">
      {round.bets.map((bet) => {
        const remove = () => setBets(round.bets.filter((b) => b.id !== bet.id));
        if (bet.kind === "nassau") {
          return (
            <NassauFields
              key={bet.id}
              bet={bet}
              players={round.players}
              onChange={replace}
              onRemove={remove}
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
              onRemove={remove}
            />
          );
        }
        return (
          <SkinsFields
            key={bet.id}
            bet={bet}
            players={round.players}
            onChange={replace}
            onRemove={remove}
          />
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => setBets([...round.bets, defaultOneDown(round.players, newId())])}
        >
          + One downs
        </Button>
        <Button
          variant="secondary"
          onClick={() => setBets([...round.bets, defaultNassau(round.players, newId())])}
        >
          + Nassau
        </Button>
        <Button
          variant="secondary"
          onClick={() => setBets([...round.bets, defaultSkins(round.players, newId())])}
        >
          + Skins
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
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
        <Field label="Side A name">
          <input
            value={sides[0].name}
            onChange={(event) =>
              onSides([{ ...sides[0], name: event.target.value }, sides[1]])
            }
            className={inputClass}
          />
        </Field>
        <Field label="Side B name">
          <input
            value={sides[1].name}
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
  onRemove,
}: {
  bet: OneDownConfig;
  players: Player[];
  onChange: (bet: OneDownConfig) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <input
          aria-label="Bet name"
          value={bet.label}
          onChange={(event) => onChange({ ...bet, label: event.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent text-base font-bold text-turf-900 focus:bg-neutral-50"
        />
        <Button variant="ghost" onClick={onRemove}>
          Remove
        </Button>
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
        <Field label="Team stake" hint="Split the stake, or each loser pays each winner.">
          <Toggle
            value={bet.stakeMode}
            onChange={(value) =>
              onChange({ ...bet, stakeMode: value as OneDownConfig["stakeMode"] })
            }
            options={[
              { value: "per-side", label: "Per side" },
              { value: "per-player", label: "Per player" },
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
  onRemove,
}: {
  bet: NassauConfig;
  players: Player[];
  onChange: (bet: NassauConfig) => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <input
          aria-label="Bet name"
          value={bet.label}
          onChange={(event) => onChange({ ...bet, label: event.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent text-base font-bold text-turf-900 focus:bg-neutral-50"
        />
        <Button variant="ghost" onClick={onRemove}>
          Remove
        </Button>
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
        <Field label="Team stake" hint="Split the stake, or each loser pays each winner.">
          <Toggle
            value={bet.stakeMode}
            onChange={(value) =>
              onChange({ ...bet, stakeMode: value as NassauConfig["stakeMode"] })
            }
            options={[
              { value: "per-side", label: "Per side" },
              { value: "per-player", label: "Per player" },
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

function SkinsFields({
  bet,
  players,
  onChange,
  onRemove,
}: {
  bet: SkinsConfig;
  players: Player[];
  onChange: (bet: SkinsConfig) => void;
  onRemove: () => void;
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <input
          aria-label="Bet name"
          value={bet.label}
          onChange={(event) => onChange({ ...bet, label: event.target.value })}
          className="min-w-0 flex-1 rounded-lg bg-transparent text-base font-bold text-turf-900 focus:bg-neutral-50"
        />
        <Button variant="ghost" onClick={onRemove}>
          Remove
        </Button>
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

export function BetSummaryLine({ bet }: { bet: BetConfig }) {
  if (bet.kind === "onedown") {
    return (
      <span>
        {bet.sides[0].name} vs {bet.sides[1].name} · {bet.basis} ·{" "}
        {bet.autoPressAt > 0
          ? `new bet at ${bet.autoPressAt} down`
          : "presses by hand"}
        {bet.reset === "nines" ? " · per nine" : " · all 18"}
        {bet.overallMultiplier > 0
          ? ` · overall ${bet.overallMultiplier}x`
          : ""}
      </span>
    );
  }
  if (bet.kind === "nassau") {
    return (
      <span>
        {bet.sides[0].name} vs {bet.sides[1].name} · {bet.basis} ·{" "}
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
