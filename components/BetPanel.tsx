"use client";

import { useMemo, useState } from "react";

import { BET_KINDS, BET_META, oddsFor, type BetKind, type OddsTable } from "@/lib/bets";
import { formatCoins } from "@/lib/client";
import { MIN_BET } from "@/lib/config";
import type { Racer } from "@/lib/race";
import { BetAmount } from "./BetAmount";
import { SnailIcon } from "./SnailIcon";

export function BetPanel({
  racers,
  odds,
  balance,
  open,
  onPlace,
}: {
  racers: Racer[];
  odds: OddsTable;
  balance: number;
  open: boolean;
  onPlace: (kind: BetKind, picks: number[], amount: number) => Promise<void>;
}) {
  const [kind, setKind] = useState<BetKind>("win");
  const [picks, setPicks] = useState<number[]>([]);
  const [amount, setAmount] = useState(1_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = BET_META[kind];
  const complete = picks.length === meta.picks;
  const currentOdds = complete ? oddsFor(odds, { kind, picks }) : null;

  const bestOdds = useMemo(() => {
    // 각 달팽이의 단승 배당을 칩 위에 같이 보여준다.
    return racers.map((_, lane) => oddsFor(odds, { kind: "win", picks: [lane] }));
  }, [odds, racers]);

  function toggle(lane: number) {
    setError(null);
    setPicks((prev) => {
      if (prev.includes(lane)) return prev.filter((p) => p !== lane);
      if (prev.length >= meta.picks) return [...prev.slice(1), lane];
      return [...prev, lane];
    });
  }

  function changeKind(next: BetKind) {
    setKind(next);
    setPicks((prev) => prev.slice(0, BET_META[next].picks));
    setError(null);
  }

  async function submit() {
    if (!complete || busy) return;
    if (amount < MIN_BET) return setError(`최소 ${formatCoins(MIN_BET)} 코인부터 걸 수 있습니다.`);
    if (amount > balance) return setError("잔액이 부족합니다.");
    setBusy(true);
    setError(null);
    try {
      await onPlace(kind, picks, amount);
      setPicks([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "베팅에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`panel bet-panel${open ? "" : " panel-locked"}`}>
      <div className="panel-title">
        <h2>베팅</h2>
        {!open && <span className="badge badge-muted">마감</span>}
      </div>

      <div className="kind-tabs">
        {BET_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            className={`kind-tab${k === kind ? " is-active" : ""}`}
            onClick={() => changeKind(k)}
          >
            <strong>{BET_META[k].label}</strong>
            <small>{BET_META[k].short}</small>
          </button>
        ))}
      </div>

      <p className="kind-desc">{meta.desc}</p>

      <div className="pick-grid">
        {racers.map((racer, lane) => {
          const idx = picks.indexOf(lane);
          return (
            <button
              key={racer.char.id}
              type="button"
              disabled={!open}
              className={`pick${idx >= 0 ? " is-picked" : ""}`}
              onClick={() => toggle(lane)}
            >
              {idx >= 0 && (
                <span className="pick-order">{meta.ordered ? `${idx + 1}등` : "선택"}</span>
              )}
              <SnailIcon color={racer.char.color} shell={racer.char.shell} size={30} />
              <span className="pick-name">{racer.char.name}</span>
              <span className="pick-odds">단승 {bestOdds[lane].toFixed(2)}배</span>
            </button>
          );
        })}
      </div>

      <BetAmount
        amount={amount}
        setAmount={setAmount}
        balance={balance}
        disabled={!open}
        odds={currentOdds ?? undefined}
      />

      {!complete && (
        <p className="muted small center">
          달팽이 {meta.picks}마리를 {meta.ordered ? "순서대로 " : ""}고르세요
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <button
        type="button"
        className="primary"
        disabled={!open || !complete || busy}
        onClick={submit}
      >
        {busy ? "접수 중…" : "베팅하기"}
      </button>
    </div>
  );
}
