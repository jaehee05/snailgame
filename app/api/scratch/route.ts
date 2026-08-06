import { errorResponse, requireUser } from "@/lib/api-auth";
import { buyScratch } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 즉석복권 한 장 구입. 회차가 없어서 사는 즉시 결과가 나온다. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    return Response.json(await buyScratch(user.uid, Date.now()));
  } catch (err) {
    return errorResponse(err);
  }
}
