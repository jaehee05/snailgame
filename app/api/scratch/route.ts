import { errorResponse, requireUser } from "@/lib/api-auth";
import { buyScratch } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 즉석복권 구입. 회차가 없어서 사는 즉시 결과가 나온다. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as { count?: number };
    const count = Math.floor(Number(body.count ?? 1));
    return Response.json(await buyScratch(user.uid, count, Date.now()));
  } catch (err) {
    return errorResponse(err);
  }
}
