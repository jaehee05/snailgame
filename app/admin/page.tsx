"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, formatCoins, RequestError } from "@/lib/client";

type AdminUser = {
  uid: string;
  nick: string;
  balance: number;
  isAdmin: boolean;
  createdAt: number;
  staked: number;
  returned: number;
};

type LedgerEntry = {
  byNick: string;
  toNick: string;
  amount: number;
  memo: string;
  at: number;
};

const PRESETS = [10_000, 100_000, 1_000_000, 10_000_000];

function presetLabel(n: number): string {
  if (n >= 10_000_000) return "+1천만";
  if (n >= 1_000_000) return "+100만";
  if (n >= 100_000) return "+10만";
  return "+1만";
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api<{ users: AdminUser[]; ledger: LedgerEntry[] }>("/api/admin");
      setUsers(data.users);
      setLedger(data.ledger);
      setError(null);
    } catch (err) {
      if (err instanceof RequestError && err.status === 401) {
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "불러오지 못했습니다.");
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    load();
  }, [load]);

  const shown = useMemo(
    () => users.filter((u) => u.nick.toLowerCase().includes(query.trim().toLowerCase())),
    [users, query]
  );
  const totalCoins = useMemo(() => users.reduce((s, u) => s + u.balance, 0), [users]);

  async function send(uid: string, body: Record<string, unknown>) {
    setBusy(uid);
    try {
      await api("/api/admin", { method: "POST", body: JSON.stringify({ uid, ...body }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function grant(uid: string, amount: number) {
    if (!amount) return;
    await send(uid, { action: "grant", amount, memo });
    setAmounts((a) => ({ ...a, [uid]: 0 }));
  }

  async function resetPassword(user: AdminUser) {
    const password = window.prompt(`${user.nick} 님의 새 비밀번호 (4자 이상)`);
    if (!password) return;
    await send(user.uid, { action: "resetPassword", password });
  }

  return (
    <div className="shell">
      <header className="appbar">
        <div className="appbar-inner">
          <div className="brand">
            <span className="brand-mark">🛠️</span>
            <strong>관리자</strong>
          </div>
          <Link href="/" className="chip">
            게임으로
          </Link>
        </div>
      </header>

      <div className="shell-body">
        <main className="admin-main">
          {error && <p className="error">{error}</p>}

          <div className="stat-row">
            <div className="stat">
              <small>참가자</small>
              <strong>{users.length}명</strong>
            </div>
            <div className="stat">
              <small>전체 보유 코인</small>
              <strong className="accent">{formatCoins(totalCoins)}</strong>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>코인 지급</h2>
              <span className="badge badge-muted">{shown.length}명</span>
            </div>

            <div className="admin-filters">
              <input
                placeholder="아이디 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <input
                placeholder="지급 사유 (선택)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            <div className="user-cards">
              {shown.map((u) => {
                const amount = amounts[u.uid] ?? 0;
                const working = busy === u.uid;
                return (
                  <div key={u.uid} className="user-card">
                    <div className="user-head">
                      <span className="user-avatar">{u.nick.slice(0, 1)}</span>
                      <div className="user-id">
                        <strong>{u.nick}</strong>
                        <small className="muted">
                          베팅 {formatCoins(u.staked ?? 0)} · 회수 {formatCoins(u.returned ?? 0)}
                        </small>
                      </div>
                      <span className="user-balance">{formatCoins(u.balance)}</span>
                    </div>

                    <div className="amount-row">
                      {PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className="chip"
                          onClick={() =>
                            setAmounts((a) => ({ ...a, [u.uid]: (a[u.uid] ?? 0) + p }))
                          }
                        >
                          {presetLabel(p)}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="chip chip-ghost"
                        onClick={() => setAmounts((a) => ({ ...a, [u.uid]: 0 }))}
                      >
                        초기화
                      </button>
                    </div>

                    <div className="grant-row">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="금액 입력"
                        value={amount ? amount.toLocaleString("ko-KR") : ""}
                        onChange={(e) =>
                          setAmounts((a) => ({
                            ...a,
                            [u.uid]: Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="primary small-btn"
                        disabled={working || !amount}
                        onClick={() => grant(u.uid, amount)}
                      >
                        지급
                      </button>
                      <button
                        type="button"
                        className="chip chip-ghost"
                        disabled={working || !amount}
                        onClick={() => grant(u.uid, -Math.abs(amount))}
                      >
                        회수
                      </button>
                    </div>

                    <div className="user-foot">
                      <button
                        type="button"
                        className={u.isAdmin ? "chip is-admin" : "chip"}
                        disabled={working}
                        onClick={() => send(u.uid, { action: "setAdmin", isAdmin: !u.isAdmin })}
                      >
                        {u.isAdmin ? "관리자" : "일반"}
                      </button>
                      <button
                        type="button"
                        className="chip chip-ghost"
                        disabled={working}
                        onClick={() => resetPassword(u)}
                      >
                        비밀번호 초기화
                      </button>
                    </div>
                  </div>
                );
              })}
              {shown.length === 0 && <p className="muted small">해당하는 참가자가 없습니다.</p>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>지급 내역</h2>
              {ledger.length > 0 && <span className="badge badge-muted">{ledger.length}건</span>}
            </div>
            {ledger.length === 0 ? (
              <p className="muted small">아직 내역이 없습니다.</p>
            ) : (
              <ul className="history">
                {ledger.map((entry, i) => (
                  <li key={i}>
                    <span className="muted small">
                      {new Date(entry.at).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="history-order">
                      {entry.byNick} → <strong>{entry.toNick}</strong>
                      {entry.memo ? ` · ${entry.memo}` : ""}
                    </span>
                    <span className={entry.amount >= 0 ? "net-up" : "net-down"}>
                      {entry.amount >= 0 ? "+" : ""}
                      {formatCoins(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
