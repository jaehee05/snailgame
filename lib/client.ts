"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";

import type { OddsTable, PlacedBet } from "./bets";
import { phaseOf, phaseRemaining, type Phase } from "./config";
import { auth } from "./firebase-client";
import type { Racer } from "./race";

export type PublicRound = {
  id: number;
  start: number;
  publicSeed: string;
  commit: string;
  secretSeed: string | null;
  odds: OddsTable;
  racers: Racer[];
};

export type RoundPayload = {
  now: number;
  timing: { roundMs: number; betMs: number; raceMs: number };
  round: PublicRound;
  prev: PublicRound;
};

export type MeState = {
  user: {
    uid: string;
    nick: string;
    balance: number;
    isAdmin: boolean;
    staked: number;
    returned: number;
  };
  roundId: number;
  bets: PlacedBet[];
  results: {
    roundId: number;
    order: number[];
    staked: number;
    returned: number;
    bets: PlacedBet[];
    at: number;
  }[];
  justSettled: MeState["results"];
};

/** Firebase 로그인 상태 + 인증 헤더가 붙은 fetch */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setReady(true);
  }), []);

  const api = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const current = auth.currentUser;
    if (!current) throw new Error("로그인이 필요합니다.");
    const token = await current.getIdToken();
    const res = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "요청에 실패했습니다.");
    return json as T;
  }, []);

  return { user, ready, api };
}

/**
 * 회차 정보를 주기적으로 받아오고, 서버 시계에 맞춘 현재 시각을 돌려준다.
 * 모든 참가자가 같은 순간에 같은 경주를 보게 만드는 부분이다.
 */
export function useRound() {
  const [payload, setPayload] = useState<RoundPayload | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/round", { cache: "no-store" });
      if (!res.ok) throw new Error("회차 정보를 불러오지 못했습니다.");
      const data = (await res.json()) as RoundPayload;
      offset.current = data.now - Date.now();
      setPayload(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결이 불안정합니다.");
    }
  }, []);

  useEffect(() => {
    // 서버 응답을 기다렸다가 state 를 채우는 구독형 effect 다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    refresh();
    const poll = setInterval(refresh, 3000);
    const tick = setInterval(() => setNow(Date.now() + offset.current), 80);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const round = payload?.round ?? null;
  const elapsed = round ? now - round.start : 0;
  const phase: Phase = round ? phaseOf(elapsed) : "betting";

  return {
    payload,
    round,
    prev: payload?.prev ?? null,
    now,
    elapsed,
    phase,
    remaining: round ? Math.max(0, phaseRemaining(elapsed)) : 0,
    error,
    refresh,
  };
}

export function formatCoins(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
