import "server-only";

import { ensureUser, getUser, type UserDoc } from "./db";
import { adminAuth } from "./firebase-admin";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function bearer(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError("로그인이 필요합니다.", 401);
  return token;
}

/** Firebase ID 토큰을 검증하고, 없으면 사용자 문서를 만들어서 돌려준다. */
export async function requireUser(req: Request, wantedNick?: string): Promise<UserDoc> {
  const token = bearer(req);

  let verifier;
  try {
    verifier = adminAuth();
  } catch (err) {
    // 서비스 계정이 없는 건 로그인 문제가 아니라 서버 설정 문제다.
    throw new ApiError(err instanceof Error ? err.message : "서버 설정 오류", 500);
  }

  let decoded;
  try {
    decoded = await verifier.verifyIdToken(token);
  } catch {
    throw new ApiError("로그인 정보가 만료되었습니다. 다시 로그인해 주세요.", 401);
  }
  const email = decoded.email ?? `${decoded.uid}@anonymous`;
  return (await getUser(decoded.uid)) ?? (await ensureUser(decoded.uid, email, wantedNick));
}

export function errorResponse(err: unknown): Response {
  const status = err instanceof ApiError ? err.status : 400;
  const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
  if (!(err instanceof ApiError) && status === 400) {
    console.error("[snailgame]", err);
  }
  return Response.json({ error: message }, { status });
}
