"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BetAmount } from "@/components/BetAmount";
import { History } from "@/components/BetList";
import { Fairness } from "@/components/Fairness";
import { GameShell } from "@/components/GameShell";
import { GameSkeleton } from "@/components/Skeleton";
import { RoundHeader } from "@/components/RoundHeader";
import { api, formatClock, formatCoins, formatMult, useMe, useRound } from "@/lib/client";
import { MIN_BET } from "@/lib/config";
import {
  CRASH_TIMING,
  crashPointOf,
  MAX_MULT,
  MIN_AUTO_CASHOUT,
  multAt,
  timeOfMult,
} from "@/lib/games/crash";

const AUTO_PRESETS = [1.3, 1.5, 2, 3, 5];

export default function CrashPage() {
  const router = useRouter();
  const { round, prev, elapsed, error: roundError } = useRound("crash");
  const redirect = useCallback(() => router.replace("/login"), [router]);
  const { me, notice, setNotice, fatal, loadMe } = useMe("crash", round?.id, redirect);

  // 기본값은 비워 둔다 (입력칸에 "금액 입력" 안내만 뜬다)
  const [amount, setAmount] = useState(0);
  const [useAuto, setUseAuto] = useState(false);
  const [autoTarget, setAutoTarget] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 시드가 공개되면 브라우저가 직접 터지는 지점을 계산한다.
  const secretSeed = round?.secretSeed ?? null;
  const crashPoint = useMemo(() => (secretSeed ? crashPointOf(secretSeed) : null), [secretSeed]);
  const crashAt = crashPoint === null ? null : CRASH_TIMING.betMs + timeOfMult(crashPoint);

  const runElapsed = elapsed - CRASH_TIMING.betMs;
  const roundEnd = round ? round.endAt - round.start : CRASH_TIMING.betMs + CRASH_TIMING.runMs;
  // 터지고 5초 뒤면 회차가 닫히고 바로 다음 판 출발 대기로 넘어간다.
  const open = elapsed < CRASH_TIMING.betMs;
  const crashed = crashAt !== null && elapsed >= crashAt;
  const running = !open && !crashed;

  const liveMult = crashed
    ? (crashPoint ?? 1)
    : Math.min(crashPoint ?? MAX_MULT, multAt(Math.max(0, runElapsed)));

  const myBet = (me?.bets ?? []).find((b) => b.roundId === round?.id) ?? null;
  const cashedOut = myBet?.cashoutMult ?? null;

  useEffect(() => {
    if (!crashed) return;
    const t = setTimeout(loadMe, 800);
    return () => clearTimeout(t);
  }, [crashed, round?.id, loadMe]);

  const remaining = Math.max(
    0,
    open
      ? CRASH_TIMING.betMs - elapsed
      : crashed
        ? roundEnd - elapsed
        : (crashAt ?? CRASH_TIMING.betMs) - elapsed
  );

  // 곡선을 지금까지 그려진 만큼만 그린다.
  const curve = useMemo(() => {
    if (runElapsed <= 0) return "";
    const shown = Math.min(runElapsed, crashAt ? crashAt - CRASH_TIMING.betMs : runElapsed);
    const xMax = Math.max(4000, shown * 1.15);
    const yMax = Math.max(2, liveMult * 1.15);
    const pts: string[] = [];
    for (let t = 0; t <= shown; t += 80) {
      const m = Math.min(liveMult, multAt(t));
      pts.push(`${((t / xMax) * 100).toFixed(2)},${(60 - ((m - 1) / (yMax - 1)) * 58).toFixed(2)}`);
    }
    return pts.join(" ");
  }, [runElapsed, liveMult, crashAt]);

  async function bet() {
    if (busy || !round) return;
    if (amount < MIN_BET) return setError(`최소 ${formatCoins(MIN_BET)} 코인부터 걸 수 있습니다.`);
    if (me && amount > me.user.balance) return setError("잔액이 부족합니다.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/bet", {
        method: "POST",
        body: JSON.stringify({
          game: "crash",
          roundId: round.id,
          kind: "ride",
          picks: [],
          amount,
          ...(useAuto ? { autoTarget } : {}),
        }),
      });
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "베팅에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function cashout() {
    if (busy || !round) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ mult: number; payout: number }>("/api/cashout", {
        method: "POST",
        body: JSON.stringify({ roundId: round.id }),
      });
      setNotice(`${formatMult(res.mult)}에 인출 · +${formatCoins(res.payout)} 코인`);
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인출에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (fatal) return <GameSkeleton message={fatal} />;
  if (!round || !me) return <GameSkeleton message={roundError ?? undefined} />;

  return (
    <GameShell me={me} notice={notice} onDismissNotice={() => setNotice(null)}>
      <main className="layout">
        <section className="stage">
          <RoundHeader
            roundId={round.id}
            phase={open ? "betting" : crashed ? "result" : "racing"}
            label={open ? "베팅 접수 중" : crashed ? "종료" : "상승 중"}
            remaining={remaining}
            progress={
              open
                ? 1 - remaining / CRASH_TIMING.betMs
                : Math.min(1, runElapsed / CRASH_TIMING.runMs)
            }
          />

          <div className={`crash-stage${crashed ? " is-crashed" : ""}`}>
            <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="crash-chart">
              {[2, 4, 6, 8].map((g) => (
                <line key={g} x1="0" x2="100" y1={g * 7} y2={g * 7} className="crash-grid" />
              ))}
              {curve && <polyline points={curve} className="crash-line" />}
            </svg>
            <div className="crash-mult">
              {open ? (
                <>
                  <span className="crash-wait">출발 대기</span>
                  <small className="muted">{formatClock(remaining)} 후 시작</small>
                </>
              ) : (
                <>
                  <span className={crashed ? "crash-boom" : ""}>{formatMult(liveMult)}</span>
                  {crashed && <small className="crash-boom-label">터짐</small>}
                </>
              )}
            </div>
          </div>

          {crashed && myBet && (
            <div className="result-strip">
              {cashedOut ? (
                <span>
                  <b>인출</b> {formatMult(cashedOut)} · +
                  {formatCoins(Math.floor(myBet.amount * cashedOut))} 코인
                </span>
              ) : myBet.autoTarget && crashPoint && crashPoint >= myBet.autoTarget ? (
                <span>
                  <b>자동 인출</b> {formatMult(myBet.autoTarget)} · +
                  {formatCoins(Math.floor(myBet.amount * myBet.autoTarget))} 코인
                </span>
              ) : (
                <span>
                  <b>실패</b> {formatCoins(myBet.amount)} 코인 잃음
                </span>
              )}
            </div>
          )}
        </section>

        <aside className="side">
          <div className={`panel${open || running ? "" : " panel-locked"}`}>
            <div className="panel-title">
              <h2>베팅</h2>
              {!open && <span className="badge badge-muted">마감</span>}
            </div>

            {myBet ? (
              <div className="crash-mine">
                <div className="crash-mine-row">
                  <span className="muted small">태운 금액</span>
                  <strong>{formatCoins(myBet.amount)}</strong>
                </div>
                {myBet.autoTarget && (
                  <div className="crash-mine-row">
                    <span className="muted small">자동 인출</span>
                    <strong>{formatMult(myBet.autoTarget)}</strong>
                  </div>
                )}
                {cashedOut && (
                  <div className="crash-mine-row">
                    <span className="muted small">인출 완료</span>
                    <strong className="net-up">{formatMult(cashedOut)}</strong>
                  </div>
                )}
              </div>
            ) : (
              <>
                <BetAmount
                  amount={amount}
                  setAmount={setAmount}
                  balance={me.user.balance}
                  disabled={!open}
                />

                <label className="auto-toggle">
                  <input
                    type="checkbox"
                    checked={useAuto}
                    disabled={!open}
                    onChange={(e) => setUseAuto(e.target.checked)}
                  />
                  <span>자동 인출 사용</span>
                </label>

                {useAuto && (
                  <>
                    <div className="amount-row">
                      {AUTO_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`chip${autoTarget === p ? " is-admin" : ""}`}
                          disabled={!open}
                          onClick={() => setAutoTarget(p)}
                        >
                          {p.toFixed(2)}배
                        </button>
                      ))}
                    </div>
                    <label className="amount-input">
                      <span>배수</span>
                      <input
                        type="number"
                        min={MIN_AUTO_CASHOUT}
                        max={MAX_MULT}
                        step={0.1}
                        value={autoTarget}
                        disabled={!open}
                        onChange={(e) => setAutoTarget(Number(e.target.value) || MIN_AUTO_CASHOUT)}
                      />
                    </label>
                  </>
                )}
              </>
            )}

            {error && <p className="error">{error}</p>}

            {running && myBet && !cashedOut ? (
              <button type="button" className="primary cashout" disabled={busy} onClick={cashout}>
                {busy ? "…" : `지금 인출 · ${formatMult(liveMult)}`}
              </button>
            ) : (
              !myBet && (
                <button type="button" className="primary" disabled={!open || busy} onClick={bet}>
                  {busy ? "접수 중…" : "태우기"}
                </button>
              )
            )}

            <p className="muted small">
              최대 {MAX_MULT}배. 인출하지 못하면 판돈을 모두 잃습니다. 회차당 한 번만 태울 수
              있습니다.
            </p>
          </div>
        </aside>

        <section className="bottom">
          <History results={me.results} />
          {prev && <Fairness round={round} prev={prev} />}
        </section>
      </main>
    </GameShell>
  );
}
