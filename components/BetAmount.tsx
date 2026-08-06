"use client";

import { formatCoins } from "@/lib/client";
import { MAX_BET, MIN_BET } from "@/lib/config";

const CHIPS = [1_000, 10_000, 100_000, 1_000_000];

function chipLabel(n: number): string {
  if (n >= 10_000) return `${n / 10_000}만`;
  return `${n / 1_000}천`;
}

/**
 * 금액 칩 · 직접 입력 · 적중 시 수령액 미리보기.
 * 입력칸은 숫자 타입 대신 글자 타입이다. 숫자 타입은 값이 0 일 때
 * "0" 이 남아 있어서 100만을 치면 0100000 이 되어 버린다.
 */
export function BetAmount({
  amount,
  setAmount,
  balance,
  disabled,
  odds,
}: {
  amount: number;
  setAmount: (next: number) => void;
  balance: number;
  disabled: boolean;
  /** 배당이 정해진 게임만 수령액을 보여준다 */
  odds?: number;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(MAX_BET, Math.floor(n)));

  return (
    <div className="bet-amount-block">
      <div className="amount-row">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className="chip"
            disabled={disabled}
            onClick={() => setAmount(clamp(amount + c))}
          >
            +{chipLabel(c)}
          </button>
        ))}
        <button
          type="button"
          className="chip chip-ghost"
          disabled={disabled}
          onClick={() => setAmount(0)}
        >
          초기화
        </button>
      </div>

      <div className="amount-input">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="금액 입력"
          value={amount ? amount.toLocaleString("ko-KR") : ""}
          disabled={disabled}
          onChange={(e) => setAmount(clamp(Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
        />
        <span className="amount-unit">코인</span>
      </div>

      <div className="amount-row amount-quick">
        <button
          type="button"
          className="chip"
          disabled={disabled}
          onClick={() => setAmount(clamp(Math.floor(amount / 2)))}
        >
          ½
        </button>
        <button
          type="button"
          className="chip"
          disabled={disabled}
          onClick={() => setAmount(clamp(amount * 2))}
        >
          ×2
        </button>
        <button
          type="button"
          className="chip"
          disabled={disabled}
          onClick={() => setAmount(clamp(balance))}
        >
          올인
        </button>
        <span className="amount-limit muted">
          {formatCoins(MIN_BET)} ~ {formatCoins(MAX_BET)}
        </span>
      </div>

      {odds !== undefined && (
        <div className="payout-preview">
          <span>
            배당 <strong>{odds.toFixed(2)}배</strong>
          </span>
          <span>
            적중 시 <strong>{formatCoins(Math.floor(amount * odds))}</strong> 코인
          </span>
        </div>
      )}
    </div>
  );
}
