export const GAME_IDS = ["snail", "oddeven", "crash", "bingo", "triple"] as const;
export type GameId = (typeof GAME_IDS)[number];

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}

export const GAME_LABEL: Record<GameId, string> = {
  snail: "달팽이게임",
  oddeven: "홀짝",
  crash: "그래프",
  bingo: "빙고",
  triple: "즉석복권",
};

export const GAME_ICON: Record<GameId, string> = {
  snail: "🐌",
  oddeven: "🎲",
  crash: "📈",
  bingo: "🔢",
  triple: "🎫",
};

export const GAME_TAGLINE: Record<GameId, string> = {
  snail: "4마리 중 순위를 맞힌다",
  oddeven: "1~100 추첨, 홀짝과 대소",
  crash: "터지기 전에 인출한다",
  bingo: "24개를 골라 패턴을 맞춘다",
  triple: "긁어서 바로 확인",
};

/**
 * 회차가 돌아가는 게임들. 즉석복권은 즉석복권이라 회차가 없다.
 */
export type RoundGameId = Exclude<GameId, "triple">;

export function isRoundGameId(value: unknown): value is RoundGameId {
  return isGameId(value) && value !== "triple";
}

/** 모든 게임의 베팅은 이 형태로 표현한다. picks 의 의미는 게임마다 다르다. */
export type Selection = { kind: string; picks: number[] };

/** 게임마다 회차 길이가 다르다. 모두 시계 격자 위에 올라간다. */
export type GameTiming = {
  roundMs: number;
  /** 베팅을 받는 구간 (회차 시작 기준) */
  betMs: number;
};
