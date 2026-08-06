"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BetAmount } from "@/components/BetAmount";
import { History } from "@/components/BetList";
import { Fairness } from "@/components/Fairness";
import { GameShell } from "@/components/GameShell";
import { RoundHeader } from "@/components/RoundHeader";
import { api, formatCoins, useMe, useRound } from "@/lib/client";
import { MIN_BET } from "@/lib/config";
import {
  ballTimeOf,
  BINGO_BETS,
  BINGO_KINDS,
  BINGO_SETTLE_AT,
  BINGO_TIMING,
  CARD_SIZE,
  completedLines,
  drawBalls,
  LINES,
  type BingoKind,
} from "@/lib/games/bingo";

export default function BingoPage() {
  const router = useRouter();
  const { round, prev, elapsed, error: roundError } = useRound("bingo");
  const redirect = useCallback(() => router.replace("/login"), [router]);
  const { me, notice, setNotice, fatal, loadMe } = useMe("bingo", round?.id, redirect);

  const [kind, setKind] = useState<BingoKind>("l2");
  const [amount, setAmount] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = elapsed < BINGO_TIMING.betMs;
  const done = elapsed >= BINGO_SETTLE_AT;

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(loadMe, 800);
    return () => clearTimeout(t);
  }, [done, round?.id, loadMe]);

  const secretSeed = round?.secretSeed ?? null;
  const balls = useMemo(() => (secretSeed ? drawBalls(secretSeed) : []), [secretSeed]);

  // 공은 시간에 따라 하나씩 나온다.
  const shown = useMemo(() => {
    if (balls.length === 0) return [];
    return balls.filter((_, i) => elapsed >= ballTimeOf(i));
  }, [balls, elapsed]);

  const cardData = round?.data.game === "bingo" ? round.data.card : undefined;
  const card = useMemo(() => cardData ?? [], [cardData]);
  const drawnSet = useMemo(() => new Set(shown), [shown]);
  const lines = useMemo(
    () => (card.length ? completedLines(card, drawnSet) : []),
    [card, drawnSet]
  );
  const litCells = useMemo(() => {
    const set = new Set<number>();
    for (const li of lines) for (const cell of LINES[li]) set.add(cell);
    return set;
  }, [lines]);

  const remaining = Math.max(
    0,
    open
      ? BINGO_TIMING.betMs - elapsed
      : done
        ? BINGO_TIMING.roundMs - elapsed
        : BINGO_SETTLE_AT - elapsed
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
        body: JSON.stringify({ game: "bingo", roundId: round.id, kind, picks: [], amount }),
      });
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "베팅에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (fatal) return <main className="center-screen">{fatal}</main>;
  if (!round || round.data.game !== "bingo" || !me) {
    return <main className="center-screen">{roundError ?? "불러오는 중…"}</main>;
  }

  const myBets = me.bets;

  return (
    <GameShell me={me} notice={notice} onDismissNotice={() => setNotice(null)}>
      <main className="layout">
        <section className="stage">
          <RoundHeader
            roundId={round.id}
            phase={open ? "betting" : done ? "result" : "racing"}
            label={open ? "베팅 접수 중" : done ? "결과 발표" : "추첨 중"}
            remaining={remaining}
            progress={
              open
                ? 1 - remaining / BINGO_TIMING.betMs
                : Math.min(1, (elapsed - BINGO_TIMING.betMs) / BINGO_TIMING.drawMs)
            }
          />

          <div className="bingo-stage">
            <div
              className="bingo-card"
              style={{ gridTemplateColumns: `repeat(${CARD_SIZE}, 1fr)` }}
            >
              {card.map((n, cell) => {
                const hit = drawnSet.has(n);
                return (
                  <div
                    key={cell}
                    className={`bingo-cell${hit ? " is-hit" : ""}${
                      litCells.has(cell) ? " is-line" : ""
                    }`}
                  >
                    {n}
                  </div>
                );
              })}
            </div>

            <div className="bingo-side">
              <div className="bingo-count">
                <span className="bingo-count-num">{lines.length}</span>
                <small>완성된 줄</small>
              </div>
              <div className="bingo-balls">
                {shown
                  .slice()
                  .reverse()
                  .slice(0, 8)
                  .map((n, i) => (
                    <span key={n} className={`bingo-ball${i === 0 ? " is-new" : ""}`}>
                      {n}
                    </span>
                  ))}
              </div>
              <p className="muted small">
                {shown.length} / {round.data.drawCount} 개
              </p>
            </div>
          </div>
        </section>

        <aside className="side">
          <div className={`panel${open ? "" : " panel-locked"}`}>
            <div className="panel-title">
              <h2>베팅</h2>
              {!open && <span className="badge badge-muted">마감</span>}
            </div>

            <div className="bingo-picks">
              {BINGO_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={!open}
                  className={`bingo-pick${k === kind ? " is-picked" : ""}`}
                  onClick={() => {
                    setKind(k);
                    setError(null);
                  }}
                >
                  <strong>{BINGO_BETS[k].label}</strong>
                  <small>{BINGO_BETS[k].odds.toFixed(2)}배</small>
                </button>
              ))}
            </div>

            <p className="kind-desc">{BINGO_BETS[kind].desc}</p>

            <BetAmount
              amount={amount}
              setAmount={setAmount}
              balance={me.user.balance}
              disabled={!open}
              odds={BINGO_BETS[kind].odds}
            />

            {error && <p className="error">{error}</p>}

            <button type="button" className="primary" disabled={!open || busy} onClick={submit}>
              {busy ? "접수 중…" : "베팅하기"}
            </button>
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>이번 회차 내 베팅</h2>
              {myBets.length > 0 && (
                <span className="badge">
                  {formatCoins(myBets.reduce((s, b) => s + b.amount, 0))} 코인
                </span>
              )}
            </div>
            {myBets.length === 0 ? (
              <p className="muted small">아직 베팅이 없습니다.</p>
            ) : (
              <ul className="bet-list">
                {myBets.map((b) => {
                  const meta = BINGO_BETS[b.kind as BingoKind];
                  const hit = done
                    ? b.kind === "l4plus"
                      ? lines.length >= 4
                      : lines.length === Number(b.kind.slice(1))
                    : null;
                  return (
                    <li key={b.id} className={hit === null ? "" : hit ? "hit" : "miss"}>
                      <span className="bet-kind">빙고</span>
                      <span className="bet-desc">{meta?.label ?? b.kind}</span>
                      <span className="bet-amount">
                        {formatCoins(b.amount)} × {b.odds.toFixed(2)}
                      </span>
                      {hit !== null && (
                        <span className="bet-result">
                          {hit ? `+${formatCoins(Math.floor(b.amount * b.odds))}` : "낙첨"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
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
