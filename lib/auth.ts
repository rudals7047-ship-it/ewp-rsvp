import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "./store";
import type { Poll } from "./types";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // PIN 인증 유지: 12시간

/**
 * 서명 키: AUTH_SECRET(환경변수)이 우선, 없으면 Redis에 자동 생성된 키.
 * AUTH_SECRET을 나중에 추가해도 기존 투표의 PIN/관리 링크가 깨지지 않도록
 * 검증 시에는 저장된 키도 함께 시도한다.
 */
async function secrets(): Promise<string[]> {
  const store = getStore();
  const env = process.env.AUTH_SECRET;
  if (!env) return [await store.getOrCreateSecret()];
  const stored = await store.getSecret().catch(() => null);
  return stored && stored !== env ? [env, stored] : [env];
}

async function hmac(data: string) {
  return createHmac("sha256", (await secrets())[0]).update(data).digest("base64url");
}

async function hmacMatches(data: string, expected: string) {
  for (const key of await secrets()) {
    if (safeEqual(createHmac("sha256", key).update(data).digest("base64url"), expected)) return true;
  }
  return false;
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomId(bytes = 6) {
  return randomBytes(bytes).toString("base64url");
}

export async function hashPin(pin: string, salt: string) {
  return hmac(`pin:${salt}:${pin}`);
}

export async function verifyPin(poll: Poll, pin: string) {
  return hmacMatches(`pin:${poll.pinSalt}:${pin}`, poll.pinHash);
}

export async function hashAdmin(token: string) {
  return hmac(`admin:${token}`);
}

export async function verifyAdmin(poll: Poll, token: string | null | undefined) {
  if (!token) return false;
  return hmacMatches(`admin:${token}`, poll.adminHash);
}

/** 응답 소유 토큰(기기별) 해시: 다른 사람이 같은 이름으로 응답을 덮어쓰는 것을 방지 */
export async function hashOwner(pollId: string, token: string) {
  return hmac(`owner:${pollId}:${token}`);
}

/** 요청 헤더의 소유 토큰 → 해시 (없으면 null) */
export async function requesterHash(req: Request, pollId: string) {
  const t = req.headers.get("x-owner-token");
  return t && /^[\w-]{16,64}$/.test(t) ? hashOwner(pollId, t) : null;
}

export async function verifyOwner(pollId: string, token: string, hash: string) {
  return hmacMatches(`owner:${pollId}:${token}`, hash);
}

/** PIN 인증 후 발급하는 접근 토큰. PIN이 바뀌면 자동 무효화 */
export async function issueAccess(poll: Poll) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = await hmac(`access:${poll.id}:${poll.pinHash}:${exp}`);
  return `${exp}.${sig}`;
}

export async function verifyAccess(poll: Poll, token: string | null | undefined) {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  return hmacMatches(`access:${poll.id}:${poll.pinHash}:${exp}`, sig);
}

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}
