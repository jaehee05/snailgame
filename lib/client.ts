"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OddsTable, PlacedBet } from "./bets";
import type { GameId } from "./games/types";
import type { Racer } from "./race";

export type RoundData =
  | { game: "snail"; racers: Racer[]; odds: OddsTable; tickMs: number; raceMs: number }
  | { game: "oddeven"; drawMs: number }
  | { game: "crash"; maxMult: number; runMs: number }
  | { game: "bingo"; drawCount: number; drawMs: number };

export type PublicRound = {
  game: GameId;
  id: number;
  start: number;
  publicSeed: string;
  commit: string;
  secretSeed: string | null;
  /** 구입/베팅 마감 = 결과 공개 시작 (절대 ms) */
  drawAt: number;
  /** 이 회차가 끝나는 시각 = 다음 회차 시작 (절대 ms) */
  endAt: number;
  data: RoundData;
};

export type RoundPayload = {
  now: number;
  game: GameId;
  timing: { roundMs: number; betMs: number };
  round: PublicRound;
  prev: PublicRound;
};

export type RoundResult = {
  game: GameId;
  roundId: number;
  summary: number[];
  staked: number;
  returned: number;
  bets: PlacedBet[];
  at: number;
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
  game: GameId;
  roundId: number;
  bets: PlacedBet[];
  results: RoundResult[];
  justSettled: RoundResult[];
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
 * 모든 참가자가 같은 순간에 같은 결과를 보게 만드는 부분이다.
 */
export function useRound(game: GameId) {
  const [payload, setPayload] = useState<RoundPayload | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<RoundPayload>(`/api/round?game=${game}`);
      offset.current = data.now - Date.now();
      setPayload(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결이 불안정합니다.");
    }
  }, [game]);

  useEffect(() => {
    // 서버 응답을 기다렸다가 state 를 채우는 구독형 effect 다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    refresh();
    const poll = setInterval(refresh, 3000);
    const tick = setInterval(() => setNow(Date.now() + offset.current), 60);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  const round = payload?.round ?? null;

  return {
    payload,
    round,
    prev: payload?.prev ?? null,
    timing: payload?.timing ?? null,
    now,
    elapsed: round ? now - round.start : 0,
    error,
    refresh,
  };
}

/** 잔액·내 베팅·정산 결과. 회차가 바뀔 때마다 다시 받아온다. */
export function useMe(game: GameId, roundId: number | undefined, onRedirect: () => void) {
  const [me, setMe] = useState<MeState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const loadMe = useCallback(async () => {
    try {
      const data = await api<MeState>(`/api/me?game=${game}`);
      loadedOnce.current = true;
      setMe(data);
      setFatal(null);
      if (data.justSettled.length > 0) {
        const net = data.justSettled.reduce((s, r) => s + r.returned - r.staked, 0);
        setNotice(`정산: ${net >= 0 ? "+" : ""}${formatCoins(net)} 코인`);
      }
    } catch (err) {
      if (err instanceof RequestError && err.status === 401) {
        onRedirect();
        return;
      }
      const message = err instanceof Error ? err.message : "상태를 불러오지 못했습니다.";
      if (loadedOnce.current) setNotice(message);
      else setFatal(message);
    }
  }, [game, onRedirect]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 완료 후에만 setState 한다
    loadMe();
    // 회차 전환을 놓쳐도 오래 어긋나 있지 않도록 주기적으로 맞춘다.
    const t = setInterval(loadMe, 20_000);
    return () => clearInterval(t);
  }, [roundId, loadMe]);

  return { me, setMe, notice, setNotice, fatal, loadMe };
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

export function formatMult(m: number): string {
  return `${m.toFixed(2)}배`;
}
