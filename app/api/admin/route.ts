import { ApiError, errorResponse, requireUser } from "@/lib/api-auth";
import { grantCoins, listUsers, recentLedger, setAdmin } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const me = await requireUser(req);
    if (!me.isAdmin) throw new ApiError("관리자만 접근할 수 있습니다.", 403);
    const [users, ledger] = await Promise.all([listUsers(), recentLedger()]);
    return Response.json({ users, ledger }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireUser(req);
    if (!me.isAdmin) throw new ApiError("관리자만 접근할 수 있습니다.", 403);

    const body = (await req.json()) as {
      action?: "grant" | "setAdmin";
      uid?: string;
      amount?: number;
      memo?: string;
      isAdmin?: boolean;
    };

    if (!body.uid) throw new ApiError("대상 사용자를 지정해 주세요.", 400);

    if (body.action === "setAdmin") {
      await setAdmin(me, body.uid, Boolean(body.isAdmin));
      return Response.json({ ok: true });
    }

    const balance = await grantCoins(me, body.uid, Math.floor(Number(body.amount)), body.memo ?? "");
    return Response.json({ ok: true, balance });
  } catch (err) {
    return errorResponse(err);
  }
}
