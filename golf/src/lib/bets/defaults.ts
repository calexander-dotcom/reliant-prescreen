import type {
  BankerConfig,
  BetConfig,
  NassauConfig,
  OneDownConfig,
  Player,
  SkinsConfig,
  Side,
} from "../types";

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
    // $20 a player, not $20 a team.
    stakeMode: "per-player",
  };
}

/** The house game: $10 a bet, a new one every time somebody goes 1 down. */
export function defaultOneDown(players: Player[], id: string): OneDownConfig {
  return {
    kind: "onedown",
    id,
    label: "One downs",
    amount: 1000,
    sides: defaultSides(players),
    basis: "net",
    autoPressAt: 1,
    manualPresses: {},
    // The bet ends at the turn and starts again on the 10th.
    reset: "nines",
    // Plus one bet over all 18 at double, with no presses on it.
    overallMultiplier: 2,
    // $10 a player: a pair that is seven bets up is up $70 each.
    stakeMode: "per-player",
    // A flip on the 1st and 10th tees: the winners start one up.
    teeFlip: true,
    teeFlipWinners: {},
    // Closest to the hole on the par 3s, for the stake; a sweep doubles.
    greenies: true,
    greenieWinners: {},
    // 1, 3, 5, 7, 9 and 10, 12, 14, 16, 18 on both partners' scores added.
    alternateAggregate: true,
  };
}

/**
 * Banker at $5 a man, the deal passing to whoever won the most on the hole.
 * The alternative to one downs rather than an addition — most groups play one
 * or the other.
 */
export function defaultBanker(players: Player[], id: string): BankerConfig {
  return {
    kind: "banker",
    id,
    label: "Banker",
    // Type the money; a banker hole carries side action scores cannot know.
    source: "manual",
    amount: 500,
    basis: "net",
    playerIds: players.map((player) => player.id),
    rotation: "most-money",
    firstBankerId: players[0]?.id ?? null,
    bankerByHole: {},
    doubles: {},
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
  if (bet.label) return bet.label;
  if (bet.kind === "nassau") return "Nassau";
  if (bet.kind === "onedown") return "One downs";
  if (bet.kind === "banker") return "Banker";
  return "Skins";
}
