import "server-only";
import { Redis } from "@upstash/redis";
import type { Place } from "./places";
import type { RosterList } from "./types";
import type { Poll, PollResponse } from "./types";

/**
 * 저장소 추상화.
 * - Upstash Redis 환경변수가 있으면 Redis 사용 (Vercel 배포용)
 * - 없으면 메모리 저장소 (로컬 개발/데모용, 재시작 시 초기화)
 */
export interface Store {
  kind: "redis" | "memory";
  getPoll(id: string): Promise<Poll | null>;
  savePoll(poll: Poll): Promise<void>;
  deletePoll(id: string): Promise<void>;
  listPolls(limit: number): Promise<{ poll: Poll; responseCount: number }[]>;
  getResponses(id: string): Promise<PollResponse[]>;
  saveResponse(id: string, key: string, r: PollResponse): Promise<void>;
  deleteResponse(id: string, key: string): Promise<void>;
  /** 카운터 증가 후 현재 값 반환 (윈도우 TTL 초) */
  hit(key: string, ttlSec: number): Promise<number>;
  count(key: string): Promise<number>;
  reset(key: string): Promise<void>;
  getOrCreateSecret(): Promise<string>;
  /** 저장된 비밀키 조회 (생성하지 않음) */
  getSecret(): Promise<string | null>;
  /** 식당 공용 목록: 사용자 추가·수정분 (시드 위에 덮어씀) */
  listPlaceEdits(): Promise<Place[]>;
  savePlace(p: Place): Promise<void>;
  placeUses(): Promise<Record<string, number>>;
  addPlaceUses(ids: string[]): Promise<void>;
  /** 참석자 명단 보관함 (실명은 PIN 인증 후에만 반환) */
  listRosters(): Promise<RosterList[]>;
  getRoster(id: string): Promise<RosterList | null>;
  saveRoster(r: RosterList): Promise<void>;
  deleteRoster(id: string): Promise<void>;
}

/** 개인정보 보관 기간: 모임일(없으면 마감·생성일) 이후 90일 뒤 투표·응답 자동 삭제 */
export const RETENTION_DAYS = 90;
export function expiresAtSec(p: Pick<Poll, "eventAt" | "deadline" | "createdAt">) {
  const base = Math.max(p.createdAt, Date.parse(p.eventAt ?? "") || 0, Date.parse(p.deadline ?? "") || 0);
  return Math.floor(base / 1000) + RETENTION_DAYS * 86400;
}

const POLL = (id: string) => `poll:${id}`;
const RESP = (id: string) => `resp:${id}`;
const INDEX = "polls";
const SECRET = "app:secret";
const PLACES = "places";
const PLACE_USES = "place-uses";
const ROSTERS = "rosters";

function parse<T>(v: unknown): T {
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

function randomSecret() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Buffer.from(b).toString("base64url");
}

function redisStore(redis: Redis): Store {
  return {
    kind: "redis",
    async getPoll(id) {
      const v = await redis.get(POLL(id));
      return v ? parse<Poll>(v) : null;
    },
    async savePoll(poll) {
      const exat = expiresAtSec(poll);
      const p = redis.pipeline();
      p.set(POLL(poll.id), JSON.stringify(poll), { exat });
      p.expireat(RESP(poll.id), exat);
      p.zadd(INDEX, { score: poll.createdAt, member: poll.id });
      await p.exec();
    },
    async deletePoll(id) {
      const p = redis.pipeline();
      p.del(POLL(id));
      p.del(RESP(id));
      p.zrem(INDEX, id);
      await p.exec();
    },
    async listPolls(limit) {
      const ids = await redis.zrange<string[]>(INDEX, 0, limit - 1, { rev: true });
      if (!ids.length) return [];
      const p = redis.pipeline();
      for (const id of ids) {
        p.get(POLL(id));
        p.hlen(RESP(id));
      }
      const res = await p.exec<unknown[]>();
      const out: { poll: Poll; responseCount: number }[] = [];
      const expired: string[] = [];
      for (let i = 0; i < ids.length; i++) {
        const raw = res[i * 2];
        if (!raw) {
          expired.push(ids[i]); // 보관 기간이 지나 삭제된 투표는 목록에서도 정리
          continue;
        }
        out.push({ poll: parse<Poll>(raw), responseCount: Number(res[i * 2 + 1]) || 0 });
      }
      if (expired.length) await redis.zrem(INDEX, ...expired).catch(() => {});
      return out;
    },
    async getResponses(id) {
      const all = await redis.hgetall<Record<string, unknown>>(RESP(id));
      if (!all) return [];
      return Object.values(all).map((v) => parse<PollResponse>(v));
    },
    async saveResponse(id, key, r) {
      const p = redis.pipeline();
      p.hset(RESP(id), { [key]: JSON.stringify(r) });
      p.ttl(POLL(id));
      const [, ttl] = await p.exec<[number, number]>();
      if (ttl > 0) await redis.expire(RESP(id), ttl); // 응답도 투표와 같은 시점에 삭제
    },
    async deleteResponse(id, key) {
      await redis.hdel(RESP(id), key);
    },
    async hit(key, ttlSec) {
      // incr과 TTL 설정을 한 번에: TTL 누락으로 영구 차단되는 일을 방지
      const p = redis.pipeline();
      p.incr(key);
      p.expire(key, ttlSec, "NX");
      const [n] = await p.exec<[number, number]>();
      return n;
    },
    async count(key) {
      return Number(await redis.get(key)) || 0;
    },
    async reset(key) {
      await redis.del(key);
    },
    async getSecret() {
      const v = await redis.get<string>(SECRET);
      return v ? String(v) : null;
    },
    async listPlaceEdits() {
      const all = await redis.hgetall<Record<string, unknown>>(PLACES);
      return all ? Object.values(all).map((v) => parse<Place>(v)) : [];
    },
    async savePlace(pl) {
      await redis.hset(PLACES, { [pl.id]: JSON.stringify(pl) });
    },
    async placeUses() {
      const all = await redis.hgetall<Record<string, unknown>>(PLACE_USES);
      return Object.fromEntries(Object.entries(all ?? {}).map(([k, v]) => [k, Number(v) || 0]));
    },
    async listRosters() {
      const all = await redis.hgetall<Record<string, unknown>>(ROSTERS);
      return all ? Object.values(all).map((v) => parse<RosterList>(v)) : [];
    },
    async getRoster(id) {
      const v = await redis.hget(ROSTERS, id);
      return v ? parse<RosterList>(v) : null;
    },
    async saveRoster(r) {
      await redis.hset(ROSTERS, { [r.id]: JSON.stringify(r) });
    },
    async deleteRoster(id) {
      await redis.hdel(ROSTERS, id);
    },
    async addPlaceUses(ids) {
      if (!ids.length) return;
      const p = redis.pipeline();
      for (const id of ids) p.hincrby(PLACE_USES, id, 1);
      await p.exec();
    },
    async getOrCreateSecret() {
      const existing = await redis.get<string>(SECRET);
      if (existing) return String(existing);
      await redis.set(SECRET, randomSecret(), { nx: true });
      return String(await redis.get<string>(SECRET));
    },
  };
}

