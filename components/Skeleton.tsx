"use client";

import { GameShell } from "./GameShell";

/** 데이터가 오기 전까지 자리를 잡아 두는 뼈대. 빈 화면보다 덜 답답하다. */
export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: string }) {
  return <span className="sk" style={{ height: h, width: w }} />;
}

export function GameSkeleton({ message }: { message?: string }) {
  return (
    <GameShell me={null} notice={null} onDismissNotice={() => {}}>
      <main className="layout">
        <section className="stage">
          <div className="stage-head">
            <Skeleton h={14} w="120px" />
            <Skeleton h={26} w="72px" />
          </div>
          <div className="sk-stack" style={{ marginTop: 18 }}>
            <Skeleton h={38} />
            <Skeleton h={38} />
            <Skeleton h={38} />
            <Skeleton h={38} />
          </div>
        </section>
        <aside className="side">
          <div className="panel sk-stack">
            <Skeleton h={14} w="60px" />
            <Skeleton h={46} />
            <Skeleton h={70} />
            <Skeleton h={44} />
          </div>
        </aside>
      </main>
      {message && <p className="sk-note">{message}</p>}
    </GameShell>
  );
}
