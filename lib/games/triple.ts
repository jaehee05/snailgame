import { rngFromSeed } from "../prng";

/*
 * 즉석복권 (동행복권 즉석복권 방식).
 *
 * 회차가 없다. 한 장 사면 그 자리에서 결과가 정해지고, 세 칸을 긁어서 확인한다.
 *   게임1 = 50억 기회 · 게임2 = 10억 기회 · 게임3 = 보너스 기회
 * 같은 당첨금 심볼 3개가 나오면 그 금액에 당첨된다.
 *
 * 당첨 확률은 동행복권이 공개한 표 그대로다. 한 장 가격을 1,000 → 10,000 코인으로
 * 올리면서 당첨금도 전부 10배로 맞췄기 때문에 환급률은 그대로다.
 * 지급률 합계가 60.3%, 전체 당첨확률이 1/2.98 로 표기값(60.0% · 1/3.0)과 맞는다.
 * 다른 게임들(95% 안팎)보다 환급률이 훨씬 박한데, 실제 즉석복권이 그렇다.
 */

export const TRIPLE_PRICE = 10_000;
/** 한 번에 살 수 있는 최대 장수 */
export const MAX_TICKETS = 10;

export type PrizeRow = { rank: number; label: string; prize: number; odds: number };

/** 본 게임. odds 는 1/n 의 n. */
export const MAIN_ROWS: PrizeRow[] = [
  { rank: 1, label: "50억", prize: 5_000_000_000, odds: 3_750_000 },
  { rank: 2, label: "10억", prize: 1_000_000_000, odds: 1_875_000 },
  { rank: 3, label: "5천만", prize: 50_000_000, odds: 300_000 },
  { rank: 4, label: "1천만", prize: 10_000_000, odds: 75_000 },
  { rank: 5, label: "100만", prize: 1_000_000, odds: 30_000 },
  { rank: 6, label: "30만", prize: 300_000, odds: 3_000 },
  { rank: 7, label: "2만", prize: 20_000, odds: 33.3 },
  { rank: 8, label: "1만", prize: 10_000, odds: 3.3 },
];

/** 보너스 게임 (보너스 심볼이 나왔을 때만 열린다) */
export const BONUS_ROWS: PrizeRow[] = [
  { rank: 1, label: "10만", prize: 100_000, odds: 3_750 },
  { rank: 2, label: "5만", prize: 50_000, odds: 1_250 },
  { rank: 3, label: "3만", prize: 30_000, odds: 833.3 },
];

/** 보너스 심볼이 나올 확률 */
export const BONUS_ODDS = 441.2;

export type TripleResult = {
  /** 본 게임 당첨 등수 (0 = 꽝) */
  rank: number;
  /** 보너스 게임 등수 (0 = 보너스 아님) */
  bonusRank: number;
  prize: number;
  /** 세 칸에 표시할 심볼. 당첨 칸은 같은 심볼 3개가 된다. */
  panels: string[][];
  /** 당첨된 칸 (없으면 -1) */
  winPanel: number;
};

const BLANKS = ["🍀", "💎", "⭐", "🔔", "🍒", "7️⃣"];

function symbolsFor(label: string): string[] {
  return [label, label, label];
}

function losingSymbols(rnd: () => number): string[] {
  // 세 개가 모두 같아지지 않도록 고른다.
  const pool = [...BLANKS, ...MAIN_ROWS.map((r) => r.label)];
  const pick = () => pool[Math.floor(rnd() * pool.length)];
  const a = pick();
  let b = pick();
  while (b === a) b = pick();
  let c = pick();
  while (c === a && c === b) c = pick();
  return [a, b, c];
}

/** 티켓 한 장의 결과. 시드만 있으면 누구나 같은 값을 다시 계산할 수 있다. */
export function drawTriple(seed: string): TripleResult {
  const rnd = rngFromSeed(`triple:${seed}`);
  const u = rnd();

  let acc = 0;
  let rank = 0;
  let bonusRank = 0;
  let prize = 0;
  let label = "";

  for (const row of MAIN_ROWS) {
    acc += 1 / row.odds;
    if (u < acc) {
      rank = row.rank;
      prize = row.prize;
      label = row.label;
      break;
    }
  }

  if (rank === 0) {
    acc += 1 / BONUS_ODDS;
    if (u < acc) {
      // 보너스 심볼 → 보너스 게임에서 등수를 다시 뽑는다
      const total = BONUS_ROWS.reduce((s, r) => s + 1 / r.odds, 0);
      const v = rnd() * total;
      let bacc = 0;
      for (const row of BONUS_ROWS) {
        bacc += 1 / row.odds;
        if (v < bacc) {
          bonusRank = row.rank;
          prize = row.prize;
          label = row.label;
          break;
        }
      }
    }
  }

  // 어느 칸에서 터졌는지: 1등은 게임1, 2등은 게임2, 보너스는 게임3
  let winPanel = -1;
  if (bonusRank > 0) winPanel = 2;
  else if (rank === 1) winPanel = 0;
  else if (rank === 2) winPanel = 1;
  else if (rank > 0) winPanel = rnd() < 0.5 ? 0 : 1;

  const panels = [0, 1, 2].map((i) =>
    i === winPanel ? symbolsFor(label) : losingSymbols(rnd)
  );

  return { rank, bonusRank, prize, panels, winPanel };
}

export function describeTriple(r: TripleResult): string {
  if (r.bonusRank > 0) return `보너스 ${r.bonusRank}등`;
  if (r.rank > 0) return `${r.rank}등`;
  return "꽝";
}
