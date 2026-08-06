import { rngFromSeed, shuffle } from "../prng";
import type { Selection } from "./types";

/*
 * 메가빙고.
 * 5×5 카드에 1~25 가 무작위로 놓이고, 그중 18개가 하나씩 뽑힌다.
 * 가로 5줄 · 세로 5줄 · 대각 2줄, 총 12줄 중 몇 줄이 완성되는지에 건다.
 *
 * 카드 배치는 보기 좋으라고 섞는 것일 뿐 확률과는 무관하다. 1~25 의 어떤
 * 배열이든 "18개를 뽑아 특정 5칸이 모두 채워질 확률"은 똑같기 때문이다.
 * 그래서 배당표도 회차와 무관하게 고정이다.
 */

export const BINGO_TIMING = {
  roundMs: 48_000,
  betMs: 20_000,
  /** 공을 다 뽑는 데 걸리는 시간 (항상 동일) */
  drawMs: 20_000,
};

export const BINGO_SETTLE_AT = BINGO_TIMING.betMs + BINGO_TIMING.drawMs;

export const CARD_SIZE = 5;
export const CELL_COUNT = CARD_SIZE * CARD_SIZE;
/** 한 회차에 뽑는 공 개수 */
export const DRAW_COUNT = 18;

/** 줄을 이루는 칸 번호 묶음 (가로 5 + 세로 5 + 대각 2 = 12줄) */
export const LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let r = 0; r < CARD_SIZE; r++) {
    lines.push(Array.from({ length: CARD_SIZE }, (_, c) => r * CARD_SIZE + c));
  }
  for (let c = 0; c < CARD_SIZE; c++) {
    lines.push(Array.from({ length: CARD_SIZE }, (_, r) => r * CARD_SIZE + c));
  }
  lines.push(Array.from({ length: CARD_SIZE }, (_, i) => i * CARD_SIZE + i));
  lines.push(Array.from({ length: CARD_SIZE }, (_, i) => i * CARD_SIZE + (CARD_SIZE - 1 - i)));
  return lines;
})();

/** 회차 시작과 함께 공개되는 카드 배치 */
export function buildCard(publicSeed: string): number[] {
  const rnd = rngFromSeed(`bingo:card:${publicSeed}`);
  return shuffle(
    Array.from({ length: CELL_COUNT }, (_, i) => i + 1),
    rnd
  );
}

/** 뽑히는 공 18개 (뽑는 순서 그대로) */
export function drawBalls(secretSeed: string): number[] {
  const rnd = rngFromSeed(`bingo:draw:${secretSeed}`);
  return shuffle(
    Array.from({ length: CELL_COUNT }, (_, i) => i + 1),
    rnd
  ).slice(0, DRAW_COUNT);
}

/** 지금까지 뽑힌 공으로 완성된 줄들 */
export function completedLines(card: number[], drawn: Set<number>): number[] {
  const done: number[] = [];
  LINES.forEach((line, i) => {
    if (line.every((cell) => drawn.has(card[cell]))) done.push(i);
  });
  return done;
}

export function lineCountOf(card: number[], balls: number[]): number {
  return completedLines(card, new Set(balls)).length;
}

/** i번째 공이 나오는 시각 (회차 시작 기준) */
export function ballTimeOf(index: number): number {
  return BINGO_TIMING.betMs + ((index + 1) * BINGO_TIMING.drawMs) / DRAW_COUNT;
}

export type BingoKind = "l0" | "l1" | "l2" | "l3" | "l4plus";

/*
 * 배당. 25칸 중 18칸을 채울 때의 완성 줄 수 분포는 회차와 무관하게 고정이라,
 * 30만 회를 돌려 나온 확률에 환수율 0.95 를 곱해 값을 박아 두었다.
 *   0줄 5.63% · 1줄 27.04% · 2줄 40.52% · 3줄 22.10% · 4줄 이상 4.71%
 *   (기대 완성 줄 수 1.935)
 */
export const BINGO_BETS: Record<BingoKind, { label: string; desc: string; odds: number }> = {
  l0: { label: "0줄", desc: "한 줄도 완성되지 않는다", odds: 16.89 },
  l1: { label: "1줄", desc: "정확히 한 줄", odds: 3.51 },
  l2: { label: "2줄", desc: "정확히 두 줄", odds: 2.34 },
  l3: { label: "3줄", desc: "정확히 세 줄", odds: 4.3 },
  l4plus: { label: "4줄 이상", desc: "네 줄 이상 완성", odds: 20.17 },
};

export const BINGO_KINDS = Object.keys(BINGO_BETS) as BingoKind[];

export function isBingoSelection(sel: Selection): boolean {
  return sel.picks.length === 0 && sel.kind in BINGO_BETS;
}

export function bingoOdds(sel: Selection): number {
  return BINGO_BETS[sel.kind as BingoKind]?.odds ?? 1;
}

export function bingoHit(sel: Selection, lines: number): boolean {
  switch (sel.kind as BingoKind) {
    case "l0":
      return lines === 0;
    case "l1":
      return lines === 1;
    case "l2":
      return lines === 2;
    case "l3":
      return lines === 3;
    case "l4plus":
      return lines >= 4;
    default:
      return false;
  }
}
