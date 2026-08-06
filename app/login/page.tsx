"use client";

import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/lib/client";
import { auth } from "@/lib/firebase-client";

const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
  "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/wrong-password": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth/user-not-found": "가입되지 않은 이메일입니다.",
  "auth/email-already-in-use": "이미 가입된 이메일입니다.",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다.",
  "auth/operation-not-allowed":
    "Firebase 콘솔에서 이메일/비밀번호 로그인을 활성화해 주세요.",
};

export default function LoginPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        if (!/^[가-힣a-zA-Z0-9_]{2,12}$/.test(nick)) {
          throw new Error("닉네임은 한글/영문/숫자 2~12자로 입력해 주세요.");
        }
        sessionStorage.setItem("snail:nick", nick);
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      router.replace("/");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(MESSAGES[code] ?? (err instanceof Error ? err.message : "로그인에 실패했습니다."));
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span>🐌</span>
          <h1>달팽이 레이싱</h1>
          <p className="muted small">가상 코인으로 즐기는 친구들끼리의 달팽이 경주</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "is-active" : ""}
            onClick={() => setMode("login")}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === "signup" ? "is-active" : ""}
            onClick={() => setMode("signup")}
          >
            회원가입
          </button>
        </div>

        {mode === "signup" && (
          <label>
            <span>닉네임</span>
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="경주에 표시될 이름"
              maxLength={12}
              required
            />
          </label>
        )}

        <label>
          <span>이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label>
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={6}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="primary" disabled={busy}>
          {busy ? "처리 중…" : mode === "signup" ? "가입하고 시작하기" : "로그인"}
        </button>

        <p className="muted small center">
          이 게임의 코인은 실제 현금 가치가 없는 가상 코인입니다.
        </p>
      </form>
    </main>
  );
}
