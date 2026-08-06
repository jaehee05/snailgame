import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { hashPassword, newUid, verifyPassword } from "./auth-session";
import { isValidSelection, oddsFor, payoutOf, type BetKind, type PlacedBet } from "./bets";
import {
  BINGO_RESULT_MS,
  BINGO_TIMING,
  normalSchedule,
  settleAtOfSchedule,
} from "./games/bingo";
import { drawTriple, TRIPLE_PRICE, type TripleResult } from "./games/triple";
import { FIELD, MAX_BET, MIN_BET, START_BALANCE } from "./config";
import { adminDb } from "./firebase-admin";
import {
  bestRank,
  drawBalls,
  isValidPicks,
  MAX_TICKETS as BINGO_MAX_TICKETS,
  prizeOf,
  TICKET_PRICE,
} from "./games/bingo";
import {
  CRASH_MAX_ROUND_MS,
  CRASH_TIMING,
  crashEndOf,
  crashSettle,
  isValidAutoTarget,
  multAt,
  type CrashBetExtra,
} from "./games/crash";
import { isOddEvenSelection, oddEvenHit, oddEvenOdds, oddEvenOutcome } from "./games/oddeven";
import type { ChainGameId, GameId, RoundGameId, RoundSchedule, Selection } from "./games/types";
import {
  crashPointOfRound,
  isBettingOpen,
  isRoundFinished,
  roundStart,
  settleAtOf,
  snailCore,
  snailOutcome,
} from "./round";
import { secretSeedOf } from "./seeds";

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
  game: GameId;
  roundId: number;
  /** 게임별 결과 요약 (달팽이는 순위, 홀짝은 숫자, 그래프는 터진 배수) */
  summary: number[];
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
  // 앞뒤가 이중 밑줄인 이름(__foo__)은 Firestore 문서 ID 예약어라 쓸 수 없다.
  if (/^__.*__$/.test(nick)) return false;
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

  // 쓸 수 없는 형식이면 조회조차 하지 않는다 (Firestore 예약어로 조회하면 에러가 난다)
  if (!nickIsValid(nick.trim())) throw failed;

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

export async function betsForRound(
  uid: string,
  game: RoundGameId,
  roundId: number
): Promise<PlacedBet[]> {
  const snap = await adminDb()
    .collection("users")
    .doc(uid)
    .collection("bets")
    .where("game", "==", game)
    .where("roundId", "==", roundId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PlacedBet, "id">) }));
}

export async function recentResults(uid: string, limit = 20): Promise<RoundResult[]> {
  const snap = await adminDb()
    .collection("users")
    .doc(uid)
    .collection("results")
    .orderBy("at", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    // 달팽이 하나뿐이던 시절 기록에는 game 이 없고 순위가 order 에 들어 있다.
    const raw = d.data() as RoundResult & { order?: number[] };
    return {
      ...raw,
      game: raw.game ?? "snail",
      summary: raw.summary ?? raw.order ?? [],
      bets: raw.bets ?? [],
    };
  });
}

/** 게임별로 베팅이 성립하는지 확인하고 서버가 배당을 다시 계산한다. */
function validateAndPrice(
  game: RoundGameId,
  roundId: number,
  sel: Selection
): { odds: number } {
  switch (game) {
    case "snail": {
      if (!isValidSelection({ kind: sel.kind as BetKind, picks: sel.picks }, FIELD)) {
        throw new Error("선택한 달팽이 조합이 올바르지 않습니다.");
      }
      return { odds: oddsFor(snailCore(roundId).odds, { kind: sel.kind as BetKind, picks: sel.picks }) };
    }
    case "oddeven": {
      if (!isOddEvenSelection(sel)) throw new Error("베팅 종류가 올바르지 않습니다.");
      return { odds: oddEvenOdds(sel) };
    }
    case "crash": {
      if (sel.kind !== "ride") throw new Error("베팅 종류가 올바르지 않습니다.");
      return { odds: 1 }; // 실제 배당은 인출 시점에 정해진다
    }
    case "bingo": {
      if (sel.kind !== "ticket") throw new Error("베팅 종류가 올바르지 않습니다.");
      if (!isValidPicks(sel.picks)) {
        throw new Error("B·I·G·O 5개씩, N 4개씩 모두 24개를 골라야 합니다.");
      }
      return { odds: 0 }; // 당첨금은 등수로 정해진다
    }
  }
}

