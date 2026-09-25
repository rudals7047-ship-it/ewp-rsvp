import { clientIp, hashAdmin, hashPin, randomId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { parseCreate, toSummary } from "@/lib/poll";
import { getStore } from "@/lib/store";
import type { Poll } from "@/lib/types";

export async function GET() {
  const store = getStore();
  const rows = await store.listPolls(200);
  return json({
    storage: store.kind,
    polls: rows.map(({ poll, responseCount }) => toSummary(poll, responseCount)),
  });
}

export async function POST(req: Request) {
  const store = getStore();
  const ip = clientIp(req);
  if ((await store.hit(`rl:create:${ip}`, 3600)) > 30) {
    return fail("잠시 후 다시 시도해 주세요.", 429);
  }
  const parsed = parseCreate(await readJson(req));
  if (!parsed.ok) return fail(parsed.error);
  const { pin, ...data } = parsed.data;

  const id = randomId(6);
  const adminToken = randomId(18);
  const pinSalt = randomId(9);
  const poll: Poll = {
    ...data,
    id,
    createdAt: Date.now(),
    closed: false,
    round: 1,
    pinSalt,
    pinHash: await hashPin(pin, pinSalt),
    adminHash: await hashAdmin(adminToken),
  };
  await store.savePoll(poll);
  return json({ id, adminToken }, 201);
}
