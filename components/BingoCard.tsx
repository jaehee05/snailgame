"use client";

import {
  bestRank,
  CARD_SIZE,
  cardFromPicks,
  COLUMN_LABELS,
  FREE_CELL,
  patternOf,
} from "@/lib/games/bingo";

/**
 * 구입한 한 장. 맞은 칸은 주황, 패턴이 완성되면 그 패턴 칸이 빨강으로 바뀐다.
 */
export function BingoCard({
  picks,
  drawn,
  compact,
}: {
  picks: number[];
  drawn: Set<number>;
  compact?: boolean;
}) {
  const card = cardFromPicks(picks);
  const rank = bestRank(picks, drawn);
  const winCells = new Set(rank > 0 ? (patternOf(rank)?.cells ?? []) : []);

  return (
    <div className={`bcard${compact ? " is-compact" : ""}${rank > 0 ? " is-win" : ""}`}>
      <div className="bcard-head">
        {COLUMN_LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div
        className="bcard-grid"
        style={{ gridTemplateColumns: `repeat(${CARD_SIZE}, 1fr)` }}
      >
        {card.map((n, i) => {
          if (i === FREE_CELL) {
            return (
              <div key={i} className="bcell is-free">
                F
              </div>
            );
          }
          const hit = n !== null && drawn.has(n);
          const win = winCells.has(i);
          return (
            <div key={i} className={`bcell${hit ? " is-hit" : ""}${win ? " is-win" : ""}`}>
              {n}
            </div>
          );
        })}
      </div>
      {rank > 0 && (
        <div className="bcard-rank">
          {rank}등 {patternOf(rank)?.name}
        </div>
      )}
    </div>
  );
}
