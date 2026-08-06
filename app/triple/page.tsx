"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { GameShell } from "@/components/GameShell";
import { ScratchCell } from "@/components/ScratchCell";
import { GameSkeleton } from "@/components/Skeleton";
import { api, formatCoins, RequestError, type MeState } from "@/lib/client";
import {
  BONUS_ODDS,
  BONUS_ROWS,
  MAIN_ROWS,
  TRIPLE_PRICE,
  type TripleResult,
} from "@/lib/games/triple";

type Ticket = { id: string; seed: string; result: TripleResult; balance: number; at: number };

const PANEL_LABEL = ["게임 1 · 50억 기회", "게임 2 · 10억 기회", "게임 3 · 보너스"];

const blank = (): boolean[][] => [
  [false, false, false],
  [false, false, false],
  [false, false, false],
];

export default function TriplePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  // 9칸을 하나씩 긁는다. revealed[게임][칸]
  const [revealed, setRevealed] = useState<boolean[][]>(() => blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ label: string; prize: number }[]>([]);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<MeState>("/api/me?game=snail"));
      setFatal(null);
    } catch (err) {
      if (err instanceof RequestError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setFatal(err instanceof Error ? err.message : "상태를 불러오지 못했습니다.");
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    loadMe();
  }, [loadMe]);

  const allRevealed = revealed.every((row) => row.every(Boolean));

  async function buy() {
    if (busy) return;
    if (me && me.user.balance < TRIPLE_PRICE) return setError("잔액이 부족합니다.");
    setBusy(true);
    setError(null);
    try {
      const t = await api<Ticket>("/api/scratch", { method: "POST" });
      setTicket(t);
      setRevealed(blank());
      setMe((prev) => (prev ? { ...prev, user: { ...prev.user, balance: t.balance } } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "구입에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function reveal(panel: number, cell: number) {
    setRevealed((prev) => {
      if (prev[panel][cell]) return prev;
      const next = prev.map((row) => [...row]);
      next[panel][cell] = true;
      if (next.every((row) => row.every(Boolean)) && ticket) finish(ticket);
      return next;
    });
  }

  function revealAll() {
    if (!ticket) return;
    setRevealed([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
    finish(ticket);
  }

  function finish(t: Ticket) {
    const label =
      t.result.bonusRank > 0
        ? `보너스 ${t.result.bonusRank}등`
        : t.result.rank > 0
          ? `${t.result.rank}등`
          : "꽝";
    setRecent((prev) => [{ label, prize: t.result.prize }, ...prev].slice(0, 12));
    if (t.result.prize > 0) setNotice(`${label} 당첨 · +${formatCoins(t.result.prize)} 코인`);
  }

  if (fatal) return <GameSkeleton message={fatal} />;
  if (!me) return <GameSkeleton />;

  return (
    <GameShell me={me} notice={notice} onDismissNotice={() => setNotice(null)}>
      <main className="layout">
        <section className="stage">
          <div className="stage-head">
            <div>
              <span className="round-no">즉석복권</span>
              <span className="phase phase-betting">회차 없음 · 바로 확인</span>
            </div>
            <span className="badge">{formatCoins(TRIPLE_PRICE)} 코인 / 장</span>
          </div>

          {!ticket ? (
            <div className="tl-empty">
              <span className="tl-empty-icon">🎫</span>
              <p className="muted">한 장 사서 세 칸을 긁어 보세요.</p>
              <button type="button" className="primary" disabled={busy} onClick={buy}>
                {busy ? "구입 중…" : `${formatCoins(TRIPLE_PRICE)} 코인으로 한 장`}
              </button>
            </div>
          ) : (
            <>
              <div className="tl-panels">
                {ticket.result.panels.map((symbols, i) => {
                  const open = revealed[i].every(Boolean);
                  const win = open && ticket.result.winPanel === i;
                  return (
                    <div key={i} className={`tl-panel${win ? " is-win" : ""}`}>
                      <small className="tl-panel-label">{PANEL_LABEL[i]}</small>
                      <div className="tl-cells">
                        {symbols.map((sym, j) => (
                          <ScratchCell
                            key={j}
                            symbol={sym}
                            revealed={revealed[i][j]}
                            win={win}
                            onReveal={() => reveal(i, j)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="tl-actions">
                {!allRevealed ? (
                  <button type="button" className="chip" onClick={revealAll}>
                    모두 긁기
                  </button>
                ) : (
                  <div className={`tl-result${ticket.result.prize > 0 ? " is-win" : ""}`}>
                    {ticket.result.prize > 0 ? (
                      <>
                        <strong>
                          {ticket.result.bonusRank > 0
                            ? `보너스 ${ticket.result.bonusRank}등`
                            : `${ticket.result.rank}등`}
                        </strong>
                        <span>+{formatCoins(ticket.result.prize)} 코인</span>
                      </>
                    ) : (
                      <strong className="muted">꽝</strong>
                    )}
                  </div>
                )}
                {allRevealed && (
                  <button type="button" className="primary tl-again" disabled={busy} onClick={buy}>
                    {busy ? "구입 중…" : "한 장 더"}
                  </button>
                )}
              </div>

              <p className="muted small tl-hint">
                {allRevealed ? (
                  <span className="mono">시드 {ticket.seed.slice(0, 16)}…</span>
                ) : (
                  "은박을 손가락으로 문질러 긁으세요"
                )}
              </p>
            </>
          )}
        </section>

        <aside className="side">
          <div className="panel">
            <div className="panel-title">
              <h2>당첨 구조</h2>
              <span className="badge badge-muted">환급률 60%</span>
            </div>
            <ul className="prize-list">
              {MAIN_ROWS.map((r) => (
                <li key={r.rank}>
                  <span className="prize-rank">{r.rank}등</span>
                  <span className="prize-name">{r.label}</span>
                  <span className="prize-cells">1/{r.odds.toLocaleString()}</span>
                  <span className="prize-amount">{formatCoins(r.prize)}</span>
                </li>
              ))}
              <li className="prize-bonus">
                <span className="prize-rank">보너스</span>
                <span className="prize-name">보너스 게임</span>
                <span className="prize-cells">1/{BONUS_ODDS}</span>
                <span className="prize-amount">—</span>
              </li>
              {BONUS_ROWS.map((r) => (
                <li key={`b${r.rank}`} className="prize-sub">
                  <span className="prize-rank">B{r.rank}</span>
                  <span className="prize-name">{r.label}</span>
                  <span className="prize-cells">1/{r.odds.toLocaleString()}</span>
                  <span className="prize-amount">{formatCoins(r.prize)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>방금 긁은 것</h2>
            </div>
            {recent.length === 0 ? (
              <p className="muted small">아직 없습니다.</p>
            ) : (
              <ul className="history">
                {recent.map((r, i) => (
                  <li key={i}>
                    <span className="history-order">{r.label}</span>
                    <span className={r.prize > 0 ? "net-up" : "net-down"}>
                      {r.prize > 0 ? `+${formatCoins(r.prize)}` : `-${formatCoins(TRIPLE_PRICE)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="error">{error}</p>}
        </aside>
      </main>
    </GameShell>
  );
}
