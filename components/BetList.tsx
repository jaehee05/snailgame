"use client";

import { BET_META, describeBet, type PlacedBet } from "@/lib/bets";
import { formatCoins, type MeState } from "@/lib/client";
import type { Racer } from "@/lib/race";

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
            const hit = order ? isWinning(bet, order) : null;
            return (
              <li key={bet.id} className={hit === null ? "" : hit ? "hit" : "miss"}>
                <span className="bet-kind">{BET_META[bet.kind].label}</span>
                <span className="bet-desc">{describeBet(bet, names)}</span>
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

function isWinning(bet: PlacedBet, order: number[]): boolean {
  const [a, b, c] = bet.picks;
  switch (bet.kind) {
    case "win":
      return order[0] === a;
    case "place":
      return order.indexOf(a) < 2;
    case "quinella":
      return order.slice(0, 2).includes(a) && order.slice(0, 2).includes(b);
    case "exacta":
      return order[0] === a && order[1] === b;
    case "trifecta":
      return order[0] === a && order[1] === b && order[2] === c;
    default:
      return false;
  }
}

export function History({ results }: { results: MeState["results"] }) {
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>지난 회차</h2>
      </div>
      {results.length === 0 ? (
        <p className="muted small">기록이 없습니다.</p>
      ) : (
        <ul className="history">
          {results.map((r) => {
            const net = r.returned - r.staked;
            return (
              <li key={r.roundId}>
                <span className="mono muted">#{r.roundId}</span>
                <span className="history-order">
                  {r.order.map((lane) => lane + 1).join(" → ")}
                </span>
                <span className={net >= 0 ? "net-up" : "net-down"}>
                  {net >= 0 ? "+" : ""}
                  {formatCoins(net)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
