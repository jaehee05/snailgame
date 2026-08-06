"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { formatCoins, useAuth } from "@/lib/client";

type UserDoc = {
  uid: string;
  nick: string;
  email: string;
  balance: number;
  isAdmin: boolean;
  staked: number;
  returned: number;
};

type LedgerEntry = {
  type: string;
  byNick: string;
  toNick: string;
  amount: number;
  memo: string;
  at: number;
};

const PRESETS = [1_000, 5_000, 10_000, 50_000];

export default function AdminPage() {
  const router = useRouter();
  const { user, ready, api } = useAuth();
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  const load = useCallback(async () => {
    try {
      const data = await api<{ users: UserDoc[]; ledger: LedgerEntry[] }>("/api/admin");
      setUsers(data.users);
      setLedger(data.ledger);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오지 못했습니다.");
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    if (user) load();
  }, [user, load]);

  async function grant(uid: string, amount: number) {
    if (!amount) return;
    setBusy(uid);
    try {
      await api("/api/admin", {
        method: "POST",
        body: JSON.stringify({ action: "grant", uid, amount, memo }),
      });
      setAmounts((a) => ({ ...a, [uid]: 0 }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "지급에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleAdmin(target: UserDoc) {
    setBusy(target.uid);
    try {
      await api("/api/admin", {
        method: "POST",
        body: JSON.stringify({ action: "setAdmin", uid: target.uid, isAdmin: !target.isAdmin }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  if (!ready || !user) return <main className="center-screen">불러오는 중…</main>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🛠️</span>
          <div>
            <strong>관리자</strong>
            <small>게임 머니 지급 · 회수</small>
          </div>
        </div>
        <div className="topbar-right">
          <Link href="/">경주장으로</Link>
        </div>
      </header>

      <main className="layout admin-layout">
        {error && <p className="error">{error}</p>}

        <div className="panel">
          <div className="panel-title">
            <h2>참가자 {users.length}명</h2>
            <input
              className="memo-input"
              placeholder="지급 사유 (선택)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>닉네임</th>
                  <th>이메일</th>
                  <th className="num">보유</th>
                  <th className="num">누적 베팅</th>
                  <th className="num">누적 회수</th>
                  <th>지급 / 회수</th>
                  <th>권한</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const amount = amounts[u.uid] ?? 0;
                  return (
                    <tr key={u.uid}>
                      <td>
                        <strong>{u.nick}</strong>
                      </td>
                      <td className="muted small">{u.email}</td>
                      <td className="num">{formatCoins(u.balance)}</td>
                      <td className="num muted">{formatCoins(u.staked ?? 0)}</td>
                      <td className="num muted">{formatCoins(u.returned ?? 0)}</td>
                      <td>
                        <div className="grant-row">
                          {PRESETS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className="chip"
                              onClick={() => setAmounts((a) => ({ ...a, [u.uid]: (a[u.uid] ?? 0) + p }))}
                            >
                              +{p / 1000}k
                            </button>
                          ))}
                          <input
                            type="number"
                            value={amount}
                            onChange={(e) =>
                              setAmounts((a) => ({ ...a, [u.uid]: Math.floor(Number(e.target.value) || 0) }))
                            }
                          />
                          <button
                            type="button"
                            className="primary small-btn"
                            disabled={busy === u.uid || !amount}
                            onClick={() => grant(u.uid, amount)}
                          >
                            지급
                          </button>
                          <button
                            type="button"
                            className="chip chip-ghost"
                            disabled={busy === u.uid || !amount}
                            onClick={() => grant(u.uid, -Math.abs(amount))}
                          >
                            회수
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={u.isAdmin ? "chip is-admin" : "chip"}
                          disabled={busy === u.uid}
                          onClick={() => toggleAdmin(u)}
                        >
                          {u.isAdmin ? "관리자" : "일반"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <h2>지급 내역</h2>
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
                  <span>
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
  );
}
