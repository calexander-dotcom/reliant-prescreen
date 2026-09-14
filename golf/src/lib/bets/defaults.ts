import type { BetConfig, NassauConfig, Player, SkinsConfig, Side } from "../types";

/** Split a group into two sides: first half against the rest. */
export function defaultSides(players: Player[]): [Side, Side] {
  const half = Math.ceil(players.length / 2);
  const a = players.slice(0, half).map((player) => player.id);
  const b = players.slice(half).map((player) => player.id);
  const nameFor = (ids: string[], fallback: string) => {
    const names = ids
      .map((id) => players.find((player) => player.id === id)?.name.split(" ")[0])
      .filter(Boolean);
    return names.length > 0 ? names.join(" / ") : fallback;
  };
  return [
    { id: "side-a", name: nameFor(a, "Side A"), playerIds: a },
    { id: "side-b", name: nameFor(b, "Side B"), playerIds: b },
  ];
}

/** A $20 nassau with automatic one-down presses — the default money game. */
export function defaultNassau(players: Player[], id: string): NassauConfig {
  return {
    kind: "nassau",
    id,
    label: "Nassau",
    amount: 2000,
    sides: defaultSides(players),
    basis: "net",
    autoPressAt: 1,
    maxPresses: 4,
    includeTotal: true,
    stakeMode: "per-side",
  };
}

export function defaultSkins(players: Player[], id: string): SkinsConfig {
  return {
    kind: "skins",
    id,
    label: "Skins",
    amount: 500,
    basis: "net",
    playerIds: players.map((player) => player.id),
    carryOver: true,
    requireBirdie: false,
  };
}

export function betLabel(bet: BetConfig): string {
  return bet.label || (bet.kind === "nassau" ? "Nassau" : "Skins");
}
