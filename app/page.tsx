"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { History, MyBets } from "@/components/BetList";
import { BetPanel } from "@/components/BetPanel";
import { Fairness } from "@/components/Fairness";
import { Track } from "@/components/Track";
import type { BetKind } from "@/lib/bets";
import {
  api,
  formatClock,
  formatCoins,
  RequestError,
  useRound,
  type MeState,
} from "@/lib/client";
import { BET_MS, FIELD, FINISH_AT, RACE_MS, RESULT_AT, ROUND_MS, type Phase } from "@/lib/config";
import { simulate } from "@/lib/race";

const PHASE_LABEL: Record<Phase, string> = {
  betting: "베팅 접수 중",
  racing: "경주 진행 중",
  result: "결과 발표",
};

export default function GamePage() {
  const router = useRouter();
  const { round, prev, elapsed, error: roundError } = useRound();
  const [me, setMe] = useState<MeState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const loadedOnce = useRef(false);

  const loadMe = useCallback(async () => {
    try {
      const data = await api<MeState>("/api/me");
      loadedOnce.current = true;
      setMe(data);
      setFatal(null);
      if (data.justSettled.length > 0) {
        const net = data.justSettled.reduce((s, r) => s + r.returned - r.staked, 0);
        setNotice(`지난 회차 정산: ${net >= 0 ? "+" : ""}${formatCoins(net)} 코인`);
      }
    } catch (err) {
      if (err instanceof RequestError && err.status === 401) {
        router.replace("/login");
        return;
      }
      const message = err instanceof Error ? err.message : "상태를 불러오지 못했습니다.";
      // 아직 한 번도 못 불러왔다면 게임 화면 대신 오류를 보여준다.
      if (loadedOnce.current) setNotice(message);
      else setFatal(message);
    }
  }, [router]);

  // 첫 진입, 회차가 바뀔 때, 결과가 나온 직후에 상태를 다시 맞춘다.
  // (loadMe 는 서버 응답을 받은 뒤에야 setState 하므로 동기 setState 가 아니다)
  const roundId = round?.id;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    loadMe();
  }, [roundId, loadMe]);

  async function logout() {
    await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) });
    router.replace("/login");
  }

  // 비공개 시드가 공개되는 순간(= 베팅 마감) 경주 전체를 미리 계산해 두고 그대로 재생한다.
  const secretSeed = round?.secretSeed ?? null;
  const racers = round?.racers;
  const outcome = useMemo(
    () => (secretSeed && racers ? simulate(racers, secretSeed, true) : null),
    [secretSeed, racers]
  );

  // 시뮬레이션 길이가 몇 초든 RACE_MS 안에 다 재생한다.
  const raceElapsed = elapsed - BET_MS;
  const progress = useMemo(() => {
    if (!outcome || raceElapsed <= 0) return new Array(FIELD).fill(0);
    const last = outcome.frames.length - 1;
    const t = Math.min(1, raceElapsed / RACE_MS) * last;
    const i = Math.min(last, Math.floor(t));
    const next = Math.min(last, i + 1);
    const f = t - i;
    return outcome.frames[i].map((v, lane) => v + (outcome.frames[next][lane] - v) * f);
  }, [outcome, raceElapsed]);

  const raceOver = Boolean(outcome) && elapsed >= FINISH_AT;
  const shownOrder = raceOver && outcome ? outcome.order : null;

  const shownPhase: Phase =
    elapsed < BET_MS ? "betting" : elapsed < RESULT_AT ? "racing" : "result";

  const shownRemaining = Math.max(
    0,
    shownPhase === "betting"
      ? BET_MS - elapsed
      : shownPhase === "racing"
        ? RESULT_AT - elapsed
        : ROUND_MS - elapsed
  );

  // 결과가 발표되면 서버가 정산을 끝냈을 시점이므로 잔액을 다시 받아온다.
  useEffect(() => {
    if (shownPhase !== "result") return;
    const t = setTimeout(loadMe, 800);
    return () => clearTimeout(t);
  }, [shownPhase, roundId, loadMe]);

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
    [round, loadMe]
  );

  // 로그인 여부가 확인되기 전에는 게임 화면을 그리지 않는다.
  if (fatal) return <main className="center-screen">{fatal}</main>;
  if (!round || !me) {
    return <main className="center-screen">{roundError ?? "불러오는 중…"}</main>;
  }

  const phaseProgress =
    shownPhase === "betting"
      ? 1 - shownRemaining / BET_MS
      : shownPhase === "racing"
        ? Math.min(1, raceElapsed / RACE_MS)
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
            <span>{me?.user.nick ?? "…"}</span>
            <div className="links">
              {me?.user.isAdmin && <Link href="/admin">관리자</Link>}
              <button type="button" onClick={logout}>
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
              <span className={`phase phase-${shownPhase}`}>{PHASE_LABEL[shownPhase]}</span>
            </div>
            <span className="clock">{formatClock(shownRemaining)}</span>
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

          {shownPhase === "result" && shownOrder && (
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
            open={shownPhase === "betting"}
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
