import { MC_RUNS, PAYOUT_RATE } from "./config";
import type { GameId } from "./games/types";
import { Racer, simulate } from "./race";

export type BetKind = "win" | "place" | "quinella" | "exacta" | "trifecta";

export const BET_META: Record<
  BetKind,
  { label: string; short: string; desc: string; picks: number; ordered: boolean }
> = {
  win: { label: "단승", short: "1등 적중", desc: "고른 달팽이가 1등으로 들어오면 적중", picks: 1, ordered: false },
  place: { label: "연승", short: "2등 안에", desc: "고른 달팽이가 2등 안에 들면 적중 (이른바 삼치기)", picks: 1, ordered: false },
  quinella: { label: "복승", short: "1·2등 무순", desc: "고른 두 마리가 순서 상관없이 1·2등을 차지하면 적중", picks: 2, ordered: false },
  exacta: { label: "쌍승", short: "1·2등 순서", desc: "1등과 2등을 순서까지 정확히 맞히면 적중", picks: 2, ordered: true },
  trifecta: { label: "삼쌍승", short: "1·2·3등 순서", desc: "1·2·3등을 순서까지 정확히 맞히는 최고 배당", picks: 3, ordered: true },
};

export const BET_KINDS: BetKind[] = ["win", "place", "quinella", "exacta", "trifecta"];

export type BetSelection = { kind: BetKind; picks: number[] };

export function selectionKey(sel: BetSelection): string {
  const meta = BET_META[sel.kind];
  const picks = meta.ordered ? sel.picks : sel.picks.slice().sort((a, b) => a - b);
  return `${sel.kind}:${picks.join("-")}`;
}

export function isHit(sel: BetSelection, order: number[]): boolean {
  const [a, b, c] = sel.picks;
  switch (sel.kind) {
    case "win":
      return order[0] === a;
    case "place":
      return order.indexOf(a) < 2;
    case "quinella": {
      const top2 = order.slice(0, 2);
      return top2.includes(a) && top2.includes(b) && a !== b;
    }
    case "exacta":
      return order[0] === a && order[1] === b;
    case "trifecta":
      return order[0] === a && order[1] === b && order[2] === c;
  }
}

export function isValidSelection(sel: BetSelection, field: number): boolean {
  const meta = BET_META[sel.kind];
  if (!meta) return false;
  if (sel.picks.length !== meta.picks) return false;
  if (new Set(sel.picks).size !== sel.picks.length) return false;
  return sel.picks.every((p) => Number.isInteger(p) && p >= 0 && p < field);
}

export type OddsTable = Record<string, number>;

/**
 * 출전표만 가지고 몬테카를로로 각 베팅의 적중 확률을 추정해 배당을 만든다.
 * 공개 시드에서만 파생되므로 서버와 모든 클라이언트가 동일한 배당표를 얻는다.
 * (실제 경주는 비공개 시드로 돌아가므로 이 표로 결과를 예측할 수는 없다.)
 */
export function buildOdds(racers: Racer[], publicSeed: string, runs = MC_RUNS): OddsTable {
  const n = racers.length;
  const counts = new Map<string, number>();
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

  for (let i = 0; i < runs; i++) {
    const { order } = simulate(racers, `mc:${publicSeed}:${i}`);
    const [p1, p2, p3] = order;
    bump(`win:${p1}`);
    bump(`place:${p1}`);
    bump(`place:${p2}`);
    bump(`quinella:${[p1, p2].sort((a, b) => a - b).join("-")}`);
    bump(`exacta:${p1}-${p2}`);
    bump(`trifecta:${p1}-${p2}-${p3}`);
  }

  const table: OddsTable = {};
  const setOdds = (key: string) => {
    const hits = counts.get(key) ?? 0;
    // 표본에 한 번도 안 나온 조합도 배당은 있어야 하므로 하한을 둔다.
    const p = Math.max(hits, 0.5) / runs;
    table[key] = Math.max(1.01, Math.round((PAYOUT_RATE / p) * 100) / 100);
  };

  for (let a = 0; a < n; a++) {
    setOdds(`win:${a}`);
    setOdds(`place:${a}`);
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      if (a < b) setOdds(`quinella:${a}-${b}`);
      setOdds(`exacta:${a}-${b}`);
      for (let c = 0; c < n; c++) {
        if (c === a || c === b) continue;
        setOdds(`trifecta:${a}-${b}-${c}`);
      }
    }
  }
  return table;
}

export function oddsFor(table: OddsTable, sel: BetSelection): number {
  return table[selectionKey(sel)] ?? 1.01;
}

export type PlacedBet = {
  id: string;
  game: GameId;
  roundId: number;
  /** 달팽이는 BetKind, 홀짝은 OddEvenKind, 그래프는 "ride" */
  kind: string;
  picks: number[];
  amount: number;
  odds: number;
  /** 그래프 전용: 미리 걸어둔 자동 인출 배수 */
  autoTarget?: number;
  /** 그래프 전용: 실제로 인출한 배수 */
  cashoutMult?: number;
  /** 정산 후에만 채워진다 */
  hit?: boolean;
  payout?: number;
};

export function payoutOf(bet: PlacedBet, order: number[]): { hit: boolean; payout: number } {
  const hit = isHit({ kind: bet.kind as BetKind, picks: bet.picks }, order);
  return { hit, payout: hit ? Math.floor(bet.amount * bet.odds) : 0 };
}

export function describeBet(bet: BetSelection, names: string[]): string {
  const meta = BET_META[bet.kind];
  const picked = bet.picks.map((p) => names[p] ?? `${p + 1}번`);
  if (bet.kind === "win") return `${picked[0]} 1등`;
  if (bet.kind === "place") return `${picked[0]} 2등 안`;
  if (bet.kind === "quinella") return `${picked.join(" · ")} (무순)`;
  return picked.join(" → ") + ` (${meta.label})`;
}
