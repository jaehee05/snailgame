import { buildOdds, type OddsTable } from "./bets";
import {
  BET_MS,
  RACE_MS,
  RESULT_DELAY_MS,
  ROUND_MS,
  TICK_MS,
  roundIdAt,
  roundStart,
} from "./config";
import { buildLineup, simulate, type Racer, type RaceOutcome } from "./race";
import { commitOf, publicSeedOf, secretSeedOf } from "./seeds";

/**
 * 회차 단위 계산은 전부 순수 함수라서 몇 번을 다시 돌려도 같은 값이 나온다.
 * 다만 배당(몬테카를로)은 비싸므로 프로세스 안에서 잠깐 캐시한다.
 */
type RoundCore = { roundId: number; publicSeed: string; racers: Racer[]; odds: OddsTable };

const cache = new Map<number, RoundCore>();

export function roundCore(roundId: number): RoundCore {
  const hit = cache.get(roundId);
  if (hit) return hit;

  const publicSeed = publicSeedOf(roundId);
  const racers = buildLineup(publicSeed);
  const core: RoundCore = { roundId, publicSeed, racers, odds: buildOdds(racers, publicSeed) };

  cache.set(roundId, core);
  // 최근 회차 몇 개만 들고 있으면 충분하다.
  if (cache.size > 8) {
    for (const key of [...cache.keys()].sort((a, b) => a - b).slice(0, cache.size - 8)) {
      cache.delete(key);
    }
  }
  return core;
}

export function roundOutcome(roundId: number): RaceOutcome {
  const { racers } = roundCore(roundId);
  return simulate(racers, secretSeedOf(roundId));
}

/**
 * 해당 회차의 경주가 이미 끝났는가 (= 정산 가능한가).
 * 실제 경주 길이는 회차마다 다르므로, RACE_MS 를 다 기다리지 않고
 * 마지막 달팽이가 들어온 시점을 기준으로 판단한다.
 */
export function isRoundFinished(roundId: number, now: number): boolean {
  const elapsed = now - roundStart(roundId);
  if (elapsed >= BET_MS + RACE_MS) return true; // 지난 회차는 계산할 필요도 없다
  if (elapsed < BET_MS) return false;
  return elapsed >= BET_MS + roundOutcome(roundId).ticks * TICK_MS;
}

/** 이 회차의 결과 발표 시각 (회차 시작 기준 경과 ms) */
export function resultAtOf(roundId: number): number {
  return BET_MS + roundOutcome(roundId).ticks * TICK_MS + RESULT_DELAY_MS;
}

/** 아직 베팅을 받을 수 있는 회차인가 */
export function isBettingOpen(roundId: number, now: number): boolean {
  const elapsed = now - roundStart(roundId);
  return elapsed >= 0 && elapsed < BET_MS;
}

export type PublicRound = {
  id: number;
  start: number;
  publicSeed: string;
  /** 비공개 시드의 해시. 베팅 중에 미리 공개된다. */
  commit: string;
  /** 베팅 마감 이후에만 채워진다. */
  secretSeed: string | null;
  odds: OddsTable;
  racers: Racer[];
};

export function publicRound(roundId: number, now: number): PublicRound {
  const core = roundCore(roundId);
  const revealed = now - roundStart(roundId) >= BET_MS;
  return {
    id: roundId,
    start: roundStart(roundId),
    publicSeed: core.publicSeed,
    commit: commitOf(roundId),
    secretSeed: revealed ? secretSeedOf(roundId) : null,
    odds: core.odds,
    racers: core.racers,
  };
}

export function currentRoundPayload(now: number) {
  const id = roundIdAt(now);
  return {
    now,
    timing: { roundMs: ROUND_MS, betMs: BET_MS, raceMs: RACE_MS },
    round: publicRound(id, now),
    prev: publicRound(id - 1, now),
  };
}
