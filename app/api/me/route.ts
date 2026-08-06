import { errorResponse, requireUser } from "@/lib/api-auth";
import { betsForRound, bingoSchedule, getUser, recentResults, settleUser } from "@/lib/db";
import { isRoundGameId } from "@/lib/games/types";
import { roundIdAt } from "@/lib/round";

export const dynamic = "force-dynamic";

/** 내 상태 조회. 호출될 때마다 밀린 회차 정산을 먼저 따라잡는다. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);

    const raw = new URL(req.url).searchParams.get("game") ?? "snail";
    const game = isRoundGameId(raw) ? raw : "snail";

    const now = Date.now();
    const justSettled = await settleUser(user.uid, now);
    const fresh = justSettled.length > 0 ? ((await getUser(user.uid)) ?? user) : user;

    // 빙고는 회차가 시계 격자가 아니라 사슬로 이어진다.
    const roundId = game === "bingo" ? (await bingoSchedule(now)).roundId : roundIdAt(game, now);
    const [bets, results] = await Promise.all([
      betsForRound(user.uid, game, roundId),
      recentResults(user.uid),
    ]);

    return Response.json(
      {
        user: {
          uid: fresh.uid,
          nick: fresh.nick,
          balance: fresh.balance,
          isAdmin: fresh.isAdmin,
          staked: fresh.staked,
          returned: fresh.returned,
        },
        game,
        roundId,
        bets,
        results,
        justSettled,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
