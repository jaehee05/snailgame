import { rngFromSeed } from "../prng";

/*
 * 그래프 (크래시).
 * 배수가 1.00배에서 시작해 점점 올라가다가 정해진 지점에서 터진다.
 * 터지기 전에 인출하면 그 시점 배수만큼 받고, 못 빼면 판돈을 잃는다.
 * 터지는 지점은 회차 시드에서 나오므로 시작 전에 이미 정해져 있고,
 * 마감 후 시드가 공개되면 누구나 다시 계산해 검증할 수 있다.
 */

export const CRASH_TIMING = {
  betMs: 12_000,
  /** 그래프가 올라갈 수 있는 최대 시간 */
  runMs: 16_000,
  /** 터지고 나서 다음 회차 출발 대기로 넘어가기까지 */
  resultMs: 5_000,
};

/** 배수 상승 속도 (초당 지수) */
const GROWTH = 0.15;
/** 배수 상한. 이 값에 도달하면 강제로 종료한다. */
export const MAX_MULT = 10;
/** 환수율. 1 - 하우스 엣지 */
const RETURN_RATE = 0.96;

/** 경과 시간(ms) → 배수 */
export function multAt(ms: number): number {
  if (ms <= 0) return 1;
  return Math.min(MAX_MULT, Math.exp(GROWTH * (ms / 1000)));
}

/** 배수 → 그 배수에 도달하는 시각(ms) */
export function timeOfMult(mult: number): number {
  return (Math.log(Math.max(1, mult)) / GROWTH) * 1000;
}

/** 이 회차가 터지는 배수. 시드만 있으면 누구나 같은 값을 얻는다. */
export function crashPointOf(secretSeed: string): number {
  const rnd = rngFromSeed(`crash:${secretSeed}`);
  const u = rnd();
  const raw = RETURN_RATE / (1 - u);
  if (raw <= 1) return 1; // 즉시 터짐 (약 4%)
  return Math.min(MAX_MULT, Math.floor(raw * 100) / 100);
}

/** 터지는 시각 (회차 시작 기준 ms) */
export function crashAtOf(secretSeed: string): number {
  return CRASH_TIMING.betMs + timeOfMult(crashPointOf(secretSeed));
}

/**
 * 이 회차가 끝나는 시각 (회차 시작 기준 ms).
 * 터지고 5초 뒤면 바로 다음 회차 출발 대기로 넘어간다. 그래서 회차 길이가
 * 회차마다 다르고, 빙고처럼 사슬로 이어 붙인다.
 */
export function crashEndOf(secretSeed: string): number {
  return crashAtOf(secretSeed) + CRASH_TIMING.resultMs;
}

/** 가장 오래 끌었을 때의 회차 길이 (일정 계산 상한) */
export const CRASH_MAX_ROUND_MS =
  CRASH_TIMING.betMs + CRASH_TIMING.runMs + CRASH_TIMING.resultMs;

/** 결과가 확정되는 시각 = 터진 시각 */
export function crashSettleAt(secretSeed: string): number {
  return crashAtOf(secretSeed);
}

export const MIN_AUTO_CASHOUT = 1.01;

export function isValidAutoTarget(target: number | undefined): boolean {
  if (target === undefined) return true;
  return Number.isFinite(target) && target >= MIN_AUTO_CASHOUT && target <= MAX_MULT;
}

export type CrashBetExtra = {
  /** 미리 걸어둔 자동 인출 배수 */
  autoTarget?: number;
  /** 실제로 인출한 배수 (수동 인출 시 서버가 기록) */
  cashoutMult?: number;
};

/** 인출 여부와 자동 인출 설정을 보고 정산한다. */
export function crashSettle(
  amount: number,
  extra: CrashBetExtra,
  crashPoint: number
): { hit: boolean; payout: number; at: number | null } {
  if (extra.cashoutMult && extra.cashoutMult <= crashPoint) {
    return { hit: true, payout: Math.floor(amount * extra.cashoutMult), at: extra.cashoutMult };
  }
  if (extra.autoTarget && crashPoint >= extra.autoTarget) {
    return { hit: true, payout: Math.floor(amount * extra.autoTarget), at: extra.autoTarget };
  }
  return { hit: false, payout: 0, at: null };
}
