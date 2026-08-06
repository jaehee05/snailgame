import { createHash, createHmac } from "node:crypto";

const SECRET =
  process.env.ROUND_SECRET ?? "snailgame-dev-secret-please-set-ROUND_SECRET";

/** 회차 시작과 동시에 공개되는 시드. 출전표와 배당이 여기서 나온다. */
export function publicSeedOf(roundId: number): string {
  return createHmac("sha256", SECRET).update(`pub:${roundId}`).digest("hex");
}

/** 경주 결과를 결정하는 시드. 베팅 마감 전까지 비공개. */
export function secretSeedOf(roundId: number): string {
  return createHmac("sha256", SECRET).update(`sec:${roundId}`).digest("hex");
}

/** 베팅 중에 미리 공개되는 비공개 시드의 해시. 결과 조작 여부를 사후 검증할 수 있다. */
export function commitOf(roundId: number): string {
  return createHash("sha256").update(secretSeedOf(roundId)).digest("hex");
}
