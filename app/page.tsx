"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import { History, MyBets } from "@/components/BetList";
import { RoundHeader } from "@/components/RoundHeader";
import { BetPanel } from "@/components/BetPanel";
import { Fairness } from "@/components/Fairness";
import { GameShell } from "@/components/GameShell";
import { Track } from "@/components/Track";
import type { BetKind } from "@/lib/bets";
import { api, useMe, useRound } from "@/lib/client";
import { FIELD, type Phase } from "@/lib/config";
import { SNAIL_FINISH_AT, SNAIL_RESULT_AT, SNAIL_ROUND_MS, SNAIL_TIMING } from "@/lib/games/snail";
import { simulate } from "@/lib/race";

const PHASE_LABEL: Record<Phase, string> = {
  betting: "베팅 접수 중",
  racing: "경주 진행 중",
  result: "결과 발표",
};

export default function SnailPage() {
  const router = useRouter();
  const { round, prev, elapsed, error: roundError } = useRound("snail");
  const redirect = useCallback(() => router.replace("/login"), [router]);
  const { me, notice, setNotice, fatal, loadMe } = useMe("snail", round?.id, redirect);

  const shownPhase: Phase =
    elapsed < SNAIL_TIMING.betMs ? "betting" : elapsed < SNAIL_RESULT_AT ? "racing" : "result";

  useEffect(() => {
    if (shownPhase !== "result") return;
    const t = setTimeout(loadMe, 800);
    return () => clearTimeout(t);
  }, [shownPhase, round?.id, loadMe]);

  // 시뮬레이션 길이가 몇 초든 raceMs 안에 다 재생한다.
  const secretSeed = round?.secretSeed ?? null;
  const racers = round?.data.game === "snail" ? round.data.racers : undefined;
  const outcome = useMemo(
    () => (secretSeed && racers ? simulate(racers, secretSeed, true) : null),
    [secretSeed, racers]
  );

  const raceElapsed = elapsed - SNAIL_TIMING.betMs;
  const progress = useMemo(() => {
    if (!outcome || raceElapsed <= 0) return new Array(FIELD).fill(0);
    const last = outcome.frames.length - 1;
    const t = Math.min(1, raceElapsed / SNAIL_TIMING.raceMs) * last;
    const i = Math.min(last, Math.floor(t));
    const next = Math.min(last, i + 1);
    const f = t - i;
    return outcome.frames[i].map((v, lane) => v + (outcome.frames[next][lane] - v) * f);
  }, [outcome, raceElapsed]);

  const raceOver = Boolean(outcome) && elapsed >= SNAIL_FINISH_AT;
  const shownOrder = raceOver && outcome ? outcome.order : null;

  const shownRemaining = Math.max(
    0,
    shownPhase === "betting"
      ? SNAIL_TIMING.betMs - elapsed
      : shownPhase === "racing"
        ? SNAIL_RESULT_AT - elapsed
        : SNAIL_ROUND_MS - elapsed
  );

  const picked = useMemo(() => {
    const set = new Set<number>();
    for (const bet of me?.bets ?? []) for (const p of bet.picks) set.add(p);
    return set;
  }, [me?.bets]);

  const placeBet = useCallback(
    async (kind: BetKind, picks: number[], amount: number) => {
      if (!round) throw new Error("회차 정보를 기다리는 중입니다.");
      await api("/api/bet", {
        method: "POST",
        body: JSON.stringify({ game: "snail", roundId: round.id, kind, picks, amount }),
      });
      await loadMe();
    },
    [round, loadMe]
  );

  if (fatal) return <main className="center-screen">{fatal}</main>;
  if (!round || round.data.game !== "snail" || !me) {
    return <main className="center-screen">{roundError ?? "불러오는 중…"}</main>;
  }

  const data = round.data;
  const phaseProgress =
    shownPhase === "betting"
      ? 1 - shownRemaining / SNAIL_TIMING.betMs
      : shownPhase === "racing"
        ? Math.min(1, raceElapsed / SNAIL_TIMING.raceMs)
        : 1;

  return (
    <GameShell me={me} notice={notice} onDismissNotice={() => setNotice(null)}>
      <main className="layout">
        <section className="stage">
          <RoundHeader
            roundId={round.id}
            phase={shownPhase}
            label={PHASE_LABEL[shownPhase]}
            remaining={shownRemaining}
            progress={phaseProgress}
          />

          <Track
            racers={data.racers}
            progress={progress}
            order={shownOrder}
            finished={raceOver}
            picked={picked}
          />

          {shownPhase === "result" && shownOrder && (
            <div className="result-strip">
              {shownOrder.slice(0, 3).map((lane, i) => (
                <span key={lane}>
                  <b>{i + 1}등</b> {data.racers[lane].char.name}
                </span>
              ))}
            </div>
          )}
        </section>

        <aside className="side">
          <BetPanel
            racers={data.racers}
            odds={data.odds}
            balance={me.user.balance}
            open={shownPhase === "betting"}
            onPlace={placeBet}
          />
          <MyBets bets={me.bets} racers={data.racers} order={shownOrder} />
        </aside>

        <section className="bottom">
          <History results={me.results} />
          {prev && <Fairness round={round} prev={prev} />}
        </section>
      </main>
    </GameShell>
  );
}