export async function placeBet(
  uid: string,
  game: RoundGameId,
  roundId: number,
  sel: Selection,
  amount: number,
  autoTarget: number | undefined,
  now: number
): Promise<{ bet: PlacedBet; balance: number }> {
  if (game === "bingo" || game === "crash") {
    const sched = await chainSchedule(game, now);
    if (roundId !== sched.roundId || now >= sched.drawAt) {
      throw new Error("이번 회차 베팅이 마감되었습니다.");
    }
  } else if (!isBettingOpen(game, roundId, now)) {
    throw new Error("이번 회차 베팅이 마감되었습니다.");
  }
  if (!Number.isInteger(amount) || amount < MIN_BET || amount > MAX_BET) {
    throw new Error(
      `베팅 금액은 ${MIN_BET.toLocaleString()} ~ ${MAX_BET.toLocaleString()} 코인 사이여야 합니다.`
    );
  }
  if (game === "crash" && !isValidAutoTarget(autoTarget)) {
    throw new Error("자동 인출 배수가 올바르지 않습니다.");
  }
  if (game === "bingo" && amount !== TICKET_PRICE) {
    throw new Error(`빙고는 한 장에 ${TICKET_PRICE.toLocaleString()} 코인입니다.`);
  }

  const { odds } = validateAndPrice(game, roundId, sel);

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const betRef = userRef.collection("bets").doc();

  const bet: PlacedBet = {
    id: betRef.id,
    game,
    roundId,
    kind: sel.kind,
    picks: sel.picks,
    amount,
    odds,
    ...(game === "crash" && autoTarget ? { autoTarget } : {}),
  };

  const balance = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error("사용자를 찾을 수 없습니다.");
    const user = snap.data() as UserDoc;
    if (user.balance < amount) throw new Error("잔액이 부족합니다.");

    const existing = await tx.get(
      userRef.collection("bets").where("roundId", "==", roundId).where("game", "==", game)
    );
    if (existing.size >= MAX_BETS_PER_ROUND) {
      throw new Error(`한 회차에 최대 ${MAX_BETS_PER_ROUND}건까지 베팅할 수 있습니다.`);
    }
    // 그래프는 회차당 한 판만 태울 수 있게 한다 (인출 판정이 단순해진다)
    if (game === "crash" && existing.size >= 1) {
      throw new Error("그래프는 회차당 한 번만 베팅할 수 있습니다.");
    }
    if (game === "bingo" && existing.size >= BINGO_MAX_TICKETS) {
      throw new Error(`한 회차에 최대 ${BINGO_MAX_TICKETS}장까지 살 수 있습니다.`);
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
 * 그래프 인출. 지금 몇 배인지는 서버 시계로만 판단한다.
 * 이미 터진 뒤라면 거절한다.
 */
export async function cashOut(
  uid: string,
  roundId: number,
  now: number
): Promise<{ mult: number; payout: number }> {
  const sched = await chainSchedule("crash", now);
  if (roundId !== sched.roundId) throw new Error("회차가 바뀌었습니다.");
  const elapsed = now - sched.startAt;
  if (elapsed < CRASH_TIMING.betMs) throw new Error("아직 출발 전입니다.");

  const crashPoint = crashPointOfRound(roundId);
  const mult = Math.floor(multAt(elapsed - CRASH_TIMING.betMs) * 100) / 100;
  if (mult > crashPoint) throw new Error("이미 터졌습니다.");

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    const found = await tx.get(
      userRef.collection("bets").where("roundId", "==", roundId).where("game", "==", "crash")
    );
    if (found.empty) throw new Error("이번 회차에 베팅한 내역이 없습니다.");
    const doc = found.docs[0];
    const bet = doc.data() as PlacedBet & { settled: boolean };
    if (bet.cashoutMult) throw new Error("이미 인출했습니다.");
    if (bet.settled) throw new Error("이미 정산된 회차입니다.");

    tx.update(doc.ref, { cashoutMult: mult });
    return { mult, payout: Math.floor(bet.amount * mult) };
  });
}

