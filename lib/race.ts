import { BASE_SPEED, FIELD, MAX_TICKS, TRACK } from "./config";
import { rngFromSeed, shuffle } from "./prng";

export type SnailChar = {
  id: string;
  name: string;
  /** 몸통 색 */
  color: string;
  /** 껍데기 색 */
  shell: string;
  catch: string;
};

/** 전체 로스터. 회차마다 이 중 FIELD 마리가 추첨된다. */
export const ROSTER: SnailChar[] = [
  { id: "bori", name: "보리", color: "#7bd88f", shell: "#f2b134", catch: "느긋한 척 하지만 막판에 온다" },
  { id: "kkobuk", name: "꼬북", color: "#5fb3f5", shell: "#2f6fa8", catch: "젖은 길에서 강하다" },
  { id: "mint", name: "민트", color: "#5ee8c8", shell: "#e879f9", catch: "초반 스퍼트 전문" },
  { id: "tteok", name: "떡순", color: "#f7a8c4", shell: "#b04a6f", catch: "체력 하나는 타고났다" },
  { id: "kkae", name: "깨돌", color: "#c9a227", shell: "#6b4f1d", catch: "돌처럼 꾸준하다" },
  { id: "nunkkot", name: "눈꽃", color: "#dbe7ff", shell: "#8aa4d6", catch: "미끄러지듯 달린다" },
  { id: "gochu", name: "고추", color: "#ff6b5e", shell: "#a32a1f", catch: "불붙으면 아무도 못 막는다" },
  { id: "bam", name: "밤톨", color: "#a97551", shell: "#4e3324", catch: "야간 경주에 강하다" },
];

export type Racer = {
  lane: number;
  char: SnailChar;
  /** 기본 속도 배율 */
  speed: number;
  /** 폭발적 가속이 터질 성향 0..1 */
  burst: number;
  /** 멈춰서 쉬어버릴 성향 0..1 */
  stall: number;
  /** 안정감 0..1 (높을수록 편차가 작다) */
  grit: number;
};

/** 공개 시드로부터 출전표를 만든다. 베팅 시작 시점에 모두에게 공개된다. */
export function buildLineup(publicSeed: string): Racer[] {
  const rnd = rngFromSeed(`lineup:${publicSeed}`);
  const picked = shuffle(ROSTER, rnd).slice(0, FIELD);
  return picked.map((char, lane) => ({
    lane,
    char,
    speed: 0.88 + rnd() * 0.24,
    burst: 0.15 + rnd() * 0.85,
    stall: 0.15 + rnd() * 0.7,
    grit: 0.3 + rnd() * 0.7,
  }));
}

export type RaceOutcome = {
  /** 1등부터 순서대로 나열된 레인 번호 */
  order: number[];
  /** 레인별 완주 틱 (소수점 = 틱 내 보간) */
  finishTick: number[];
  /** frames[tick][lane] = 진행률 0..1 (record=true 일 때만) */
  frames: number[][];
  ticks: number;
};

/**
 * 경주를 그대로 재생할 수 있는 결정론적 시뮬레이션.
 * 같은 (racers, seed) 면 서버와 모든 클라이언트에서 결과가 완전히 동일하다.
 */
export function simulate(racers: Racer[], seed: string, record = false): RaceOutcome {
  const rnd = rngFromSeed(`race:${seed}`);
  const n = racers.length;
  const pos = new Array<number>(n).fill(0);
  const boost = new Array<number>(n).fill(0);
  const stall = new Array<number>(n).fill(0);
  const finishTick = new Array<number>(n).fill(-1);
  const frames: number[][] = [];

  let t = 0;
  for (; t < MAX_TICKS; t++) {
    for (let i = 0; i < n; i++) {
      if (finishTick[i] >= 0) continue;
      const r = racers[i];

      let mult = 1;
      if (boost[i] > 0) {
        mult = 1.8;
        boost[i]--;
      } else if (stall[i] > 0) {
        mult = 0.22;
        stall[i]--;
      } else {
        const roll = rnd();
        if (roll < r.burst * 0.018) boost[i] = 8 + Math.floor(rnd() * 12);
        else if (roll > 1 - r.stall * 0.016) stall[i] = 6 + Math.floor(rnd() * 10);
      }

      const noise = 1 + (rnd() * 2 - 1) * 0.4 * (1 - r.grit);
      const v = BASE_SPEED * r.speed * mult * Math.max(0.15, noise);
      const prev = pos[i];
      pos[i] = prev + v;
      if (pos[i] >= TRACK) {
        finishTick[i] = t + (TRACK - prev) / (pos[i] - prev);
        pos[i] = TRACK;
      }
    }

    if (record) {
      const frame = new Array<number>(n);
      for (let i = 0; i < n; i++) frame[i] = pos[i] / TRACK;
      frames.push(frame);
    }

    if (finishTick.every((f) => f >= 0)) {
      t++;
      break;
    }
  }

  // 제한 시간 내 못 들어온 달팽이는 남은 거리로 순위를 매긴다.
  for (let i = 0; i < n; i++) {
    if (finishTick[i] < 0) {
      finishTick[i] = MAX_TICKS + (TRACK - pos[i]) / (BASE_SPEED * racers[i].speed);
    }
  }

  const order = racers.map((_, i) => i).sort((a, b) => finishTick[a] - finishTick[b]);
  return { order, finishTick, frames, ticks: t };
}
