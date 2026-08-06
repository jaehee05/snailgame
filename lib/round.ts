import { buildOdds, type OddsTable } from "./bets";
import { TICK_MS } from "./config";
import { BINGO_TIMING, DRAW_COUNT } from "./games/bingo";
import { CRASH_TIMING, crashAtOf, crashPointOf, MAX_MULT } from "./games/crash";
import { ODDEVEN_SETTLE_AT, ODDEVEN_TIMING } from "./games/oddeven";
import { SNAIL_FINISH_AT, SNAIL_ROUND_MS, SNAIL_TIMING } from "./games/snail";
import type { RoundGameId } from "./games/types";
import { buildLineup, simulate, type Racer, type RaceOutcome } from "./race";
import { commitOf, publicSeedOf, secretSeedOf } from "./seeds";

export type Timing = { roundMs: number; betMs: number };

export function timingOf(game: RoundGameId): Timing {
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

export function roundIdAt(game: RoundGameId, now: number): number {
  return Math.floor(now / timingOf(game).roundMs);
}

export function roundStart(game: RoundGameId, roundId: number): number {
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

/**
 * 관리자가 "바로진행"을 누르면 그 회차의 추첨 시작 시각만 앞당겨진다.
 * 결과 자체는 여전히 회차 시드에서 나오므로 무엇이 나올지는 달라지지 않는다.
 */
export type Override = { roundId: number; drawAt: number } | null;

/** 추첨이 시작되는 시각 (회차 시작 기준 경과 ms) */
export function drawStartOf(game: RoundGameId, roundId: number, override?: Override): number {
  const normal = timingOf(game).betMs;
  if (game !== "bingo" || !override || override.roundId !== roundId) return normal;
  return Math.min(normal, Math.max(0, override.drawAt - roundStart(game, roundId)));
}

/** 결과가 확정되는 시각 (회차 시작 기준 경과 ms) */
export function settleAtOf(game: RoundGameId, roundId: number, override?: Override): number {
  switch (game) {
    case "snail":
      return SNAIL_FINISH_AT;
    case "oddeven":
      return ODDEVEN_SETTLE_AT;
    case "crash":
      return crashAtOf(secretSeedOf("crash", roundId));
    case "bingo":
      return drawStartOf(game, roundId, override) + BINGO_TIMING.drawMs;
  }
}

export function isRoundFinished(
  game: RoundGameId,
  roundId: number,
  now: number,
  override?: Override
): boolean {
  return now - roundStart(game, roundId) >= settleAtOf(game, roundId, override);
}

export function isBettingOpen(
  game: RoundGameId,
  roundId: number,
  now: number,
  override?: Override
): boolean {
  const elapsed = now - roundStart(game, roundId);
  return elapsed >= 0 && elapsed < drawStartOf(game, roundId, override);
}

/** 게임마다 베팅 전에 공개되는 정보가 다르다. */
export type RoundData =
  | { game: "snail"; racers: Racer[]; odds: OddsTable; tickMs: number; raceMs: number }
  | { game: "oddeven"; drawMs: number }
  | { game: "crash"; maxMult: number; runMs: number }
  | { game: "bingo"; drawCount: number; drawMs: number };

export type PublicRound = {
  game: RoundGameId;
  id: number;
  start: number;
  publicSeed: string;
  commit: string;
  /** 베팅 마감 이후에만 채워진다. 이 값으로 결과를 직접 계산·검증할 수 있다. */
  secretSeed: string | null;
  drawAt: number;
  data: RoundData;
};

function roundData(game: RoundGameId, roundId: number): RoundData {
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
      return { game: "bingo", drawCount: DRAW_COUNT, drawMs: BINGO_TIMING.drawMs };
  }
}

export function publicRound(
  game: RoundGameId,
  roundId: number,
  now: number,
  override?: Override
): PublicRound {
  const revealed = now - roundStart(game, roundId) >= drawStartOf(game, roundId, override);
  return {
    game,
    id: roundId,
    start: roundStart(game, roundId),
    publicSeed: publicSeedOf(game, roundId),
    commit: commitOf(game, roundId),
    secretSeed: revealed ? secretSeedOf(game, roundId) : null,
    /** 관리자가 앞당긴 추첨 시작 시각 (절대 ms). 없으면 null */
    drawAt: roundStart(game, roundId) + drawStartOf(game, roundId, override),
    data: roundData(game, roundId),
  };
}

export function currentRoundPayload(game: RoundGameId, now: number, override?: Override) {
  const id = roundIdAt(game, now);
  return {
    now,
    game,
    timing: timingOf(game),
    round: publicRound(game, id, now, override),
    prev: publicRound(game, id - 1, now, override),
  };
}

/** 크래시 회차가 터진 배수 */
export function crashPointOfRound(roundId: number): number {
  return crashPointOf(secretSeedOf("crash", roundId));
}
