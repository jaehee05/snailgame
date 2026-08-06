import { ApiError, errorResponse, requireUser } from "@/lib/api-auth";
import { bingoSchedule, placeBet } from "@/lib/db";
import { isRoundGameId } from "@/lib/games/types";
import { roundIdAt } from "@/lib/round";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json()) as {
      game?: string;
      roundId?: number;
      kind?: string;
      picks?: number[];
      amount?: number;
      autoTarget?: number;
    };

    if (!isRoundGameId(body.game)) throw new ApiError("알 수 없는 게임입니다.", 400);
    if (!body.kind) throw new ApiError("베팅 종류가 올바르지 않습니다.", 400);

    const now = Date.now();
    // 빙고는 회차가 시계 격자가 아니라 사슬로 이어진다.
    const currentId =
      body.game === "bingo" ? (await bingoSchedule(now)).roundId : roundIdAt(body.game, now);
    const roundId = body.roundId ?? currentId;
    // 화면이 조금 늦어 이전 회차 번호로 들어오면 그냥 거절한다. (마감 후 베팅 방지)
    if (roundId !== currentId) {
      throw new ApiError("회차가 바뀌었습니다. 다시 시도해 주세요.", 409);
    }

    const { bet, balance } = await placeBet(
      user.uid,
      body.game,
      roundId,
      { kind: body.kind, picks: body.picks ?? [] },
      Math.floor(Number(body.amount)),
      body.autoTarget === undefined ? undefined : Number(body.autoTarget),
      now
    );

    return Response.json({ bet, balance });
  } catch (err) {
    return errorResponse(err);
  }
}
