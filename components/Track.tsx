"use client";

import type { Racer } from "@/lib/race";
import { SnailIcon } from "./SnailIcon";

const MEDALS = ["🥇", "🥈", "🥉", ""];

export function Track({
  racers,
  progress,
  order,
  finished,
  picked,
}: {
  racers: Racer[];
  progress: number[];
  /** 확정된 최종 순위 (경주 종료 후에만) */
  order: number[] | null;
  finished: boolean;
  /** 내가 베팅에 포함시킨 레인 */
  picked: Set<number>;
}) {
  // 경주 중에는 현재 위치로 임시 순위를 매긴다.
  const liveRank = racers
    .map((_, i) => i)
    .sort((a, b) => (progress[b] ?? 0) - (progress[a] ?? 0));

  return (
    <div className="track">
      {racers.map((racer, lane) => {
        const p = Math.min(1, Math.max(0, progress[lane] ?? 0));
        const rank = order ? order.indexOf(lane) : liveRank.indexOf(lane);
        return (
          <div key={racer.char.id} className={`lane${picked.has(lane) ? " lane-picked" : ""}`}>
            <div className="lane-head">
              <span className="lane-no">{lane + 1}</span>
              <span className="lane-name">{racer.char.name}</span>
              {finished && <span className="lane-medal">{MEDALS[rank] ?? ""}</span>}
            </div>
            <div className="lane-strip">
              <div className="lane-fill" style={{ width: `${p * 100}%` }} />
              <div
                className="runner"
                style={{ left: `${p * 100}%`, transform: `translateX(-${p * 100}%)` }}
              >
                <SnailIcon color={racer.char.color} shell={racer.char.shell} size={30} />
              </div>
              <div className="lane-goal" />
            </div>
            <div className="lane-rank">{finished ? `${rank + 1}등` : `${Math.round(p * 100)}%`}</div>
          </div>
        );
      })}
    </div>
  );
}
