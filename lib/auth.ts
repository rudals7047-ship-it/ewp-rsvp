import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "./store";
import type { Poll } from "./types";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // PIN 인증 유지: 12시간

async function secret() {
  return process.env.AUTH_SECRET || (await getStore().getOrCreateSecret());
}

async function hmac(data: string) {
  return createHmac("sha256", await secret()).update(data).digest("base64url");
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
  return safeEqual(await hashPin(pin, poll.pinSalt), poll.pinHash);
}

export async function hashAdmin(token: string) {
  return hmac(`admin:${token}`);
}

export async function verifyAdmin(poll: Poll, token: string | null | undefined) {
  if (!token) return false;
  return safeEqual(await hashAdmin(token), poll.adminHash);
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
  return safeEqual(await hmac(`access:${poll.id}:${poll.pinHash}:${exp}`), sig);
}

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}
