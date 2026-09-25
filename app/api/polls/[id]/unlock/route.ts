import { requesterHash, clientIp, issueAccess, verifyPin } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { toDetail } from "@/lib/poll";
import { getStore } from "@/lib/store";

/**
 * PIN 대입 방어 (전원 차단 없이):
 * - 평소: IP당 10분에 5회
 * - 투표 전체 오답이 1시간 50회를 넘으면(분산 공격 의심) IP당 10분에 2회로 강화
 * 투표 전체를 잠그지 않으므로 공격자가 정상 사용자를 막을 수 없고,
 * 4자리(1만 개) 대입에는 수천 개의 IP·시간이 필요해진다.
 */
const PER_IP = 5;
const PER_IP_UNDER_ATTACK = 2;
const ATTACK_THRESHOLD = 50;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);

  const ipKey = `rl:pin:${id}:${clientIp(req)}`;
  const pollKey = `rl:pin:${id}`;
  const underAttack = (await store.count(pollKey)) >= ATTACK_THRESHOLD;
  const limit = underAttack ? PER_IP_UNDER_ATTACK : PER_IP;
  if ((await store.count(ipKey)) >= limit) {
    return fail("시도 횟수를 초과했어요. 10분 후 다시 시도해 주세요.", 429);
  }

  const body = (await readJson(req)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!/^\d{4}$/.test(pin) || !(await verifyPin(poll, pin))) {
    const n = await store.hit(ipKey, 600);
    await store.hit(pollKey, 3600);
    return json({ error: "PIN이 일치하지 않아요.", attemptsLeft: Math.max(0, limit - n) }, 401);
  }
  await store.reset(ipKey);
  return json({ token: await issueAccess(poll), poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)) });
}