/** 회차 결과를 게임별로 계산해 베팅 하나하나를 정산한다. */
type GameOutcome =
  | { game: "snail"; order: number[] }
  | { game: "oddeven"; draw: ReturnType<typeof oddEvenOutcome> }
  | { game: "crash"; crashPoint: number }
  | { game: "bingo"; balls: number[] };

function outcomeOf(game: RoundGameId, roundId: number): GameOutcome {
  switch (game) {
    case "snail":
      return { game: "snail", order: snailOutcome(roundId).order };
    case "oddeven":
      return { game: "oddeven", draw: oddEvenOutcome(secretSeedOf("oddeven", roundId)) };
    case "crash":
      return { game: "crash", crashPoint: crashPointOfRound(roundId) };
    case "bingo":
      return { game: "bingo", balls: drawBalls(secretSeedOf("bingo", roundId)) };
  }
}

function settleOne(bet: PlacedBet, outcome: GameOutcome): { hit: boolean; payout: number } {
  switch (outcome.game) {
    case "snail":
      return payoutOf(bet, outcome.order);
    case "oddeven": {
      const hit = oddEvenHit({ kind: bet.kind, picks: bet.picks }, outcome.draw);
      return { hit, payout: hit ? Math.floor(bet.amount * bet.odds) : 0 };
    }
    case "crash": {
      const extra: CrashBetExtra = { autoTarget: bet.autoTarget, cashoutMult: bet.cashoutMult };
      const { hit, payout } = crashSettle(bet.amount, extra, outcome.crashPoint);
      return { hit, payout };
    }
    case "bingo": {
      const rank = bestRank(bet.picks, new Set(outcome.balls));
      return { hit: rank > 0, payout: prizeOf(rank) };
    }
  }
}

function summaryOf(outcome: GameOutcome): number[] {
  switch (outcome.game) {
    case "snail":
      return outcome.order;
    case "oddeven":
      return [outcome.draw.number];
    case "crash":
      return [outcome.crashPoint];
    case "bingo":
      return outcome.balls;
  }
}

/**
 * 아직 정산되지 않은 베팅 중 결과가 확정된 회차를 찾아 정산한다.
 * 별도 크론 없이, 사용자가 접속할 때마다 밀린 회차를 따라잡는 방식이다.
 */
