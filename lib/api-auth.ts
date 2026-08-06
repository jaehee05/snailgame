import "server-only";

import { uidFromRequest } from "./auth-session";
import { getUser, type UserDoc } from "./db";
import { ConfigError } from "./firebase-admin";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** 세션 쿠키를 확인하고 사용자를 돌려준다. */
export async function requireUser(req: Request): Promise<UserDoc> {
  const uid = uidFromRequest(req);
  if (!uid) throw new ApiError("로그인이 필요합니다.", 401);

  const user = await getUser(uid);
  if (!user) throw new ApiError("세션이 만료되었습니다. 다시 로그인해 주세요.", 401);
  return user;
}

export function requireAdmin(user: UserDoc): void {
  if (!user.isAdmin) throw new ApiError("관리자만 접근할 수 있습니다.", 403);
}

/** Firestore gRPC PERMISSION_DENIED. 사용자 잘못이 아니라 서비스 계정 권한 설정 문제다. */
function isFirestorePermissionError(err: unknown): boolean {
  return (err as { code?: number })?.code === 7;
}

export function errorResponse(err: unknown): Response {
  if (!(err instanceof ApiError)) console.error("[snailgame]", err);

  if (isFirestorePermissionError(err)) {
    return Response.json(
      {
        error:
          "서버가 데이터베이스에 접근할 수 없습니다. 서비스 계정에 Cloud Datastore User 권한을 부여해 주세요.",
      },
      { status: 500 }
    );
  }

  const status = err instanceof ApiError ? err.status : err instanceof ConfigError ? 500 : 400;
  const message = err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
  return Response.json({ error: message }, { status });
}
