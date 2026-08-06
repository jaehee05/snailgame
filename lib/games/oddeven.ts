import { rngFromSeed } from "../prng";
import type { Selection } from "./types";

/*
 * 홀짝.
 * 1~100 중 한 숫자를 뽑아 홀/짝, 대(51~100)/소(1~50) 그리고 그 조합에 건다.
 * 확률이 정확히 반반이라 배당은 계산할 것도 없이 고정이다.
 */

export const ODDEVEN_TIMING = {
  roundMs: 30_000,
  betMs: 20_000,
  /** 숫자를 굴려서 보여주는 연출 구간 */
  drawMs: 5_000,
};

/** 결과가 확정되는 시각 (회차 시작 기준) */
export const ODDEVEN_SETTLE_AT = ODDEVEN_TIMING.betMs + ODDEVEN_TIMING.drawMs;

export type OddEvenOutcome = {
  number: number;
  odd: boolean;
  high: boolean;
};

export function oddEvenOutcome(secretSeed: string): OddEvenOutcome {
  const rnd = rngFromSeed(`oddeven:${secretSeed}`);
  const number = 1 + Math.floor(rnd() * 100);
  return { number, odd: number % 2 === 1, high: number > 50 };
}

export type OddEvenKind = "odd" | "even" | "high" | "low" | "oh" | "ol" | "eh" | "el";

export const ODDEVEN_BETS: Record<
  OddEvenKind,
  { label: string; desc: string; odds: number; group: "단일" | "조합" }
> = {
  odd: { label: "홀", desc: "홀수", odds: 1.95, group: "단일" },
  even: { label: "짝", desc: "짝수", odds: 1.95, group: "단일" },
  high: { label: "대", desc: "51 이상", odds: 1.95, group: "단일" },
  low: { label: "소", desc: "50 이하", odds: 1.95, group: "단일" },
  oh: { label: "홀·대", desc: "홀수이면서 51 이상", odds: 3.9, group: "조합" },
  ol: { label: "홀·소", desc: "홀수이면서 50 이하", odds: 3.9, group: "조합" },
  eh: { label: "짝·대", desc: "짝수이면서 51 이상", odds: 3.9, group: "조합" },
  el: { label: "짝·소", desc: "짝수이면서 50 이하", odds: 3.9, group: "조합" },
};

export const ODDEVEN_KINDS = Object.keys(ODDEVEN_BETS) as OddEvenKind[];

export function isOddEvenSelection(sel: Selection): boolean {
  return sel.picks.length === 0 && sel.kind in ODDEVEN_BETS;
}

export function oddEvenOdds(sel: Selection): number {
  return ODDEVEN_BETS[sel.kind as OddEvenKind]?.odds ?? 1;
}

export function oddEvenHit(sel: Selection, out: OddEvenOutcome): boolean {
  switch (sel.kind as OddEvenKind) {
    case "odd":
      return out.odd;
    case "even":
      return !out.odd;
    case "high":
      return out.high;
    case "low":
      return !out.high;
    case "oh":
      return out.odd && out.high;
    case "ol":
      return out.odd && !out.high;
    case "eh":
      return !out.odd && out.high;
    case "el":
      return !out.odd && !out.high;
    default:
      return false;
  }
}

/** 연출용: 추첨 구간 동안 굴러가는 숫자 (마지막엔 실제 결과로 수렴한다) */
export function rollingNumber(secretSeed: string, elapsedInDraw: number, final: number): number {
  const remain = ODDEVEN_TIMING.drawMs - elapsedInDraw;
  if (remain <= 700) return final;
  const rnd = rngFromSeed(`roll:${secretSeed}:${Math.floor(elapsedInDraw / 90)}`);
  return 1 + Math.floor(rnd() * 100);
}
