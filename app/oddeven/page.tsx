"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { History, MyOddEvenBets } from "@/components/BetList";
import { Fairness } from "@/components/Fairness";
import { GameShell } from "@/components/GameShell";
import { api, formatClock, formatCoins, useMe, useRound } from "@/lib/client";
import { MIN_BET } from "@/lib/config";
import {
  ODDEVEN_BETS,
  ODDEVEN_KINDS,
  ODDEVEN_SETTLE_AT,
  ODDEVEN_TIMING,
  oddEvenOutcome,
  rollingNumber,
  type OddEvenKind,
} from "@/lib/games/oddeven";

const CHIPS = [100, 500, 1_000, 5_000, 10_000];

type Phase = "betting" | "drawing" | "result";

export default function OddEvenPage() {
  const router = useRouter();
  const { round, prev, elapsed, error: roundError } = useRound("oddeven");
  const redirect = useCallback(() => router.replace("/login"), [router]);
  const { me, notice, setNotice, fatal, loadMe } = useMe("oddeven", round?.id, redirect);

  const [kind, setKind] = useState<OddEvenKind>("odd");
  const [amount, setAmount] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phase: Phase =
    elapsed < ODDEVEN_TIMING.betMs
      ? "betting"
      : elapsed < ODDEVEN_SETTLE_AT
        ? "drawing"
        : "result";

  useEffect(() => {
    if (phase !== "result") return;
    const t = setTimeout(loadMe, 800);
    return () => clearTimeout(t);
  }, [phase, round?.id, loadMe]);

  // 시드가 공개되면 브라우저가 직접 숫자를 계산한다. 서버에 다시 묻지 않는다.
  const secretSeed = round?.secretSeed ?? null;
  const drawn = useMemo(() => (secretSeed ? oddEvenOutcome(secretSeed) : null), [secretSeed]);

  const display = useMemo(() => {
    if (!drawn) return null;
    if (phase === "result") return drawn.number;
    return rollingNumber(secretSeed!, elapsed - ODDEVEN_TIMING.betMs, drawn.number);
  }, [drawn, phase, elapsed, secretSeed]);

  const remaining = Math.max(
    0,
    phase === "betting"
      ? ODDEVEN_TIMING.betMs - elapsed
      : phase === "drawing"
        ? ODDEVEN_SETTLE_AT - elapsed
        : ODDEVEN_TIMING.roundMs - elapsed
  );

  async function submit() {
    if (busy || !round) return;
    if (amount < MIN_BET) return setError(`최소 ${formatCoins(MIN_BET)} 코인부터 걸 수 있습니다.`);
    if (me && amount > me.user.balance) return setError("잔액이 부족합니다.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/bet", {
        method: "POST",
        body: JSON.stringify({ game: "oddeven", roundId: round.id, kind, picks: [], amount }),
      });
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "베팅에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (fatal) return <main className="center-screen">{fatal}</main>;
  if (!round || !me) return <main className="center-screen">{roundError ?? "불러오는 중…"}</main>;

  const open = phase === "betting";
  const settled = phase === "result" && drawn;

  return (
    <GameShell me={me} notice={notice} onDismissNotice={() => setNotice(null)}>
      <main className="layout">
        <section className="stage">
          <div className="stage-head">
            <div>
              <span className="round-no">#{round.id}</span>
              <span className={`phase phase-${open ? "betting" : phase === "drawing" ? "racing" : "result"}`}>
                {open ? "베팅 접수 중" : phase === "drawing" ? "추첨 중" : "결과 발표"}
              </span>
            </div>
            <span className="clock">{formatClock(remaining)}</span>
          </div>

          <div className="draw-stage">
            <div className={`draw-ball${phase === "drawing" ? " is-rolling" : ""}`}>
              {display ?? "?"}
            </div>
            {settled && (
              <div className="draw-tags">
                <span className={drawn.odd ? "tag-on" : ""}>{drawn.odd ? "홀" : "짝"}</span>
                <span className={drawn.high ? "tag-on" : ""}>{drawn.high ? "대" : "소"}</span>
              </div>
            )}
            {!settled && <p className="muted small">1~100 중 한 숫자를 뽑습니다</p>}
          </div>
        </section>

        <aside className="side">
          <div className={`panel${open ? "" : " panel-locked"}`}>
            <div className="panel-title">
              <h2>베팅</h2>
              {!open && <span className="badge badge-muted">마감</span>}
            </div>

            <div className="oe-grid">
              {ODDEVEN_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={!open}
                  className={`oe-pick${k === kind ? " is-picked" : ""}${
                    ODDEVEN_BETS[k].group === "조합" ? " oe-combo" : ""
                  }`}
                  onClick={() => {
                    setKind(k);
                    setError(null);
                  }}
                >
                  <strong>{ODDEVEN_BETS[k].label}</strong>
                  <small>{ODDEVEN_BETS[k].odds.toFixed(2)}배</small>
                </button>
              ))}
            </div>

            <p className="kind-desc">{ODDEVEN_BETS[kind].desc}</p>

            <div className="amount-row">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  disabled={!open}
                  onClick={() => setAmount((a) => Math.min(me.user.balance, a + c))}
                >
                  +{formatCoins(c)}
                </button>
              ))}
              <button
                type="button"
                className="chip chip-ghost"
                disabled={!open}
                onClick={() => setAmount(MIN_BET)}
              >
                초기화
              </button>
            </div>

            <label className="amount-input">
              <span>베팅 금액</span>
              <input
                type="number"
                min={MIN_BET}
                step={100}
                value={amount}
                disabled={!open}
                onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
              <button
                type="button"
                className="chip"
                disabled={!open}
                onClick={() => setAmount(me.user.balance)}
              >
                올인
              </button>
            </label>

            <div className="payout-preview">
              <span>
                배당 <strong>{ODDEVEN_BETS[kind].odds.toFixed(2)}배</strong>
              </span>
              <span>
                적중 시 <strong>{formatCoins(Math.floor(amount * ODDEVEN_BETS[kind].odds))}</strong>{" "}
                코인
              </span>
            </div>

            {error && <p className="error">{error}</p>}

            <button type="button" className="primary" disabled={!open || busy} onClick={submit}>
              {busy ? "접수 중…" : "베팅하기"}
            </button>
          </div>

          <MyOddEvenBets bets={me.bets} drawn={settled ? drawn.number : null} />
        </aside>

        <section className="bottom">
          <History results={me.results} />
          {prev && <Fairness round={round} prev={prev} />}
        </section>
      </main>
    </GameShell>
  );
}
