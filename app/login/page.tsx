"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [nick, setNick] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({ action: mode, nick, password }),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span>🎰</span>
          <h1>미니게임</h1>
          <p className="muted small">달팽이게임 · 홀짝 · 그래프 · 빙고 · 즉석복권</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "is-active" : ""}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === "register" ? "is-active" : ""}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            회원가입
          </button>
        </div>

        <label>
          <span>아이디</span>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="경주에 표시될 이름"
            maxLength={12}
            autoComplete="username"
            required
          />
        </label>

        <label>
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            minLength={4}
            required
          />
        </label>

        {mode === "register" && (
          <p className="muted small">
            아이디는 한글/영문/숫자 2~12자, 비밀번호는 4자 이상입니다. 가입하면 시작 코인
            10,000개를 받습니다.
          </p>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? "처리 중…" : mode === "register" ? "가입하고 시작하기" : "로그인"}
        </button>

        <p className="muted small center">
          이 게임의 코인은 실제 현금 가치가 없는 가상 코인입니다.
        </p>
      </form>
    </main>
  );
}
