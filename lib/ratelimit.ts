import "server-only";
import { createHash } from "node:crypto";
import { clientIp } from "./auth";
import { getStore } from "./store";

/** 개인정보 최소화: 레이트리밋 키에 IP 원문 대신 해시를 사용 (키는 최대 1시간 후 자동 삭제) */
export function ipTag(req: Request) {
  return createHash("sha256").update(`ip:${clientIp(req)}`).digest("base64url").slice(0, 16);
}

/**
 * PIN 대입 방어 (전원 차단 없이):
 * - 평소: IP당 10분에 5회
 * - 대상 전체 오답이 1시간 50회를 넘으면(분산 공격 의심) IP당 10분에 2회로 강화
 */
const PER_IP = 5;
const PER_IP_UNDER_ATTACK = 2;
const ATTACK_THRESHOLD = 50;

export async function pinGuard(req: Request, scope: string) {
  const store = getStore();
  const ipKey = `rl:pin:${scope}:${ipTag(req)}`;
  const allKey = `rl:pin:${scope}`;
  const [ipCount, allCount] = await store.counts([ipKey, allKey]); // DB 왕복 1회
  const limit = allCount >= ATTACK_THRESHOLD ? PER_IP_UNDER_ATTACK : PER_IP;
  return {
    blocked: ipCount >= limit,
    async fail() {
      const n = await store.hit(ipKey, 600);
      await store.hit(allKey, 3600);
      return Math.max(0, limit - n);
    },
    success: () => store.reset(ipKey),
  };
}

export async function overLimit(req: Request, name: string, max: number, windowSec: number) {
  return (await getStore().hit(`rl:${name}:${ipTag(req)}`, windowSec)) > max;
}
