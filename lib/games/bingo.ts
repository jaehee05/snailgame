import { rngFromSeed, shuffle } from "../prng";

/*
 * 메가빙고 (동행복권 방식).
 *
 * 1~75 중 24개를 고르고, 회차마다 49개가 추첨된다.
 * 내가 고른 번호들이 추첨된 49개 안에 들어 있으면 그 칸이 맞는 것이고,
 * 정해진 패턴의 칸이 "전부" 맞으면 그 등수에 당첨된다.
 *
 * 칸은 5×5 카드에 놓이고 가운데는 FREE 다. 열마다 고를 수 있는 범위가 다르다.
 *   B 1~15 (5개) · I 16~30 (5개) · N 31~45 (4개, 가운데 FREE) ·
 *   G 46~60 (5개) · O 61~75 (5개)  →  합 24개
 *
 * 당첨 확률은 패턴의 칸 수에만 좌우된다(49/75 초기하). 실제로 동행복권이
 * 공개한 확률과 소수점까지 일치하는 것을 확인했다.
 *   4칸 1/5.74 · 6칸 1/14.40 · 8칸 1/37.41
 *   12칸 1/283.14 · 16칸 1/2,553.69 · 24칸 1/407,856.59
 */

/**
 * 실제 게임과 같은 8분 회차.
 * "구입가능시간 7분, 추첨진행 및 신규회차 생성 1분" 이라고 안내되어 있다.
 */
export const BINGO_TIMING = {
  roundMs: 480_000,
  betMs: 420_000,
  /** 49개를 하나씩 다 뽑는 데 걸리는 시간 (공 하나에 약 1.1초) */
  drawMs: 54_000,
};

export const BINGO_SETTLE_AT = BINGO_TIMING.betMs + BINGO_TIMING.drawMs;

export const CARD_SIZE = 5;
export const COLUMN_LABELS = ["B", "I", "N", "G", "O"] as const;
/** 열마다 고를 수 있는 번호 범위의 크기 */
export const COLUMN_RANGE = 15;
export const NUMBER_MAX = CARD_SIZE * COLUMN_RANGE; // 75
/** 열별로 골라야 하는 개수 (N 은 가운데가 FREE 라 4개) */
export const PICKS_PER_COLUMN = [5, 5, 4, 5, 5];
export const PICK_COUNT = PICKS_PER_COLUMN.reduce((a, b) => a + b, 0); // 24
/** 한 회차에 뽑는 공 개수 */
export const DRAW_COUNT = 49;
/** 가운데 FREE 칸 */
export const FREE_CELL = 12;

/** 한 장 가격 (고정) */
export const TICKET_PRICE = 1_000;
/** 한 회차에 살 수 있는 최대 장수 */
export const MAX_TICKETS = 10;

export function columnOf(n: number): number {
  return Math.floor((n - 1) / COLUMN_RANGE);
}

export function columnNumbers(col: number): number[] {
  return Array.from({ length: COLUMN_RANGE }, (_, i) => col * COLUMN_RANGE + i + 1);
}

/* ── 당첨 패턴 ────────────────────────────────────────── */

const cell = (r: number, c: number) => r * CARD_SIZE + c;

/**
 * 패턴별 칸 목록. 확률은 칸 수에만 좌우되므로 모양이 조금 달라도
 * 당첨 확률은 동행복권 표와 똑같다.
 */
export const PATTERNS: { rank: number; name: string; cells: number[] }[] = [
  {
    rank: 1,
    name: "블랙아웃",
    cells: Array.from({ length: 25 }, (_, i) => i).filter((i) => i !== FREE_CELL),
  },
  {
    rank: 2,
    name: "프레임",
    cells: Array.from({ length: 25 }, (_, i) => i).filter((i) => {
      const r = Math.floor(i / CARD_SIZE);
      const c = i % CARD_SIZE;
      return r === 0 || r === CARD_SIZE - 1 || c === 0 || c === CARD_SIZE - 1;
    }),
  },
  {
    rank: 3,
    name: "다이아몬드",
    cells: Array.from({ length: 25 }, (_, i) => i).filter((i) => {
      const r = Math.floor(i / CARD_SIZE);
      const c = i % CARD_SIZE;
      return Math.abs(r - 2) + Math.abs(c - 2) <= 2 && i !== FREE_CELL;
    }),
  },
  {
    rank: 4,
    name: "X",
    cells: [cell(0, 0), cell(1, 1), cell(3, 3), cell(4, 4), cell(0, 4), cell(1, 3), cell(3, 1), cell(4, 0)],
  },
  {
    rank: 5,
    name: "Y",
    cells: [cell(0, 0), cell(1, 1), cell(0, 4), cell(1, 3), cell(3, 2), cell(4, 2)],
  },
  { rank: 6, name: "바", cells: [cell(2, 0), cell(2, 1), cell(2, 3), cell(2, 4)] },
];

