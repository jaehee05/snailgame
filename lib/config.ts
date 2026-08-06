/*
 * 게임 공통 상수. 회차 길이처럼 게임마다 다른 값은 lib/games/ 아래에 있다.
 */

/** 시뮬레이션 1틱 = 100ms */
export const TICK_MS = 100;
/** 달팽이 경주 시뮬레이션 상한. 화면 재생 시간과는 별개다. */
export const MAX_TICKS = 260;
/** 트랙 길이 (임의 단위) */
export const TRACK = 1000;
/** 틱당 기본 이동거리 */
export const BASE_SPEED = 5.8;
/** 회차당 출전 마릿수 */
export const FIELD = 4;

/** 환급률 (달팽이 배당에 곱해지는 값). 1.0 이면 하우스 엣지 0 */
export const PAYOUT_RATE = 0.9;
/** 배당 산출용 몬테카를로 시행 횟수 */
export const MC_RUNS = 900;

/** 신규 가입 시 지급되는 가상 코인 */
export const START_BALANCE = 10_000;
export const MIN_BET = 100;
export const MAX_BET = 100_000_000;

export type Phase = "betting" | "racing" | "result";
