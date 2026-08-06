import { buildOdds, type OddsTable } from "./bets";
import { BET_MS, FINISH_AT, RACE_MS, ROUND_MS, roundIdAt, roundStart } from "./config";
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

/** 해당 회차의 경주가 이미 끝났는가 (= 정산 가능한가) */
export function isRoundFinished(roundId: number, now: number): boolean {
  return now - roundStart(roundId) >= FINISH_AT;
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
    timing: { roundMs: ROUND_MS, betMs: BET_MS, raceMs: RACE_MS, finishAt: FINISH_AT },
    round: publicRound(id, now),
    prev: publicRound(id - 1, now),
  };
}
