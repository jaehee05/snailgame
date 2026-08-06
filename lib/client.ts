"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OddsTable, PlacedBet } from "./bets";
import { phaseOf, phaseRemaining, type Phase } from "./config";
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

export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** 세션 쿠키는 브라우저가 알아서 실어 보내므로 따로 붙일 헤더가 없다. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RequestError((json as { error?: string }).error ?? "요청에 실패했습니다.", res.status);
  }
  return json as T;
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
      const data = await api<RoundPayload>("/api/round");
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
