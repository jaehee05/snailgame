import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { hashPassword, newUid, verifyPassword } from "./auth-session";
import { oddsFor, payoutOf, type BetKind, type PlacedBet } from "./bets";
import { MAX_BET, MIN_BET, START_BALANCE } from "./config";
import { adminDb } from "./firebase-admin";
import { isBettingOpen, isRoundFinished, roundCore, roundOutcome } from "./round";

export type UserDoc = {
  uid: string;
  nick: string;
  /** 로그인에 쓰는 소문자 아이디 (닉네임과 같지만 대소문자 무시) */
  loginId: string;
  passSalt: string;
  passHash: string;
  balance: number;
  isAdmin: boolean;
  createdAt: number;
  staked: number;
  returned: number;
};

/** 비밀번호 해시를 뺀, 밖으로 내보내도 되는 형태 */
export type PublicUser = Omit<UserDoc, "passSalt" | "passHash">;

export function publicUser(user: UserDoc): PublicUser {
  return {
    uid: user.uid,
    nick: user.nick,
    loginId: user.loginId,
    balance: user.balance,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
    staked: user.staked,
    returned: user.returned,
  };
}

export type RoundResult = {
  roundId: number;
  order: number[];
  staked: number;
  returned: number;
  bets: PlacedBet[];
  at: number;
};

const MAX_BETS_PER_ROUND = 20;
const MIN_PASSWORD = 4;

function adminNicks(): string[] {
  return (process.env.ADMIN_NICKS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function nickIsValid(nick: string): boolean {
  return /^[가-힣a-zA-Z0-9_]{2,12}$/.test(nick);
}

/* ── 계정 ─────────────────────────────────────────── */

export async function registerUser(nick: string, password: string): Promise<UserDoc> {
  if (!nickIsValid(nick)) throw new Error("아이디는 한글/영문/숫자 2~12자여야 합니다.");
  if (password.length < MIN_PASSWORD) {
    throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`);
  }

  const db = adminDb();
  const loginId = nick.toLowerCase();
  const nickRef = db.collection("nicks").doc(loginId);
  const uid = newUid();
  const { salt, hash } = hashPassword(password);

  // 아무도 없을 때 처음 가입한 사람이 관리자가 된다.
  const firstUser = (await db.collection("users").limit(1).get()).empty;

  const user: UserDoc = {
    uid,
    nick,
    loginId,
    passSalt: salt,
    passHash: hash,
    balance: START_BALANCE,
    isAdmin: firstUser || adminNicks().includes(loginId),
    createdAt: Date.now(),
    staked: 0,
    returned: 0,
  };

  await db.runTransaction(async (tx) => {
    const taken = await tx.get(nickRef);
    if (taken.exists) throw new Error("이미 사용 중인 아이디입니다.");
    tx.set(nickRef, { uid });
    tx.set(db.collection("users").doc(uid), user);
  });

  return user;
}

export async function loginUser(nick: string, password: string): Promise<UserDoc> {
  const db = adminDb();
  const failed = new Error("아이디 또는 비밀번호가 올바르지 않습니다.");

  const nickSnap = await db.collection("nicks").doc(nick.trim().toLowerCase()).get();
  if (!nickSnap.exists) throw failed;

  const { uid } = nickSnap.data() as { uid: string };
  const user = await getUser(uid);
  if (!user || !verifyPassword(password, user.passSalt, user.passHash)) throw failed;

  return user;
}

export async function changePassword(uid: string, current: string, next: string): Promise<void> {
  if (next.length < MIN_PASSWORD) {
    throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`);
  }
  const user = await getUser(uid);
  if (!user || !verifyPassword(current, user.passSalt, user.passHash)) {
    throw new Error("현재 비밀번호가 올바르지 않습니다.");
  }
  const { salt, hash } = hashPassword(next);
  await adminDb().collection("users").doc(uid).update({ passSalt: salt, passHash: hash });
}

export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await adminDb().collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const snap = await adminDb().collection("users").orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => publicUser(d.data() as UserDoc));
}

/* ── 베팅 ─────────────────────────────────────────── */

export async function betsForRound(uid: string, roundId: number): Promise<PlacedBet[]> {
  const snap = await adminDb()
    .collection("users")
    .doc(uid)
    .collection("bets")
    .where("roundId", "==", roundId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlacedBet, "id">) }));
}

export async function recentResults(uid: string, limit = 20): Promise<RoundResult[]> {
  const snap = await adminDb()
    .collection("users")
    .doc(uid)
    .collection("results")
    .orderBy("roundId", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as RoundResult);
}

