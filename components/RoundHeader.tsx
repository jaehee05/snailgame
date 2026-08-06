"use client";

import { formatClock } from "@/lib/client";

/** 네 게임이 공유하는 회차 번호 · 단계 · 카운트다운 · 진행 막대 */
export function RoundHeader({
  roundId,
  phase,
  label,
  remaining,
  progress,
}: {
  roundId: number;
  phase: "betting" | "racing" | "result";
  label: string;
  remaining: number;
  progress: number;
}) {
  return (
    <>
      <div className="stage-head">
        <div>
          <span className="round-no">#{roundId}</span>
          <span className={`phase phase-${phase}`}>{label}</span>
        </div>
        <span className={`clock${remaining < 5000 && phase === "betting" ? " is-urgent" : ""}`}>
          {formatClock(remaining)}
        </span>
      </div>
      <div className="phase-bar">
        <div style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </div>
    </>
  );
}
