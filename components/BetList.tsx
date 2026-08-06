"use client";

import { useState } from "react";

import { BET_META, describeBet, isHit, type BetKind, type PlacedBet } from "@/lib/bets";
import { formatCoins, formatMult, type RoundResult } from "@/lib/client";
import { ODDEVEN_BETS, type OddEvenKind } from "@/lib/games/oddeven";
import { GAME_ICON, type GameId } from "@/lib/games/types";
import type { Racer } from "@/lib/race";

/** 이번 회차에 내가 건 것 (달팽이) */
export function MyBets({
  bets,
  racers,
  order,
}: {
  bets: PlacedBet[];
  racers: Racer[];
  order: number[] | null;
}) {
  const names = racers.map((r) => r.char.name);
  const total = bets.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>이번 회차 내 베팅</h2>
        {bets.length > 0 && <span className="badge">{formatCoins(total)} 코인</span>}
      </div>
      {bets.length === 0 ? (
        <p className="muted small">아직 베팅이 없습니다.</p>
      ) : (
        <ul className="bet-list">
          {bets.map((bet) => {
            const sel = { kind: bet.kind as BetKind, picks: bet.picks };
            const hit = order ? isHit(sel, order) : null;
            return (
              <li key={bet.id} className={hit === null ? "" : hit ? "hit" : "miss"}>
                <span className="bet-kind">{BET_META[sel.kind]?.label ?? bet.kind}</span>
                <span className="bet-desc">{describeBet(sel, names)}</span>
                <span className="bet-amount">
                  {formatCoins(bet.amount)} × {bet.odds.toFixed(2)}
                </span>
                {hit !== null && (
                  <span className="bet-result">
                    {hit ? `+${formatCoins(Math.floor(bet.amount * bet.odds))}` : "낙첨"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 이번 회차에 내가 건 것 (홀짝) */
export function MyOddEvenBets({ bets, drawn }: { bets: PlacedBet[]; drawn: number | null }) {
  const total = bets.reduce((sum, b) => sum + b.amount, 0);
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>이번 회차 내 베팅</h2>
        {bets.length > 0 && <span className="badge">{formatCoins(total)} 코인</span>}
      </div>
      {bets.length === 0 ? (
        <p className="muted small">아직 베팅이 없습니다.</p>
      ) : (
        <ul className="bet-list">
          {bets.map((bet) => {
            const meta = ODDEVEN_BETS[bet.kind as OddEvenKind];
            const hit =
              drawn === null
                ? null
                : hitOddEven(bet.kind as OddEvenKind, drawn % 2 === 1, drawn > 50);
            return (
              <li key={bet.id} className={hit === null ? "" : hit ? "hit" : "miss"}>
                <span className="bet-kind">{meta?.group ?? ""}</span>
                <span className="bet-desc">{meta?.label ?? bet.kind}</span>
                <span className="bet-amount">
                  {formatCoins(bet.amount)} × {bet.odds.toFixed(2)}
                </span>
                {hit !== null && (
                  <span className="bet-result">
                    {hit ? `+${formatCoins(Math.floor(bet.amount * bet.odds))}` : "낙첨"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function hitOddEven(kind: OddEvenKind, odd: boolean, high: boolean): boolean {
  switch (kind) {
    case "odd":
      return odd;
    case "even":
      return !odd;
    case "high":
      return high;
    case "low":
      return !high;
    case "oh":
      return odd && high;
    case "ol":
      return odd && !high;
    case "eh":
      return !odd && high;
    case "el":
      return !odd && !high;
  }
}

function summaryText(game: GameId, summary: number[] | undefined): string {
  const s = summary ?? [];
  if (s.length === 0) return "-";
  if (game === "oddeven") {
    const n = s[0];
    return `${n} (${n % 2 === 1 ? "홀" : "짝"}·${n > 50 ? "대" : "소"})`;
  }
  if (game === "crash") return formatMult(s[0]);
  if (game === "bingo") return `${s.length}개 추첨`;
  if (game === "triple") {
    if (s[1] > 0) return `보너스 ${s[1]}등`;
    return s[0] > 0 ? `${s[0]}등` : "꽝";
  }
  return s.map((lane) => lane + 1).join(" → ");
}

/** 모든 게임의 결과가 시간순으로 섞여서 쌓인다. 처음엔 5개만 보여준다. */
const PREVIEW = 5;

export function History({ results }: { results: RoundResult[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? results : results.slice(0, PREVIEW);
  const hidden = results.length - shown.length;

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>지난 회차</h2>
        {results.length > 0 && <span className="badge badge-muted">{results.length}건</span>}
      </div>
      {results.length === 0 ? (
        <p className="muted small">기록이 없습니다.</p>
      ) : (
        <>
          <ul className="history">
            {shown.map((r) => {
              const net = r.returned - r.staked;
              return (
                <li key={`${r.game}_${r.roundId}`}>
                  <span title={r.game}>{GAME_ICON[r.game] ?? "🎲"}</span>
                  <span className="history-order">{summaryText(r.game, r.summary)}</span>
                  <span className={net >= 0 ? "net-up" : "net-down"}>
                    {net >= 0 ? "+" : ""}
                    {formatCoins(net)}
                  </span>
                </li>
              );
            })}
          </ul>
          {(hidden > 0 || expanded) && (
            <button type="button" className="more-btn" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "접기" : `더보기 (${hidden}건)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