interface Mem {
  rosters: Map<string, RosterList>;
  places: Map<string, Place>;
  placeUses: Map<string, number>;
  polls: Map<string, Poll>;
  resp: Map<string, Map<string, PollResponse>>;
  counters: Map<string, { n: number; exp: number }>;
  secret: string;
}

function memoryStore(): Store {
  const g = globalThis as unknown as { __mem?: Mem };
  const m = (g.__mem ??= {
    rosters: new Map(),
    places: new Map(),
    placeUses: new Map(),
    polls: new Map(),
    resp: new Map(),
    counters: new Map(),
    secret: randomSecret(),
  });
  const live = (key: string) => {
    const c = m.counters.get(key);
    if (c && c.exp < Date.now()) {
      m.counters.delete(key);
      return undefined;
    }
    return c;
  };
  return {
    kind: "memory",
    async getPoll(id) {
      const p = m.polls.get(id);
      if (p && expiresAtSec(p) * 1000 < Date.now()) {
        m.polls.delete(id);
        m.resp.delete(id);
        return null;
      }
      return structuredClone(p ?? null);
    },
    async savePoll(poll) {
      m.polls.set(poll.id, structuredClone(poll));
    },
    async deletePoll(id) {
      m.polls.delete(id);
      m.resp.delete(id);
    },
    async listPolls(limit) {
      return [...m.polls.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((poll) => ({ poll: structuredClone(poll), responseCount: m.resp.get(poll.id)?.size ?? 0 }));
    },
    async getResponses(id) {
      return structuredClone([...(m.resp.get(id)?.values() ?? [])]);
    },
    async saveResponse(id, key, r) {
      if (!m.resp.has(id)) m.resp.set(id, new Map());
      m.resp.get(id)!.set(key, structuredClone(r));
    },
    async deleteResponse(id, key) {
      m.resp.get(id)?.delete(key);
    },
    async hit(key, ttlSec) {
      const c = live(key) ?? { n: 0, exp: Date.now() + ttlSec * 1000 };
      c.n++;
      m.counters.set(key, c);
      return c.n;
    },
    async count(key) {
      return live(key)?.n ?? 0;
    },
    async reset(key) {
      m.counters.delete(key);
    },
    async getOrCreateSecret() {
      return m.secret;
    },
    async getSecret() {
      return m.secret;
    },
    async listPlaceEdits() {
      return structuredClone([...m.places.values()]);
    },
    async savePlace(pl) {
      m.places.set(pl.id, structuredClone(pl));
    },
    async placeUses() {
      return Object.fromEntries(m.placeUses);
    },
    async listRosters() {
      return structuredClone([...m.rosters.values()]);
    },
    async getRoster(id) {
      return structuredClone(m.rosters.get(id) ?? null);
    },
    async saveRoster(r) {
      m.rosters.set(r.id, structuredClone(r));
    },
    async deleteRoster(id) {
      m.rosters.delete(id);
    },
    async addPlaceUses(ids) {
      for (const id of ids) m.placeUses.set(id, (m.placeUses.get(id) ?? 0) + 1);
    },
  };
}

/**
 * Upstash 연결 정보 찾기. Vercel 연동 시 접두어(예: STORAGE_)가 붙을 수 있어
 * 표준 이름을 먼저 찾고, 없으면 *_KV_REST_API_URL / *_REDIS_REST_URL 형태를 찾는다.
 * (읽기 전용 토큰 KV_REST_API_READ_ONLY_TOKEN 은 쓰기가 안 되므로 제외)
 */
function redisEnv() {
  const env = process.env;
  const pick = (suffixes: string[]) => {
    for (const s of suffixes) if (env[s]) return env[s];
    const key = Object.keys(env).find((k) => suffixes.some((s) => k.endsWith(`_${s}`)) && !k.includes("READ_ONLY") && env[k]);
    return key ? env[key] : undefined;
  };
  return {
    url: pick(["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "REDIS_REST_URL"]),
    token: pick(["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN", "REDIS_REST_TOKEN"]),
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const { url, token } = redisEnv();
  cached = url && token ? redisStore(new Redis({ url, token })) : memoryStore();
  return cached;
}
