import { ApiError, errorResponse, requireAdmin, requireUser } from "@/lib/api-auth";
import {
  grantCoins,
  listUsers,
  recentLedger,
  resetPassword,
  setAdmin,
  skipBingoDraw,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const me = await requireUser(req);
    requireAdmin(me);
    const [users, ledger] = await Promise.all([listUsers(), recentLedger()]);
    return Response.json({ users, ledger }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireUser(req);
    requireAdmin(me);

    const body = (await req.json()) as {
      action?: "grant" | "setAdmin" | "resetPassword" | "bingoSkip";
      uid?: string;
      amount?: number;
      memo?: string;
      isAdmin?: boolean;
      password?: string;
    };

    if (body.action === "bingoSkip") {
      return Response.json({ ok: true, schedule: await skipBingoDraw(me, Date.now()) });
    }

    if (!body.uid) throw new ApiError("대상 사용자를 지정해 주세요.", 400);

    if (body.action === "setAdmin") {
      await setAdmin(me, body.uid, Boolean(body.isAdmin));
      return Response.json({ ok: true });
    }

    if (body.action === "resetPassword") {
      await resetPassword(me, body.uid, body.password ?? "");
      return Response.json({ ok: true });
    }

    const balance = await grantCoins(me, body.uid, Math.floor(Number(body.amount)), body.memo ?? "");
    return Response.json({ ok: true, balance });
  } catch (err) {
    return errorResponse(err);
  }
}
