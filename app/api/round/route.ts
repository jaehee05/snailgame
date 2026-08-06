import { currentRoundPayload } from "@/lib/round";

export const dynamic = "force-dynamic";

/** 로그인 없이도 볼 수 있는 회차 정보 (출전표 · 배당 · 커밋 해시 · 공개된 시드) */
export async function GET() {
  return Response.json(currentRoundPayload(Date.now()), {
    headers: { "cache-control": "no-store" },
  });
}
