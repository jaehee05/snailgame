/** 베팅 접수 구간 */
export const BET_MS = 35_000;
/**
 * 화면에서 경주가 재생되는 시간. 회차와 무관하게 항상 같다.
 * 시뮬레이션 자체는 회차마다 길이가 다르지만(11~24초), 그걸 이 시간에 맞춰
 * 늘리거나 줄여서 재생한다. 순위와 전개는 그대로고 재생 속도만 달라진다.
 * 덕분에 출발선에서 기다리거나 다 들어온 달팽이를 멍하니 보는 시간이 없다.
 */
export const RACE_MS = 20_000;
/** 마지막 달팽이가 들어오고 결과를 발표하기까지의 뜸 */
export const RESULT_DELAY_MS = 3_000;
/** 결과 화면이 떠 있는 시간 (항상 고정) */
export const RESULT_MS = 10_000;

/** 결승선 통과가 완료되는 시각 (회차 시작 기준) */
export const FINISH_AT = BET_MS + RACE_MS;
/** 결과 발표 시각 (회차 시작 기준) */
export const RESULT_AT = FINISH_AT + RESULT_DELAY_MS;
/** 한 회차의 총 길이 */
export const ROUND_MS = RESULT_AT + RESULT_MS;

/** 시뮬레이션 1틱 = 100ms */
export const TICK_MS = 100;
/** 시뮬레이션 상한. 재생 시간(RACE_MS)과는 별개다. */
export const MAX_TICKS = 260;
/** 트랙 길이 (임의 단위) */
export const TRACK = 1000;
/** 틱당 기본 이동거리 */
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
