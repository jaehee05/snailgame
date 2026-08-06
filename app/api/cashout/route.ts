import { ApiError, errorResponse, requireUser } from "@/lib/api-auth";
import { cashOut } from "@/lib/db";
import { roundIdAt } from "@/lib/round";

export const dynamic = "force-dynamic";

/** 그래프 인출. 지금 몇 배인지는 서버 시계로만 판단한다. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json()) as { roundId?: number };

    const now = Date.now();
    const roundId = body.roundId ?? roundIdAt("crash", now);
    if (roundId !== roundIdAt("crash", now)) throw new ApiError("회차가 바뀌었습니다.", 409);

    return Response.json(await cashOut(user.uid, roundId, now));
  } catch (err) {
    return errorResponse(err);
  }
}
