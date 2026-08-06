import { bingoSchedule } from "@/lib/db";
import { isRoundGameId } from "@/lib/games/types";
import { bingoRoundPayload, currentRoundPayload } from "@/lib/round";

export const dynamic = "force-dynamic";

/** 로그인 없이도 볼 수 있는 회차 정보 (공개 데이터 · 커밋 해시 · 공개된 시드) */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("game") ?? "snail";
  if (!isRoundGameId(raw)) {
    return Response.json({ error: "회차가 없는 게임입니다." }, { status: 400 });
  }

  const now = Date.now();
  // 빙고만 회차가 사슬처럼 이어진다 (관리자가 추첨을 앞당길 수 있어서).
  const payload =
    raw === "bingo"
      ? bingoRoundPayload(await bingoSchedule(now), now)
      : currentRoundPayload(raw, now);

  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
