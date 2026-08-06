import { bingoOverride } from "@/lib/db";
import { isRoundGameId } from "@/lib/games/types";
import { currentRoundPayload } from "@/lib/round";

export const dynamic = "force-dynamic";

/** 로그인 없이도 볼 수 있는 회차 정보 (공개 데이터 · 커밋 해시 · 공개된 시드) */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("game") ?? "snail";
  if (!isRoundGameId(raw)) {
    return Response.json({ error: "회차가 없는 게임입니다." }, { status: 400 });
  }

  const now = Date.now();
  // 메가빙고만 관리자가 추첨을 앞당길 수 있다.
  const override = raw === "bingo" ? await bingoOverride(now) : null;

  return Response.json(currentRoundPayload(raw, now, override), {
    headers: { "cache-control": "no-store" },
  });
}
