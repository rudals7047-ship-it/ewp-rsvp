import { clientIp, verifyAccess } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { LIMITS, nameKey, parseAnswers, pollStatus, toDetail } from "@/lib/poll";
import { getStore } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  if (!(await verifyAccess(poll, req.headers.get("x-poll-token")))) return fail("PIN 인증이 필요해요.", 401);
  if (pollStatus(poll) === "closed") return fail("이미 마감된 투표예요.", 409);
  if ((await store.hit(`rl:resp:${clientIp(req)}`, 600)) > 60) return fail("잠시 후 다시 시도해 주세요.", 429);

  const body = (await readJson(req)) as { name?: unknown; answers?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, LIMITS.name) : "";
  if (!name) return fail("이름을 입력해 주세요.");
  const parsed = parseAnswers(poll, body?.answers);
  if (!parsed.ok) return fail(parsed.error);

  // 확정된 질문(예: 1차 식당 투표)의 기존 응답은 그대로 보존
  const key = nameKey(name);
  const prev = (await store.getResponses(id)).find((r) => nameKey(r.name) === key);
  const answers = { ...parsed.answers };
  for (const qid of Object.keys(poll.decisions ?? {})) {
    if (prev?.answers[qid] !== undefined) answers[qid] = prev.answers[qid];
  }
  await store.saveResponse(id, key, { name, answers, updatedAt: Date.now() });
  return json({ poll: toDetail(poll, await store.getResponses(id)) });
}

