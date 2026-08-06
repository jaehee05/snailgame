import { ApiError, errorResponse, requireUser } from "@/lib/api-auth";
import { BET_META, isValidSelection, type BetKind } from "@/lib/bets";
import { FIELD, roundIdAt } from "@/lib/config";
import { placeBet } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json()) as {
      roundId?: number;
      kind?: BetKind;
      picks?: number[];
      amount?: number;
    };

    const kind = body.kind;
    if (!kind || !BET_META[kind]) throw new ApiError("베팅 종류가 올바르지 않습니다.", 400);

    const picks = body.picks ?? [];
    if (!isValidSelection({ kind, picks }, FIELD)) {
      throw new ApiError("선택한 달팽이 조합이 올바르지 않습니다.", 400);
    }

    const now = Date.now();
    const roundId = body.roundId ?? roundIdAt(now);
    // 화면이 조금 늦어 이전 회차 번호로 들어오면 그냥 거절한다. (마감 후 베팅 방지)
    if (roundId !== roundIdAt(now)) throw new ApiError("회차가 바뀌었습니다. 다시 시도해 주세요.", 409);

    const { bet, balance } = await placeBet(
      user.uid,
      roundId,
      kind,
      picks,
      Math.floor(Number(body.amount)),
      now
    );

    return Response.json({ bet, balance });
  } catch (err) {
    return errorResponse(err);
  }
}