export async function placeBet(
  uid: string,
  roundId: number,
  kind: BetKind,
  picks: number[],
  amount: number,
  now: number
): Promise<{ bet: PlacedBet; balance: number }> {
  if (!isBettingOpen(roundId, now)) throw new Error("이번 회차 베팅이 마감되었습니다.");
  if (!Number.isInteger(amount) || amount < MIN_BET || amount > MAX_BET) {
    throw new Error(`베팅 금액은 ${MIN_BET.toLocaleString()} 코인 이상이어야 합니다.`);
  }

  // 배당은 클라이언트 값을 믿지 않고 서버가 다시 계산한다.
  const odds = oddsFor(roundCore(roundId).odds, { kind, picks });

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const betRef = userRef.collection("bets").doc();

  const bet: PlacedBet = { id: betRef.id, roundId, kind, picks, amount, odds };

  const balance = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error("사용자를 찾을 수 없습니다.");
    const user = snap.data() as UserDoc;
    if (user.balance < amount) throw new Error("잔액이 부족합니다.");

    const existing = await tx.get(userRef.collection("bets").where("roundId", "==", roundId));
    if (existing.size >= MAX_BETS_PER_ROUND) {
      throw new Error(`한 회차에 최대 ${MAX_BETS_PER_ROUND}건까지 베팅할 수 있습니다.`);
    }

    tx.set(betRef, { ...bet, settled: false, createdAt: now });
    tx.update(userRef, {
      balance: FieldValue.increment(-amount),
      staked: FieldValue.increment(amount),
    });
    return user.balance - amount;
  });

  return { bet, balance };
}

/**
 * 아직 정산되지 않은 베팅 중 경주가 끝난 회차를 찾아 정산한다.
 * 별도 크론 없이, 사용자가 접속할 때마다 밀린 회차를 따라잡는 방식이다.
 */
export async function settleUser(uid: string, now: number): Promise<RoundResult[]> {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const pending = await userRef.collection("bets").where("settled", "==", false).get();
  if (pending.empty) return [];

  const byRound = new Map<number, typeof pending.docs>();
  for (const doc of pending.docs) {
    const { roundId } = doc.data() as PlacedBet;
    if (!isRoundFinished(roundId, now)) continue;
    const list = byRound.get(roundId) ?? [];
    list.push(doc);
    byRound.set(roundId, list);
  }

  const results: RoundResult[] = [];

  for (const [roundId, docs] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
    const { order } = roundOutcome(roundId);

    const result = await db.runTransaction(async (tx) => {
      const fresh = await Promise.all(docs.map((d) => tx.get(d.ref)));
      const settledBets: PlacedBet[] = [];
      let staked = 0;
      let returned = 0;

      for (const snap of fresh) {
        if (!snap.exists) continue;
        const data = snap.data() as PlacedBet & { settled: boolean };
        if (data.settled) continue;
        const { hit, payout } = payoutOf(data, order);
        staked += data.amount;
        returned += payout;
        settledBets.push({ ...data, hit, payout });
        tx.update(snap.ref, { settled: true, hit, payout });
      }

      if (settledBets.length === 0) return null;

      const roundResult: RoundResult = {
        roundId,
        order,
        staked,
        returned,
        bets: settledBets,
        at: now,
      };
      tx.set(userRef.collection("results").doc(String(roundId)), roundResult);
      if (returned > 0) {
        tx.update(userRef, {
          balance: FieldValue.increment(returned),
          returned: FieldValue.increment(returned),
        });
      }
      return roundResult;
    });

    if (result) results.push(result);
  }

  return results;
}

/* ── 관리자 ───────────────────────────────────────── */

export async function grantCoins(
  by: UserDoc,
  toUid: string,
  amount: number,
  memo: string
): Promise<number> {
  if (!by.isAdmin) throw new Error("권한이 없습니다.");
  if (!Number.isInteger(amount) || amount === 0) throw new Error("지급 금액이 올바르지 않습니다.");
  if (Math.abs(amount) > 100_000_000) throw new Error("한 번에 지급할 수 있는 금액을 넘었습니다.");

  const db = adminDb();
  const userRef = db.collection("users").doc(toUid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error("대상 사용자를 찾을 수 없습니다.");
    const user = snap.data() as UserDoc;
    const next = user.balance + amount;
    if (next < 0) throw new Error("잔액보다 큰 금액을 회수할 수 없습니다.");
    tx.update(userRef, { balance: next });
    tx.set(db.collection("ledger").doc(), {
      type: amount > 0 ? "grant" : "revoke",
      byUid: by.uid,
      byNick: by.nick,
      toUid,
      toNick: user.nick,
      amount,
      memo: memo.slice(0, 200),
      at: Date.now(),
    });
    return next;
  });
}

export async function recentLedger(limit = 30) {
  const snap = await adminDb().collection("ledger").orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => d.data());
}

export async function setAdmin(by: UserDoc, targetUid: string, isAdmin: boolean): Promise<void> {
  if (!by.isAdmin) throw new Error("권한이 없습니다.");
  if (by.uid === targetUid && !isAdmin) throw new Error("본인의 관리자 권한은 해제할 수 없습니다.");
  await adminDb().collection("users").doc(targetUid).update({ isAdmin });
}

/** 관리자가 참가자 비밀번호를 초기화한다 (친구들끼리 쓰는 게임이라 이메일 인증이 없다) */
export async function resetPassword(by: UserDoc, targetUid: string, password: string): Promise<void> {
  if (!by.isAdmin) throw new Error("권한이 없습니다.");
  if (password.length < MIN_PASSWORD) {
    throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`);
  }
  const { salt, hash } = hashPassword(password);
  await adminDb().collection("users").doc(targetUid).update({ passSalt: salt, passHash: hash });
}
