import "server-only";
import { Redis } from "@upstash/redis";
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
}

const POLL = (id: string) => `poll:${id}`;
const RESP = (id: string) => `resp:${id}`;
const INDEX = "polls";
const SECRET = "app:secret";

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
      const p = redis.pipeline();
      p.set(POLL(poll.id), JSON.stringify(poll));
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
      for (let i = 0; i < ids.length; i++) {
        const raw = res[i * 2];
        if (!raw) continue;
        out.push({ poll: parse<Poll>(raw), responseCount: Number(res[i * 2 + 1]) || 0 });
      }
      return out;
    },
    async getResponses(id) {
      const all = await redis.hgetall<Record<string, unknown>>(RESP(id));
      if (!all) return [];
      return Object.values(all).map((v) => parse<PollResponse>(v));
    },
    async saveResponse(id, key, r) {
      await redis.hset(RESP(id), { [key]: JSON.stringify(r) });
    },
    async deleteResponse(id, key) {
      await redis.hdel(RESP(id), key);
    },
    async hit(key, ttlSec) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, ttlSec);
      return n;
    },
    async count(key) {
      return Number(await redis.get(key)) || 0;
    },
    async reset(key) {
      await redis.del(key);
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
  polls: Map<string, Poll>;
  resp: Map<string, Map<string, PollResponse>>;
  counters: Map<string, { n: number; exp: number }>;
  secret: string;
}

function memoryStore(): Store {
  const g = globalThis as unknown as { __mem?: Mem };
  const m = (g.__mem ??= {
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
      return structuredClone(m.polls.get(id) ?? null);
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
  };
}

let cached: Store | null = null;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? redisStore(new Redis({ url, token })) : memoryStore();
  return cached;
}
