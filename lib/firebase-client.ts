"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// 웹 설정값은 공개되어도 되는 값이다. 실제 권한은 Firestore 보안 규칙과
// 서버(Admin SDK)에서만 통제한다. firestore.rules 참고.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyBER38KeBglIujQHMDvbQaQeE1byKo9K9k",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "snailgame-b08e2.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "snailgame-b08e2",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "snailgame-b08e2.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "527047264288",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:527047264288:web:4c66a7f2f6f655ecfe1445",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
