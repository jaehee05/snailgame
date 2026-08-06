import "server-only";

import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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

  throw new Error(
    "Firebase 서비스 계정이 없습니다. FIREBASE_SERVICE_ACCOUNT (서비스 계정 JSON 또는 base64) 를 환경변수로 설정하세요."
  );
}

let cached: App | undefined;

function adminApp(): App {
  if (cached) return cached;
  cached = getApps().length ? getApps()[0] : initializeApp({ credential: cert(readServiceAccount()) });
  return cached;
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminDb() {
  const db = getFirestore(adminApp());
  return db;
}
