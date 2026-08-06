import "server-only";

import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// firebase-admin/auth 는 쓰지 않는다. 로그인은 자체 구현이고, 저 모듈을 불러오면
// jwks-rsa → jose 가 딸려 오는데 서버리스에서 ERR_REQUIRE_ESM 으로 터진다.

/** 사용자 입력 문제가 아니라 서버 설정 문제라는 표시 (HTTP 500 으로 나간다) */
export class ConfigError extends Error {}

function readServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
  }

  throw new ConfigError(
    "Firebase 서비스 계정이 없습니다. FIREBASE_SERVICE_ACCOUNT (서비스 계정 JSON 또는 base64) 를 환경변수로 설정하세요."
  );
}

let cached: App | undefined;

function adminApp(): App {
  if (cached) return cached;
  cached = getApps().length ? getApps()[0] : initializeApp({ credential: cert(readServiceAccount()) });
  return cached;
}

export function adminDb() {
  const db = getFirestore(adminApp());
  return db;
}
