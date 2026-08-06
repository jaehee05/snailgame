import { chainSchedule } from "@/lib/db";
import { isRoundGameId } from "@/lib/games/types";
import { chainRoundPayload, currentRoundPayload } from "@/lib/round";

export const dynamic = "force-dynamic";

/** 로그인 없이도 볼 수 있는 회차 정보 (공개 데이터 · 커밋 해시 · 공개된 시드) */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("game") ?? "snail";
  if (!isRoundGameId(raw)) {
    return Response.json({ error: "회차가 없는 게임입니다." }, { status: 400 });
  }

  const now = Date.now();
  // 빙고·그래프는 회차 길이가 매번 달라 사슬로 이어진다.
  const payload =
    raw === "bingo" || raw === "crash"
      ? chainRoundPayload(raw, await chainSchedule(raw, now), now)
      : currentRoundPayload(raw, now);

  return Response.json(payload, { headers: { "cache-control": "no-store" } });
}
