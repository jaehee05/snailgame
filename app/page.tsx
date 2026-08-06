"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BetPanel } from "@/components/BetPanel";
import { History, MyBets } from "@/components/BetList";
import { Fairness } from "@/components/Fairness";
import { Track } from "@/components/Track";
import type { BetKind } from "@/lib/bets";
import { formatClock, formatCoins, useAuth, useRound, type MeState } from "@/lib/client";
import { BET_MS, FIELD, TICK_MS } from "@/lib/config";
import { simulate } from "@/lib/race";
import { auth } from "@/lib/firebase-client";

const PHASE_LABEL = {
  betting: "베팅 접수 중",
  racing: "경주 진행 중",
  result: "결과 확인",
} as const;

export default function GamePage() {
  const router = useRouter();
  const { user, ready, api } = useAuth();
  const { round, prev, elapsed, phase, remaining, error: roundError } = useRound();
  const [me, setMe] = useState<MeState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  const loadMe = useCallback(async () => {
    if (!auth.currentUser) return;
    const pendingNick = sessionStorage.getItem("snail:nick");
    const query = pendingNick ? `?nick=${encodeURIComponent(pendingNick)}` : "";
    try {
      const data = await api<MeState>(`/api/me${query}`);
      sessionStorage.removeItem("snail:nick");
      setMe(data);
      if (data.justSettled.length > 0) {
        const net = data.justSettled.reduce((s, r) => s + r.returned - r.staked, 0);
        setNotice(
          net >= 0
            ? `지난 회차 정산: +${formatCoins(net)} 코인`
            : `지난 회차 정산: ${formatCoins(net)} 코인`
        );
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "상태를 불러오지 못했습니다.");
    }
  }, [api]);

  // 로그인 직후, 회차가 바뀔 때, 결과가 나온 직후에 상태를 다시 맞춘다.
  // (loadMe 는 서버 응답을 받은 뒤에야 setState 하므로 동기 setState 가 아니다)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    if (user) loadMe();
  }, [user, loadMe]);

  const roundId = round?.id;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    if (user && roundId !== undefined) loadMe();
  }, [user, roundId, loadMe]);

  useEffect(() => {
    if (!user || phase !== "result") return;
    const t = setTimeout(loadMe, 1200);
    return () => clearTimeout(t);
  }, [user, phase, roundId, loadMe]);

  // 비공개 시드가 공개되는 순간(= 베팅 마감) 경주 전체를 미리 계산해 두고 그대로 재생한다.
  const secretSeed = round?.secretSeed ?? null;
  const racers = round?.racers;
  const outcome = useMemo(
    () => (secretSeed && racers ? simulate(racers, secretSeed, true) : null),
    [secretSeed, racers]
  );

  const raceElapsed = elapsed - BET_MS;
  const progress = useMemo(() => {
    if (!outcome || raceElapsed <= 0) return new Array(FIELD).fill(0);
    const t = raceElapsed / TICK_MS;
    const i = Math.min(outcome.frames.length - 1, Math.floor(t));
    const next = Math.min(outcome.frames.length - 1, i + 1);
    const f = t - Math.floor(t);
    return outcome.frames[i].map((v, lane) => v + (outcome.frames[next][lane] - v) * f);
  }, [outcome, raceElapsed]);

  const raceOver =
    Boolean(outcome) && (phase === "result" || raceElapsed >= outcome!.ticks * TICK_MS);
  const shownOrder = raceOver && outcome ? outcome.order : null;

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
        body: JSON.stringify({ roundId: round.id, kind, picks, amount }),
      });
      await loadMe();
    },
    [api, round, loadMe]
  );

  if (!ready || !user) {
    return <main className="center-screen">불러오는 중…</main>;
  }

  if (!round) {
    return (
      <main className="center-screen">
        {roundError ?? "회차 정보를 불러오는 중…"}
      </main>
    );
  }

  const phaseProgress =
    phase === "betting"
      ? 1 - remaining / BET_MS
      : phase === "racing"
        ? Math.min(1, raceElapsed / (outcome ? outcome.ticks * TICK_MS : 1))
        : 1;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🐌</span>
          <div>
            <strong>달팽이 레이싱</strong>
            <small>가상 코인 · 친구들끼리</small>
          </div>
        </div>
        <div className="topbar-right">
          <div className="balance">
            <small>보유 코인</small>
            <strong>{me ? formatCoins(me.user.balance) : "—"}</strong>
          </div>
          <div className="whoami">
            <span>{me?.user.nick ?? user.email}</span>
            <div className="links">
              {me?.user.isAdmin && <Link href="/admin">관리자</Link>}
              <button type="button" onClick={() => auth.signOut()}>
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)} role="status">
          {notice}
        </div>
      )}

      <main className="layout">
        <section className="stage">
          <div className="stage-head">
            <div>
              <span className="round-no">#{round.id}</span>
              <span className={`phase phase-${phase}`}>{PHASE_LABEL[phase]}</span>
            </div>
            <span className="clock">{formatClock(remaining)}</span>
          </div>
          <div className="phase-bar">
            <div style={{ width: `${Math.min(100, phaseProgress * 100)}%` }} />
          </div>

          <Track
            racers={round.racers}
            progress={progress}
            order={shownOrder}
            finished={raceOver}
            picked={picked}
          />

          {shownOrder && (
            <div className="result-strip">
              {shownOrder.slice(0, 3).map((lane, i) => (
                <span key={lane}>
                  <b>{i + 1}등</b> {round.racers[lane].char.name}
                </span>
              ))}
            </div>
          )}
        </section>

        <aside className="side">
          <BetPanel
            racers={round.racers}
            odds={round.odds}
            balance={me?.user.balance ?? 0}
            open={phase === "betting"}
            onPlace={placeBet}
          />
          <MyBets bets={me?.bets ?? []} racers={round.racers} order={shownOrder} />
        </aside>

        <section className="bottom">
          <History results={me?.results ?? []} />
          {prev && <Fairness round={round} prev={prev} />}
        </section>
      </main>
    </div>
  );
}