export async function settleUser(uid: string, now: number): Promise<RoundResult[]> {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const pending = await userRef.collection("bets").where("settled", "==", false).get();
  if (pending.empty) return [];

  const [bingo, crash] = await Promise.all([chainSchedule("bingo", now), chainSchedule("crash", now)]);
  const chainFinished = (game: ChainGameId, roundId: number) => {
    const s = game === "bingo" ? bingo : crash;
    const settleAt = game === "bingo" ? settleAtOfSchedule(s) : s.endAt - CRASH_TIMING.resultMs;
    return roundId < s.roundId || now >= settleAt;
  };

  // (게임, 회차) 단위로 묶는다
  const groups = new Map<string, { game: RoundGameId; roundId: number; docs: typeof pending.docs }>();
  for (const doc of pending.docs) {
    const data = doc.data() as PlacedBet;
    // 게임이 하나뿐이던 시절의 베팅에는 game 필드가 없다.
    const game = (data.game ?? "snail") as RoundGameId;
    // 즉석복권은 즉석 정산이라 여기 올 일이 없다.
    if (game === ("triple" as RoundGameId)) continue;
    const { roundId } = data;
    const finished =
      game === "bingo" || game === "crash"
        ? chainFinished(game, roundId)
        : isRoundFinished(game, roundId, now);
    if (!finished) continue;
    const key = `${game}:${roundId}`;
    const group = groups.get(key) ?? { game, roundId, docs: [] };
    group.docs.push(doc);
    groups.set(key, group);
  }

  const results: RoundResult[] = [];
  const ordered = [...groups.values()].sort(
    (a, b) => roundStart(a.game, a.roundId) - roundStart(b.game, b.roundId)
  );

  for (const { game, roundId, docs } of ordered) {
    const outcome = outcomeOf(game, roundId);

    const result = await db.runTransaction(async (tx) => {
      const fresh = await Promise.all(docs.map((d) => tx.get(d.ref)));
      const settledBets: PlacedBet[] = [];
      let staked = 0;
      let returned = 0;

      for (const snap of fresh) {
        if (!snap.exists) continue;
        const data = snap.data() as PlacedBet & { settled: boolean };
        if (data.settled) continue;
        const { hit, payout } = settleOne(data, outcome);
        staked += data.amount;
        returned += payout;
        settledBets.push({ ...data, hit, payout });
        tx.update(snap.ref, { settled: true, hit, payout });
      }

      if (settledBets.length === 0) return null;

      const roundResult: RoundResult = {
        game,
        roundId,
        summary: summaryOf(outcome),
        staked,
        returned,
        bets: settledBets,
        at:
          game === "bingo"
            ? settleAtOfSchedule(bingo)
            : game === "crash"
              ? crash.endAt - CRASH_TIMING.resultMs
              : roundStart(game, roundId) + settleAtOf(game, roundId),
      };
      tx.set(userRef.collection("results").doc(`${game}_${roundId}`), roundResult);
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


/* ── 사슬 회차 일정 (빙고 · 그래프) ──────────────── */

/*
 * 다른 게임은 회차가 시계 격자 위에서만 돌아간다. 하지만
 *   빙고 — 관리자가 추첨을 앞당길 수 있고
 *   그래프 — 터지는 시점이 회차마다 달라 길이가 들쭉날쭉하다
 * 이 둘은 회차가 끝나는 대로 다음 회차가 열려야 해서, 격자 대신 회차를
 * 사슬처럼 이어 붙인다. 현재 회차의 일정만 control/<게임> 에 들고 있으면 된다.
 *
 * 언제 끝나는지만 달라질 뿐, 무엇이 나오는지는 회차 번호에서 나온 시드가
 * 정하므로 결과를 손댈 수는 없다.
 */

/** 오래 아무도 안 들어왔으면 굳이 따라잡지 않고 지금부터 새로 시작한다. */
const RESYNC_AFTER = 10 * 60_000;

const cachedSchedule: Partial<Record<ChainGameId, { at: number; value: RoundSchedule }>> = {};

function baseSchedule(game: ChainGameId, roundId: number, startAt: number): RoundSchedule {
  if (game === "bingo") return normalSchedule(roundId, startAt);
  return {
    roundId,
    startAt,
    drawAt: startAt + CRASH_TIMING.betMs,
    endAt: startAt + crashEndOf(secretSeedOf("crash", roundId)),
  };
}

function roundLengthOf(game: ChainGameId): number {
  return game === "bingo" ? BINGO_TIMING.roundMs : CRASH_MAX_ROUND_MS;
}

function firstSchedule(game: ChainGameId, now: number): RoundSchedule {
  const len = roundLengthOf(game);
  const id = Math.floor(now / len);
  return baseSchedule(game, id, id * len);
}

function advance(game: ChainGameId, s: RoundSchedule, now: number): RoundSchedule {
  if (now - s.endAt > RESYNC_AFTER) return baseSchedule(game, s.roundId + 1, now);
  let cur = s;
  let guard = 0;
  while (now >= cur.endAt && guard++ < 5_000) {
    cur = baseSchedule(game, cur.roundId + 1, cur.endAt);
  }
  return cur;
}

/** 지금 진행 중인 회차. 끝난 회차는 여기서 다음 회차로 넘긴다. */
export async function chainSchedule(
  game: ChainGameId,
  now: number,
  fresh = false
): Promise<RoundSchedule> {
  const hit = cachedSchedule[game];
  if (!fresh && hit && now - hit.at < 2_000 && now < hit.value.endAt) return hit.value;

  const ref = adminDb().collection("control").doc(game);
  const next = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() as RoundSchedule) : firstSchedule(game, now);
    const moved = advance(game, current, now);
    if (!snap.exists || moved.roundId !== current.roundId) tx.set(ref, moved);
    return moved;
  });

  cachedSchedule[game] = { at: now, value: next };
  return next;
}

export async function skipBingoDraw(by: UserDoc, now: number): Promise<RoundSchedule> {
  if (!by.isAdmin) throw new Error("권한이 없습니다.");

  const ref = adminDb().collection("control").doc("bingo");
  const updated = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = advance(
      "bingo",
      snap.exists ? (snap.data() as RoundSchedule) : firstSchedule("bingo", now),
      now
    );

    // 화면들이 따라올 시간을 조금 준다.
    const drawAt = now + 3_000;
    if (drawAt >= current.drawAt) throw new Error("이미 추첨이 시작되었습니다.");

    // 추첨이 끝나면 결과를 잠깐 보여주고 바로 다음 회차가 열린다.
    const moved: RoundSchedule = {
      ...current,
      drawAt,
      endAt: drawAt + BINGO_TIMING.drawMs + BINGO_RESULT_MS,
    };
    tx.set(ref, moved);
    return moved;
  });

  cachedSchedule.bingo = { at: now, value: updated };
  return updated;
}

