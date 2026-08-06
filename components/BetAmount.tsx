"use client";

import { formatCoins } from "@/lib/client";
import { MIN_BET } from "@/lib/config";

const CHIPS = [100, 500, 1_000, 5_000, 10_000];

/** 금액 칩 · 직접 입력 · 적중 시 수령액 미리보기. 게임마다 똑같이 쓰인다. */
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
  return (
    <div className="bet-amount-block">
      <div className="amount-row">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className="chip"
            disabled={disabled}
            onClick={() => setAmount(Math.min(balance, amount + c))}
          >
            +{c >= 1000 ? `${c / 1000}천` : c}
          </button>
        ))}
        <button
          type="button"
          className="chip chip-ghost"
          disabled={disabled}
          onClick={() => setAmount(MIN_BET)}
        >
          초기화
        </button>
      </div>

      <label className="amount-input">
        <span>금액</span>
        <input
          type="number"
          min={MIN_BET}
          step={100}
          value={amount}
          disabled={disabled}
          onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <button
          type="button"
          className="chip"
          disabled={disabled}
          onClick={() => setAmount(balance)}
        >
          올인
        </button>
      </label>

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
