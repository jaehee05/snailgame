import { buildOdds, type OddsTable } from "./bets";
import { TICK_MS } from "./config";
import { BINGO_TIMING, DRAW_COUNT } from "./games/bingo";
import { CRASH_MAX_ROUND_MS, CRASH_TIMING, crashAtOf, crashPointOf, MAX_MULT } from "./games/crash";
import { ODDEVEN_SETTLE_AT, ODDEVEN_TIMING } from "./games/oddeven";
import { SNAIL_FINISH_AT, SNAIL_ROUND_MS, SNAIL_TIMING } from "./games/snail";
import type { ChainGameId, RoundGameId, RoundSchedule } from "./games/types";
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
      return { roundMs: CRASH_MAX_ROUND_MS, betMs: CRASH_TIMING.betMs };
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

/** 결과가 확정되는 시각 (회차 시작 기준 경과 ms). 빙고는 일정을 따로 쓴다. */
export function settleAtOf(game: RoundGameId, roundId: number): number {
  switch (game) {
    case "snail":
      return SNAIL_FINISH_AT;
    case "oddeven":
      return ODDEVEN_SETTLE_AT;
    case "crash":
      return crashAtOf(secretSeedOf("crash", roundId));
    case "bingo":
      return BINGO_TIMING.betMs + BINGO_TIMING.drawMs;
  }
}

export function isRoundFinished(game: RoundGameId, roundId: number, now: number): boolean {
  return now - roundStart(game, roundId) >= settleAtOf(game, roundId);
}

export function isBettingOpen(game: RoundGameId, roundId: number, now: number): boolean {
  const elapsed = now - roundStart(game, roundId);
  return elapsed >= 0 && elapsed < timingOf(game).betMs;
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
  /** 구입/베팅이 마감되고 결과 공개가 시작되는 시각 */
  drawAt: number;
  /** 이 회차가 끝나는 시각 = 다음 회차 시작 */
  endAt: number;
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

export function publicRound(game: RoundGameId, roundId: number, now: number): PublicRound {
  const revealed = now - roundStart(game, roundId) >= timingOf(game).betMs;
  return {
    game,
    id: roundId,
    start: roundStart(game, roundId),
    publicSeed: publicSeedOf(game, roundId),
    commit: commitOf(game, roundId),
    secretSeed: revealed ? secretSeedOf(game, roundId) : null,
    drawAt: roundStart(game, roundId) + timingOf(game).betMs,
    endAt: roundStart(game, roundId) + timingOf(game).roundMs,
    data: roundData(game, roundId),
  };
}

export function currentRoundPayload(game: RoundGameId, now: number) {
  const id = roundIdAt(game, now);
  return {
    now,
    game,
    timing: timingOf(game),
    round: publicRound(game, id, now),
    prev: publicRound(game, id - 1, now),
  };
}

/**
 * 빙고·그래프는 회차가 사슬처럼 이어지므로 일정을 받아서 만든다.
 *
 * 그래프는 조심할 게 있다. "언제 터지는가"가 곧 "몇 배에서 터지는가"라서,
 * 회차 종료 시각이나 시드를 미리 내보내면 결과를 알려주는 것과 같다.
 * 그래서 터지기 전까지는 시드를 숨기고, 종료 시각도 최대치로 가려서 보낸다.
 */
export function chainRoundPayload(game: ChainGameId, sched: RoundSchedule, now: number) {
  const data: RoundData =
    game === "bingo"
      ? { game: "bingo", drawCount: DRAW_COUNT, drawMs: BINGO_TIMING.drawMs }
      : { game: "crash", maxMult: MAX_MULT, runMs: CRASH_TIMING.runMs };

  const build = (id: number, startAt: number, drawAt: number, endAt: number): PublicRound => {
    // 빙고는 추첨이 시작될 때, 그래프는 터진 뒤에 공개한다.
    const revealAt = game === "bingo" ? drawAt : endAt - CRASH_TIMING.resultMs;
    const revealed = now >= revealAt;
    return {
      game,
      id,
      start: startAt,
      publicSeed: publicSeedOf(game, id),
      commit: commitOf(game, id),
      secretSeed: revealed ? secretSeedOf(game, id) : null,
      drawAt,
      endAt:
        game === "crash" && !revealed
          ? drawAt + CRASH_TIMING.runMs + CRASH_TIMING.resultMs
          : endAt,
      data,
    };
  };

  const prevLen = timingOf(game).roundMs;
  return {
    now,
    game,
    timing: timingOf(game),
    round: build(sched.roundId, sched.startAt, sched.drawAt, sched.endAt),
    // 지난 회차는 이미 끝났으므로 시드가 공개된 상태다.
    prev: build(sched.roundId - 1, sched.startAt - prevLen, sched.startAt, sched.startAt),
  };
}

/** 크래시 회차가 터진 배수 */
export function crashPointOfRound(roundId: number): number {
  return crashPointOf(secretSeedOf("crash", roundId));
}
