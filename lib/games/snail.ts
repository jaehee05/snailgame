/*
 * 달팽이 레이싱의 회차 구조.
 * 시뮬레이션 길이는 회차마다 다르지만(11~24초) 화면에는 항상 raceMs 에 맞춰
 * 재생하므로, 출발선에서 기다리거나 다 들어온 달팽이를 보고 있는 시간이 없다.
 */
export const SNAIL_TIMING = {
  betMs: 35_000,
  /** 화면에서 경주가 재생되는 시간 (항상 동일) */
  raceMs: 20_000,
  /** 결승 후 결과 발표까지의 뜸 */
  resultDelayMs: 3_000,
  /** 결과 화면이 떠 있는 시간 (항상 고정) */
  resultMs: 10_000,
};

/** 결승선 통과가 완료되는 시각 (회차 시작 기준) */
export const SNAIL_FINISH_AT = SNAIL_TIMING.betMs + SNAIL_TIMING.raceMs;
/** 결과 발표 시각 */
export const SNAIL_RESULT_AT = SNAIL_FINISH_AT + SNAIL_TIMING.resultDelayMs;
/** 한 회차의 총 길이 */
export const SNAIL_ROUND_MS = SNAIL_RESULT_AT + SNAIL_TIMING.resultMs;
