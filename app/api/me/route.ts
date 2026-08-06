import { errorResponse, requireUser } from "@/lib/api-auth";
import { roundIdAt } from "@/lib/config";
import { betsForRound, getUser, recentResults, settleUser } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 내 상태 조회. 호출될 때마다 밀린 회차 정산을 먼저 따라잡는다. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const nick = url.searchParams.get("nick") ?? undefined;
    const user = await requireUser(req, nick);

    const now = Date.now();
    const justSettled = await settleUser(user.uid, now);
    const fresh = justSettled.length > 0 ? ((await getUser(user.uid)) ?? user) : user;

    const roundId = roundIdAt(now);
    const [bets, results] = await Promise.all([
      betsForRound(user.uid, roundId),
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
