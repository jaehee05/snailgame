/** 한 회차의 총 길이 (ms) */
export const ROUND_MS = 90_000;
/** 베팅 접수 구간 */
export const BET_MS = 45_000;
/** 경주 구간 */
export const RACE_MS = 34_000;
/** 결과 확인 구간 (나머지) */
export const RESULT_MS = ROUND_MS - BET_MS - RACE_MS;

/** 시뮬레이션 1틱 = 100ms */
export const TICK_MS = 100;
export const MAX_TICKS = Math.floor(RACE_MS / TICK_MS);
/** 트랙 길이 (임의 단위) */
export const TRACK = 1000;
/** 틱당 기본 이동거리 → 평균 완주 약 22초 */
export const BASE_SPEED = 5.8;

/** 회차당 출전 마릿수 */
export const FIELD = 4;

/** 환급률 (배당에 곱해지는 값). 1.0 이면 하우스 엣지 0 */
export const PAYOUT_RATE = 0.9;

/** 배당 산출용 몬테카를로 시행 횟수 */
export const MC_RUNS = 900;

/** 신규 가입 시 지급되는 가상 코인 */
export const START_BALANCE = 10_000;

export const MIN_BET = 100;
export const MAX_BET = 1_000_000;

export type Phase = "betting" | "racing" | "result";

export function roundIdAt(now: number): number {
  return Math.floor(now / ROUND_MS);
}

export function roundStart(roundId: number): number {
  return roundId * ROUND_MS;
}

export function phaseOf(elapsed: number): Phase {
  if (elapsed < BET_MS) return "betting";
  if (elapsed < BET_MS + RACE_MS) return "racing";
  return "result";
}

/** 현재 페이즈가 끝날 때까지 남은 ms */
export function phaseRemaining(elapsed: number): number {
  if (elapsed < BET_MS) return BET_MS - elapsed;
  if (elapsed < BET_MS + RACE_MS) return BET_MS + RACE_MS - elapsed;
  return ROUND_MS - elapsed;
}

/**
 * 마지막 달팽이가 들어오고 결과를 발표하기까지의 뜸.
 * 경주는 보통 20초쯤에 끝나므로 RACE_MS 를 다 기다리지 않는다.
 */
export const RESULT_DELAY_MS = 3_000;
