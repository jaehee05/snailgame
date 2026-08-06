"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { api, formatCoins, type MeState } from "@/lib/client";
import { GAME_ICON, GAME_IDS, GAME_LABEL, type GameId } from "@/lib/games/types";

const HREF: Record<GameId, string> = {
  snail: "/",
  oddeven: "/oddeven",
  crash: "/crash",
  bingo: "/bingo",
  triple: "/triple",
};

/** 잔액이 바뀌면 숫자가 굴러가듯 올라간다. */
function useCountUp(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    const a = from.current;
    if (a === value) return;
    const start = performance.now();

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 550);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);

  return shown;
}

/** 모든 게임이 공유하는 앱 껍데기. 고정 상단바 · 탭 · 토스트. */
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
  const [menuOpen, setMenuOpen] = useState(false);
  const balance = useCountUp(me?.user.balance ?? 0);

  // 토스트는 잠깐 떴다 사라진다.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onDismissNotice, 4200);
    return () => clearTimeout(t);
  }, [notice, onDismissNotice]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  async function logout() {
    await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) });
    router.replace("/login");
  }

  return (
    <div className="shell">
      <header className="appbar">
        <div className="appbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">🎰</span>
            <strong>미니게임</strong>
          </Link>

          <div className="appbar-right">
            <div className="balance-chip">
              <span className="balance-coin">🪙</span>
              <strong>{me ? formatCoins(balance) : "—"}</strong>
            </div>

            <button
              type="button"
              className="avatar"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              aria-label="내 메뉴"
            >
              {me?.user.nick.slice(0, 1) ?? "?"}
            </button>

            {menuOpen && (
              <div className="menu" onClick={(e) => e.stopPropagation()}>
                <div className="menu-head">
                  <strong>{me?.user.nick}</strong>
                  <small className="muted">누적 베팅 {formatCoins(me?.user.staked ?? 0)}</small>
                </div>
                {me?.user.isAdmin && (
                  <Link href="/admin" className="menu-item" onClick={() => setMenuOpen(false)}>
                    🛠️ 관리자
                  </Link>
                )}
                <button type="button" className="menu-item" onClick={logout}>
                  ↩︎ 로그아웃
                </button>
              </div>
            )}
          </div>
        </div>

        <nav className="tabs-top">
          {GAME_IDS.map((id) => (
            <Link
              key={id}
              href={HREF[id]}
              className={`tab-top${pathname === HREF[id] ? " is-active" : ""}`}
            >
              <span>{GAME_ICON[id]}</span>
              {GAME_LABEL[id]}
            </Link>
          ))}
        </nav>
      </header>

      <div className="shell-body">{children}</div>

      <nav className="tabbar">
        {GAME_IDS.map((id) => (
          <Link
            key={id}
            href={HREF[id]}
            className={`tabbar-item${pathname === HREF[id] ? " is-active" : ""}`}
          >
            <span className="tabbar-icon">{GAME_ICON[id]}</span>
            <span className="tabbar-label">{GAME_LABEL[id]}</span>
          </Link>
        ))}
      </nav>

      {notice && (
        <div className="toast" role="status" onClick={onDismissNotice}>
          {notice}
        </div>
      )}
    </div>
  );
}
