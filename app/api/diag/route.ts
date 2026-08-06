export const dynamic = "force-dynamic";

/**
 * 배포 환경 진단용 임시 라우트. 원인 확인 후 삭제한다.
 * 비밀값은 길이와 앞 몇 글자만 노출한다.
 */
export async function GET() {
  const out: Record<string, unknown> = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "(local)",
    node: process.version,
    region: process.env.VERCEL_REGION ?? "(local)",
  };

  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  out.env = {
    FIREBASE_SERVICE_ACCOUNT: sa ? `있음 (${sa.length}자, "${sa.slice(0, 6)}…")` : "없음",
    AUTH_SECRET: process.env.AUTH_SECRET ? `있음 (${process.env.AUTH_SECRET.length}자)` : "없음",
    ROUND_SECRET: process.env.ROUND_SECRET ? `있음 (${process.env.ROUND_SECRET.length}자)` : "없음",
  };

  // 1. 서비스 계정 파싱
  try {
    if (!sa) throw new Error("환경변수 없음");
    const json = sa.trim().startsWith("{") ? sa : Buffer.from(sa, "base64").toString("utf8");
    const parsed = JSON.parse(json) as { project_id?: string; client_email?: string; private_key?: string };
    out.parse = {
      형식: sa.trim().startsWith("{") ? "raw JSON" : "base64",
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: parsed.private_key?.startsWith("-----BEGIN PRIVATE KEY-----") ? "정상" : "이상함",
    };
  } catch (err) {
    out.parse = `실패: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 2. 모듈 로드 (동적 import 라서 실패해도 함수가 죽지 않는다)
  try {
    await import("firebase-admin/app");
    await import("firebase-admin/firestore");
    out.moduleLoad = "성공";
  } catch (err) {
    out.moduleLoad = `실패: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`;
    return Response.json(out, { status: 200 });
  }

  // 3. 실제 Firestore 읽기
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const snap = await adminDb().collection("users").limit(1).get();
    out.firestore = `성공 (문서 ${snap.size}건)`;
  } catch (err) {
    const e = err as { code?: number; message?: string; name?: string };
    out.firestore = `실패: ${e.name ?? ""} code=${e.code ?? "-"} ${e.message ?? String(err)}`;
  }

  return Response.json(out, { status: 200 });
}
