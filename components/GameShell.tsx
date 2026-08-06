"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { api, formatCoins, type MeState } from "@/lib/client";
import { GAME_ICON, GAME_IDS, GAME_LABEL, type GameId } from "@/lib/games/types";

const HREF: Record<GameId, string> = {
  snail: "/",
  oddeven: "/oddeven",
  crash: "/crash",
  bingo: "/bingo",
  triple: "/triple",
};

/** 모든 게임이 공유하는 상단바와 탭. 잔액은 게임과 무관하게 하나다. */
export function GameShell({
  me,
  notice,
  onDismissNotice,
  children,
}: {
  me: MeState | null;
  notice: string | null;
  onDismissNotice: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) });
    router.replace("/login");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🎰</span>
          <div>
            <strong>미니게임</strong>
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

      <nav className="game-tabs">
        {GAME_IDS.map((id) => (
          <Link
            key={id}
            href={HREF[id]}
            className={`game-tab${pathname === HREF[id] ? " is-active" : ""}`}
          >
            <span className="game-tab-icon">{GAME_ICON[id]}</span>
            <span className="game-tab-name">{GAME_LABEL[id]}</span>
          </Link>
        ))}
      </nav>

      {notice && (
        <div className="notice" onClick={onDismissNotice} role="status">
          {notice}
        </div>
      )}

      {children}
    </div>
  );
}
