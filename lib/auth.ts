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
let secretCache: { at: number; value: Promise<string[]> } | null = null;

/** 요청마다 DB에서 비밀키를 읽지 않도록 5분간 메모리 캐시 (응답 속도 개선) */
async function secrets(): Promise<string[]> {
  if (secretCache && Date.now() - secretCache.at < 300_000) return secretCache.value;
  const value = loadSecrets();
  secretCache = { at: Date.now(), value };
  value.catch(() => (secretCache = null));
  return value;
}

async function loadSecrets(): Promise<string[]> {
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

/** 읽고 받아쓰기 쉬운 짧은 ID (헷갈리는 0/o/1/l/i 제외, 소문자+숫자) */
export function shortId(len = 7) {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
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

/** 명단 PIN (투표 PIN과 같은 방식, 별도 네임스페이스) */
export async function hashRosterPin(pin: string, salt: string) {
  return hmac(`roster:${salt}:${pin}`);
}

export async function verifyRosterPin(r: { pinSalt: string; pinHash: string }, pin: string) {
  return /^\d{4}$/.test(pin) && hmacMatches(`roster:${r.pinSalt}:${pin}`, r.pinHash);
}

export async function hashAdmin(token: string) {
  return hmac(`admin:${token}`);
}

/** 관리자 PIN 해시 */
export async function hashAdminPin(pin: string, salt: string) {
  return hmac(`adminpin:${salt}:${pin}`);
}

export async function verifyAdminPin(poll: Poll, pin: string) {
  return !!poll.adminPinHash && !!poll.adminPinSalt && /^\d{4}$/.test(pin) && hmacMatches(`adminpin:${poll.adminPinSalt}:${pin}`, poll.adminPinHash);
}

const ADMIN_SESSION_MS = 1000 * 60 * 60 * 24 * 30;

/** 관리자 PIN으로 로그인한 기기에 발급하는 관리자 세션 토큰 ("s.<만료>.<서명>") */
export async function issueAdminSession(poll: Poll) {
  const exp = Date.now() + ADMIN_SESSION_MS;
  return `s.${exp}.${await hmac(`adminsess:${poll.id}:${poll.adminPinHash}:${exp}`)}`;
}

export async function verifyAdmin(poll: Poll, token: string | null | undefined) {
  if (!token) return false;
  if (token.startsWith("s.")) {
    const [, expStr, sig] = token.split(".");
    const exp = Number(expStr);
    if (!poll.adminPinHash || !exp || !sig || exp < Date.now()) return false;
    return hmacMatches(`adminsess:${poll.id}:${poll.adminPinHash}:${exp}`, sig);
  }
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

/* ---------- 사이트 관리자(마스터) ---------- */
// MASTER_KEY 환경변수(8자 이상)를 설정해야만 켜짐. 저장소에는 절대 넣지 않음
const MASTER_MS = 1000 * 60 * 60 * 2;
const masterKey = () => process.env.MASTER_KEY ?? "";

export function masterEnabled() {
  return masterKey().length >= 8;
}

export async function checkMasterKey(key: string) {
  if (!masterEnabled() || !key) return false;
  const k = masterKey();
  return safeEqual(createHmac("sha256", k).update(key).digest("base64url"), createHmac("sha256", k).update(k).digest("base64url"));
}

/** 마스터 세션 토큰 ("m.<만료>.<서명>"). 키를 바꾸면 기존 세션은 모두 무효 */
export async function issueMaster() {
  const exp = Date.now() + MASTER_MS;
  return `m.${exp}.${await hmac(`master:${exp}:${createHmac("sha256", masterKey()).update("id").digest("hex").slice(0, 16)}`)}`;
}

export async function verifyMaster(req: Request) {
  const t = req.headers.get("x-master-token");
  if (!masterEnabled() || !t?.startsWith("m.")) return false;
  const [, expStr, sig] = t.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now()) return false;
  return hmacMatches(`master:${exp}:${createHmac("sha256", masterKey()).update("id").digest("hex").slice(0, 16)}`, sig);
}

/** 투표 관리자 또는 사이트 관리자 */
export async function isPollAdmin(req: Request, poll: Poll) {
  return (await verifyAdmin(poll, req.headers.get("x-admin-token"))) || (await verifyMaster(req));
}
