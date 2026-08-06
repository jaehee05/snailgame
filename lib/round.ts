import { buildOdds, type OddsTable } from "./bets";
import { TICK_MS } from "./config";
import {
  BINGO_SETTLE_AT,
  BINGO_TIMING,
  buildCard,
  DRAW_COUNT,
} from "./games/bingo";
import { CRASH_TIMING, crashAtOf, crashPointOf, MAX_MULT } from "./games/crash";
import { ODDEVEN_SETTLE_AT, ODDEVEN_TIMING } from "./games/oddeven";
import { SNAIL_FINISH_AT, SNAIL_ROUND_MS, SNAIL_TIMING } from "./games/snail";
import type { GameId } from "./games/types";
import { buildLineup, simulate, type Racer, type RaceOutcome } from "./race";
import { commitOf, publicSeedOf, secretSeedOf } from "./seeds";

export type Timing = { roundMs: number; betMs: number };

export function timingOf(game: GameId): Timing {
  switch (game) {
    case "snail":
      return { roundMs: SNAIL_ROUND_MS, betMs: SNAIL_TIMING.betMs };
    case "oddeven":
      return { roundMs: ODDEVEN_TIMING.roundMs, betMs: ODDEVEN_TIMING.betMs };
    case "crash":
      return { roundMs: CRASH_TIMING.roundMs, betMs: CRASH_TIMING.betMs };
    case "bingo":
      return { roundMs: BINGO_TIMING.roundMs, betMs: BINGO_TIMING.betMs };
  }
}

export function roundIdAt(game: GameId, now: number): number {
  return Math.floor(now / timingOf(game).roundMs);
}

export function roundStart(game: GameId, roundId: number): number {
  return roundId * timingOf(game).roundMs;
}

/* ── 달팽이 전용 계산 (배당이 비싸서 캐시한다) ───────────── */

type SnailCore = { publicSeed: string; racers: Racer[]; odds: OddsTable };
const snailCache = new Map<number, SnailCore>();

export function snailCore(roundId: number): SnailCore {
  const hit = snailCache.get(roundId);
  if (hit) return hit;

  const publicSeed = publicSeedOf("snail", roundId);
  const racers = buildLineup(publicSeed);
  const core: SnailCore = { publicSeed, racers, odds: buildOdds(racers, publicSeed) };

  snailCache.set(roundId, core);
  if (snailCache.size > 8) {
    for (const key of [...snailCache.keys()].sort((a, b) => a - b).slice(0, snailCache.size - 8)) {
      snailCache.delete(key);
    }
  }
  return core;
}

export function snailOutcome(roundId: number): RaceOutcome {
  return simulate(snailCore(roundId).racers, secretSeedOf("snail", roundId));
}

/* ── 회차 상태 ──────────────────────────────────────────── */

/** 결과가 확정되는 시각 (회차 시작 기준 경과 ms) */
export function settleAtOf(game: GameId, roundId: number): number {
  switch (game) {
    case "snail":
      return SNAIL_FINISH_AT;
    case "oddeven":
      return ODDEVEN_SETTLE_AT;
    case "crash":
      return crashAtOf(secretSeedOf("crash", roundId));
    case "bingo":
      return BINGO_SETTLE_AT;
  }
}

export function isRoundFinished(game: GameId, roundId: number, now: number): boolean {
  return now - roundStart(game, roundId) >= settleAtOf(game, roundId);
}

export function isBettingOpen(game: GameId, roundId: number, now: number): boolean {
  const elapsed = now - roundStart(game, roundId);
  return elapsed >= 0 && elapsed < timingOf(game).betMs;
}

/** 게임마다 베팅 전에 공개되는 정보가 다르다. */
export type RoundData =
  | { game: "snail"; racers: Racer[]; odds: OddsTable; tickMs: number; raceMs: number }
  | { game: "oddeven"; drawMs: number }
  | { game: "crash"; maxMult: number; runMs: number }
  | { game: "bingo"; card: number[]; drawCount: number; drawMs: number };

export type PublicRound = {
  game: GameId;
  id: number;
  start: number;
  publicSeed: string;
  commit: string;
  /** 베팅 마감 이후에만 채워진다. 이 값으로 결과를 직접 계산·검증할 수 있다. */
  secretSeed: string | null;
  data: RoundData;
};

function roundData(game: GameId, roundId: number): RoundData {
  switch (game) {
    case "snail": {
      const core = snailCore(roundId);
      return {
        game: "snail",
        racers: core.racers,
        odds: core.odds,
        tickMs: TICK_MS,
        raceMs: SNAIL_TIMING.raceMs,
      };
    }
    case "oddeven":
      return { game: "oddeven", drawMs: ODDEVEN_TIMING.drawMs };
    case "crash":
      return { game: "crash", maxMult: MAX_MULT, runMs: CRASH_TIMING.runMs };
    case "bingo":
      return {
        game: "bingo",
        card: buildCard(publicSeedOf("bingo", roundId)),
        drawCount: DRAW_COUNT,
        drawMs: BINGO_TIMING.drawMs,
      };
  }
}

export function publicRound(game: GameId, roundId: number, now: number): PublicRound {
  const { betMs } = timingOf(game);
  const revealed = now - roundStart(game, roundId) >= betMs;
  return {
    game,
    id: roundId,
    start: roundStart(game, roundId),
    publicSeed: publicSeedOf(game, roundId),
    commit: commitOf(game, roundId),
    secretSeed: revealed ? secretSeedOf(game, roundId) : null,
    data: roundData(game, roundId),
  };
}

export function currentRoundPayload(game: GameId, now: number) {
  const id = roundIdAt(game, now);
  return {
    now,
    game,
    timing: timingOf(game),
    round: publicRound(game, id, now),
    prev: publicRound(game, id - 1, now),
  };
}

/** 크래시 회차가 터진 배수 */
export function crashPointOfRound(roundId: number): number {
  return crashPointOf(secretSeedOf("crash", roundId));
}
