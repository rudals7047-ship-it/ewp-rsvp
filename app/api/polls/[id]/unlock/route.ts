import { clientIp, issueAccess, verifyPin } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { toDetail } from "@/lib/poll";
import { getStore } from "@/lib/store";

const MAX_PER_IP = 5; // IP당 10분 5회
const MAX_PER_POLL = 30; // 투표당 1시간 30회 (분산 대입 방지)

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);

  const ipKey = `rl:pin:${id}:${clientIp(req)}`;
  const pollKey = `rl:pin:${id}`;
  if ((await store.count(ipKey)) >= MAX_PER_IP || (await store.count(pollKey)) >= MAX_PER_POLL) {
    return fail("시도 횟수를 초과했어요. 10분 후 다시 시도해 주세요.", 429);
  }

  const body = (await readJson(req)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!/^\d{4}$/.test(pin) || !(await verifyPin(poll, pin))) {
    const n = await store.hit(ipKey, 600);
    await store.hit(pollKey, 3600);
    const left = Math.max(0, MAX_PER_IP - n);
    return json({ error: "PIN이 일치하지 않아요.", attemptsLeft: left }, 401);
  }
  await store.reset(ipKey);
  return json({ token: await issueAccess(poll), poll: toDetail(poll, await store.getResponses(id)) });
}