/* ── 즉석복권 (즉석복권) ─/* ── 즉석복권 (즉석복권) ─────────────────────────── */

export type ScratchTicket = {
  id: string;
  seed: string;
  result: TripleResult;
  balance: number;
  at: number;
};

/**
 * 즉석복권 한 장. 회차가 없으므로 사는 즉시 결과가 정해지고 바로 정산된다.
 * 결과는 서버가 만든 문서 ID 로 만든 시드에서 나오므로 미리 알 수 없고,
 * 시드를 같이 돌려주기 때문에 사후에 직접 다시 계산해 볼 수 있다.
 */
export async function buyScratch(uid: string, now: number): Promise<ScratchTicket> {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const betRef = userRef.collection("bets").doc();
  const seed = `${betRef.id}:${uid}`;
  const result = drawTriple(seed);

  const balance = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error("사용자를 찾을 수 없습니다.");
    const user = snap.data() as UserDoc;
    if (user.balance < TRIPLE_PRICE) throw new Error("잔액이 부족합니다.");

    tx.set(betRef, {
      id: betRef.id,
      game: "triple",
      roundId: Math.floor(now / 1000),
      kind: "scratch",
      picks: [],
      amount: TRIPLE_PRICE,
      odds: 0,
      settled: true,
      hit: result.prize > 0,
      payout: result.prize,
      createdAt: now,
    });

    tx.set(userRef.collection("results").doc(`triple_${betRef.id}`), {
      game: "triple",
      roundId: Math.floor(now / 1000),
      summary: [result.rank, result.bonusRank],
      staked: TRIPLE_PRICE,
      returned: result.prize,
      bets: [],
      at: now,
    });

    tx.update(userRef, {
      balance: FieldValue.increment(result.prize - TRIPLE_PRICE),
      staked: FieldValue.increment(TRIPLE_PRICE),
      returned: FieldValue.increment(result.prize),
    });

    return user.balance - TRIPLE_PRICE + result.prize;
  });

  return { id: betRef.id, seed, result, balance, at: now };
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
