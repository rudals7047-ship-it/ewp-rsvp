import { issueAccess, requesterHash, verifyPin } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { toDetail } from "@/lib/poll";
import { pinGuard } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);

  const guard = await pinGuard(req, `poll:${id}`);
  if (guard.blocked) return fail("시도 횟수를 초과했어요. 10분 후 다시 시도해 주세요.", 429);

  const body = (await readJson(req)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!/^\d{4}$/.test(pin) || !(await verifyPin(poll, pin))) {
    return json({ error: "PIN이 일치하지 않아요.", attemptsLeft: await guard.fail() }, 401);
  }
  await guard.success();
  return json({ token: await issueAccess(poll), poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)) });
}
