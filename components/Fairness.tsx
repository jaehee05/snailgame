"use client";

import { useEffect, useState } from "react";

import type { PublicRound } from "@/lib/client";

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function short(hex: string): string {
  return `${hex.slice(0, 12)}…${hex.slice(-8)}`;
}

/**
 * 결과가 미리 정해져 있었고 도중에 바뀌지 않았다는 걸 브라우저에서 직접 확인하는 패널.
 * 베팅 중에는 커밋 해시만 공개되고, 마감된 뒤에야 원본 시드가 공개된다.
 */
export function Fairness({ round, prev }: { round: PublicRound; prev: PublicRound }) {
  const [checked, setChecked] = useState<{ seed: string; ok: boolean } | null>(null);
  const target = round.secretSeed ? round : prev;

  useEffect(() => {
    const seed = target.secretSeed;
    if (!seed) return;
    let alive = true;
    sha256Hex(seed).then((hex) => {
      if (alive) setChecked({ seed, ok: hex === target.commit });
    });
    return () => {
      alive = false;
    };
  }, [target.secretSeed, target.commit]);

  // 지금 보고 있는 시드에 대한 검증 결과일 때만 유효하다.
  const status =
    checked && checked.seed === target.secretSeed ? (checked.ok ? "ok" : "fail") : "idle";

  return (
    <div className="panel fairness">
      <div className="panel-title">
        <h2>공정성 검증</h2>
        {status === "ok" && <span className="badge badge-ok">검증됨</span>}
        {status === "fail" && <span className="badge badge-fail">불일치</span>}
      </div>
      <p className="muted small">
        경주 결과는 베팅이 시작되기 전에 이미 정해져 있습니다. 베팅 중에는 그 값의 해시(커밋)만
        공개되고, 마감된 뒤에 원본 시드가 공개됩니다. 아래 두 값이 맞아떨어진다면 결과를 중간에
        바꾸는 건 불가능합니다.
      </p>
      <dl className="kv">
        <dt>이번 회차 커밋</dt>
        <dd className="mono">{short(round.commit)}</dd>
        <dt>{round.secretSeed ? "이번 회차 시드" : `#${prev.id} 시드 (공개됨)`}</dt>
        <dd className="mono">{target.secretSeed ? short(target.secretSeed) : "마감 후 공개"}</dd>
        <dt>출전표 시드</dt>
        <dd className="mono">{short(round.publicSeed)}</dd>
      </dl>
      {status === "ok" && (
        <p className="small ok-text">
          SHA-256(시드) 값이 미리 공개된 커밋과 일치합니다 (#{target.id}).
        </p>
      )}
    </div>
  );
}