/**
 * 등수별 당첨금 (한 장 1,000 코인 기준, 고정 금액).
 * 몬테카를로 1,000만 회로 환수율을 맞춰 정했다. lib/games/bingo 주석 참고.
 */
export const PRIZES: Record<number, number> = {
  1: 100_000_000,
  2: 400_000,
  3: 50_000,
  4: 6_000,
  5: 2_000,
  6: 900,
};

/* ── 카드와 추첨 ─────────────────────────────────────── */

/** 고른 번호 24개를 5×5 카드로 배치한다. 가운데는 FREE(null). */
export function cardFromPicks(picks: number[]): (number | null)[] {
  const byColumn: number[][] = [[], [], [], [], []];
  for (const n of picks) byColumn[columnOf(n)].push(n);
  for (const col of byColumn) col.sort((a, b) => a - b);

  const card: (number | null)[] = new Array(25).fill(null);
  for (let c = 0; c < CARD_SIZE; c++) {
    let idx = 0;
    for (let r = 0; r < CARD_SIZE; r++) {
      const i = cell(r, c);
      if (i === FREE_CELL) continue;
      card[i] = byColumn[c][idx++] ?? null;
    }
  }
  return card;
}

export function isValidPicks(picks: number[]): boolean {
  if (picks.length !== PICK_COUNT) return false;
  if (new Set(picks).size !== picks.length) return false;
  if (!picks.every((n) => Number.isInteger(n) && n >= 1 && n <= NUMBER_MAX)) return false;
  const counts = [0, 0, 0, 0, 0];
  for (const n of picks) counts[columnOf(n)]++;
  return counts.every((c, i) => c === PICKS_PER_COLUMN[i]);
}

/** 추첨된 49개 (뽑히는 순서 그대로) */
export function drawBalls(secretSeed: string): number[] {
  const rnd = rngFromSeed(`bingo:draw:${secretSeed}`);
  return shuffle(
    Array.from({ length: NUMBER_MAX }, (_, i) => i + 1),
    rnd
  ).slice(0, DRAW_COUNT);
}

/**
 * i번째 공이 나오는 시각 (회차 시작 기준).
 * drawStart 는 추첨이 시작되는 경과 시각. 관리자가 바로진행을 누르면 이 값이 당겨진다.
 */
export function ballTimeOf(index: number, drawStart = BINGO_TIMING.betMs): number {
  return drawStart + ((index + 1) * BINGO_TIMING.drawMs) / DRAW_COUNT;
}

/** 지금까지 뽑힌 공으로 완성된 패턴 중 가장 높은 등수 (없으면 0) */
export function bestRank(picks: number[], drawn: Set<number>): number {
  const card = cardFromPicks(picks);
  for (const pattern of PATTERNS) {
    const done = pattern.cells.every((i) => {
      const n = card[i];
      return n !== null && drawn.has(n);
    });
    if (done) return pattern.rank;
  }
  return 0;
}

export function patternOf(rank: number) {
  return PATTERNS.find((p) => p.rank === rank);
}

export function prizeOf(rank: number): number {
  return PRIZES[rank] ?? 0;
}

/** 자동선택: 열마다 정해진 개수만큼 무작위로 고른다. */
export function autoPick(rnd: () => number = Math.random): number[] {
  const picks: number[] = [];
  for (let c = 0; c < CARD_SIZE; c++) {
    picks.push(...shuffle(columnNumbers(c), rnd).slice(0, PICKS_PER_COLUMN[c]));
  }
  return picks.sort((a, b) => a - b);
}
