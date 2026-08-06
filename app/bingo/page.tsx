"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { History } from "@/components/BetList";
import { BingoCard } from "@/components/BingoCard";
import { Fairness } from "@/components/Fairness";
import { GameShell } from "@/components/GameShell";
import { GameSkeleton } from "@/components/Skeleton";
import { RoundHeader } from "@/components/RoundHeader";
import { api, formatCoins, useMe, useRound } from "@/lib/client";
import {
  autoPick,
  ballTimeOf,
  BINGO_TIMING,
  columnNumbers,
  columnOf,
  COLUMN_LABELS,
  drawBalls,
  isValidPicks,
  MAX_TICKETS,
  PATTERNS,
  PICK_COUNT,
  PICKS_PER_COLUMN,
  PRIZES,
  TICKET_PRICE,
} from "@/lib/games/bingo";

export default function BingoPage() {
  const router = useRouter();
  const { round, prev, elapsed, error: roundError } = useRound("bingo");
  const redirect = useCallback(() => router.replace("/login"), [router]);
  const { me, notice, setNotice, fatal, loadMe } = useMe("bingo", round?.id, redirect);

  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 관리자가 바로진행을 누르면 추첨이 앞당겨지고, 추첨이 끝나는 대로
  // 회차가 닫히며 바로 다음 구입창이 열린다.
  const drawStart = round ? round.drawAt - round.start : BINGO_TIMING.betMs;
  const roundLength = round ? round.endAt - round.start : BINGO_TIMING.roundMs;
  const open = elapsed < drawStart;
  const done = elapsed >= drawStart + BINGO_TIMING.drawMs;

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(loadMe, 800);
    return () => clearTimeout(t);
  }, [done, round?.id, loadMe]);

  const secretSeed = round?.secretSeed ?? null;
  const balls = useMemo(() => (secretSeed ? drawBalls(secretSeed) : []), [secretSeed]);

  // 공은 하나씩 순서대로 나온다.
  const shown = useMemo(
    () => balls.filter((_, i) => elapsed >= ballTimeOf(i, drawStart)),
    [balls, elapsed, drawStart]
  );
  const drawn = useMemo(() => new Set(shown), [shown]);
  const latest = shown.length > 0 ? shown[shown.length - 1] : null;

  const remaining = Math.max(
    0,
    open
      ? drawStart - elapsed
      : done
        ? roundLength - elapsed
        : drawStart + BINGO_TIMING.drawMs - elapsed
  );

  const countByColumn = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const n of picks) counts[columnOf(n)]++;
    return counts;
  }, [picks]);

  const complete = isValidPicks(picks);
  // 회차가 막 바뀐 직후 이전 회차 내역이 잠깐 남아 보이지 않도록 걸러 낸다.
  const tickets = (me?.bets ?? []).filter((b) => b.roundId === round?.id);

  function toggle(n: number) {
    if (!open) return;
    setError(null);
    setPicks((prev) => {
      if (prev.includes(n)) return prev.filter((p) => p !== n);
      const col = columnOf(n);
      const used = prev.filter((p) => columnOf(p) === col).length;
      if (used >= PICKS_PER_COLUMN[col]) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  }

  async function skipNow() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin", { method: "POST", body: JSON.stringify({ action: "bingoSkip" }) });
      setNotice("추첨을 바로 시작합니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "바로진행에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function buy(count: number, auto: boolean) {
    if (busy || !round || !me) return;
    if (me.user.balance < TICKET_PRICE * count) return setError("잔액이 부족합니다.");
    if (tickets.length + count > MAX_TICKETS) {
      return setError(`한 회차에 최대 ${MAX_TICKETS}장까지 살 수 있습니다.`);
    }
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < count; i++) {
        await api("/api/bet", {
          method: "POST",
          body: JSON.stringify({
            game: "bingo",
            roundId: round.id,
            kind: "ticket",
            picks: auto || !complete ? autoPick() : picks,
            amount: TICKET_PRICE,
          }),
        });
      }
      if (!auto) setPicks([]);
      await loadMe();
    } catch (err) {
      setError(err instanceof Error ? err.message : "구입에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (fatal) return <GameSkeleton message={fatal} />;
  if (!round || round.data.game !== "bingo" || !me) {
    return <GameSkeleton message={roundError ?? undefined} />;
  }

  return (
    <GameShell me={me} notice={notice} onDismissNotice={() => setNotice(null)}>
      <main className="layout">
        <section className="stage">
          <RoundHeader
            roundId={round.id}
            phase={open ? "betting" : done ? "result" : "racing"}
            label={open ? "구입 가능" : done ? "추첨 완료" : "추첨 중"}
            remaining={remaining}
            progress={
              open
                ? 1 - remaining / Math.max(1, drawStart)
                : Math.min(1, (elapsed - drawStart) / BINGO_TIMING.drawMs)
            }
          />

          {open ? (
            <>
              <div className="bpick-head">
                <span>
                  선택 <strong>{picks.length}</strong> / {PICK_COUNT}
                </span>
                <div className="bpick-actions">
                  <button type="button" className="chip" onClick={() => setPicks(autoPick())}>
                    자동선택
                  </button>
                  <button type="button" className="chip chip-ghost" onClick={() => setPicks([])}>
                    비우기
                  </button>
                </div>
              </div>

              <div className="bpick-board">
                {COLUMN_LABELS.map((label, col) => (
                  <div
                    key={label}
                    className={`bpick-col${countByColumn[col] === PICKS_PER_COLUMN[col] ? " is-done" : ""}`}
                  >
                    <div className="bpick-col-head">
                      <strong>{label}</strong>
                      <small>
                        {countByColumn[col]}/{PICKS_PER_COLUMN[col]}
                      </small>
                    </div>
                    <div className="bpick-nums">
                      {columnNumbers(col).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`bnum${picks.includes(n) ? " is-picked" : ""}`}
                          onClick={() => toggle(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="bdraw">
              <div className="bdraw-ball">
                <small>{shown.length}번째 추첨</small>
                <div className="bball">
                  {latest !== null && (
                    <>
                      <span className="bball-col">{COLUMN_LABELS[columnOf(latest)]}</span>
                      <span className="bball-num">{latest}</span>
                    </>
                  )}
                </div>
                <small className="muted">
                  {shown.length} / {round.data.drawCount}
                </small>
              </div>

              <div className="bdraw-board">
                {COLUMN_LABELS.map((label, col) => (
                  <div key={label} className="bdraw-row">
                    <span className="bdraw-label">{label}</span>
                    {columnNumbers(col).map((n) => (
                      <span key={n} className={`bdraw-num${drawn.has(n) ? " is-out" : ""}`}>
                        {n}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="side">
          <div className={`panel${open ? "" : " panel-locked"}`}>
            <div className="panel-title">
              <h2>구입</h2>
              <span className="badge">{formatCoins(TICKET_PRICE)} 코인 / 장</span>
            </div>

            <p className="kind-desc">
              B·I·G·O 각 5개, N 4개 해서 24개를 고릅니다. 가운데는 FREE 입니다.
              고르기 번거로우면 자동선택으로 사면 됩니다.
            </p>

            <button
              type="button"
              className="primary"
              disabled={!open || busy || !complete}
              onClick={() => buy(1, false)}
            >
              {busy ? "구입 중…" : complete ? "이 번호로 구입" : `${PICK_COUNT - picks.length}개 더 고르세요`}
            </button>

            <div className="amount-row" style={{ marginTop: 8 }}>
              {[1, 3, 5, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip"
                  disabled={!open || busy}
                  onClick={() => buy(n, true)}
                >
                  {n}장 자동
                </button>
              ))}
            </div>

            {error && <p className="error">{error}</p>}

            {me.user.isAdmin && open && (
              <button type="button" className="chip skip-now" disabled={busy} onClick={skipNow}>
                ⏩ 바로진행 (관리자)
              </button>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>당첨 구조</h2>
            </div>
            <ul className="prize-list">
              {PATTERNS.map((p) => (
                <li key={p.rank}>
                  <span className="prize-rank">{p.rank}등</span>
                  <span className="prize-name">{p.name}</span>
                  <span className="prize-cells">{p.cells.length}칸</span>
                  <span className="prize-amount">{formatCoins(PRIZES[p.rank])}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="bottom">
          <div className="panel">
            <div className="panel-title">
              <h2>구입 내역</h2>
              {tickets.length > 0 && (
                <span className="badge">
                  {tickets.length}장 · {formatCoins(tickets.length * TICKET_PRICE)} 코인
                </span>
              )}
            </div>
            {tickets.length === 0 ? (
              <p className="muted small">이번 회차에 구입한 장이 없습니다.</p>
            ) : (
              <div className="bcards">
                {tickets.map((t) => (
                  <BingoCard key={t.id} picks={t.picks} drawn={drawn} compact />
                ))}
              </div>
            )}
          </div>

          <History results={me.results} />
          {prev && <Fairness round={round} prev={prev} />}
        </section>
      </main>
    </GameShell>
  );
}
