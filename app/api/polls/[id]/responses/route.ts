import { requesterHash, clientIp, hashOwner, verifyAccess, verifyAdmin, verifyOwner } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { LIMITS, nameKey, parseAnswers, pollStatus, toDetail } from "@/lib/poll";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  if (!(await verifyAccess(poll, req.headers.get("x-poll-token")))) return fail("PIN 인증이 필요해요.", 401);
  if (pollStatus(poll) === "closed") return fail("이미 마감된 투표예요.", 409);
  if ((await store.hit(`rl:resp:${clientIp(req)}`, 600)) > 60) return fail("잠시 후 다시 시도해 주세요.", 429);

  const owner = req.headers.get("x-owner-token") ?? "";
  if (!/^[\w-]{16,64}$/.test(owner)) return fail("브라우저를 새로고침한 뒤 다시 시도해 주세요.");

  const body = (await readJson(req)) as { name?: unknown; answers?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, LIMITS.name) : "";
  if (!name) return fail("이름을 입력해 주세요.");
  const parsed = parseAnswers(poll, body?.answers);
  if (!parsed.ok) return fail(parsed.error);

  const key = nameKey(name);
  const all = await store.getResponses(id);
  const prev = all.find((r) => nameKey(r.name) === key);
  if (!prev && all.length >= LIMITS.responses) return fail("응답 인원이 너무 많아요.", 409);
  // 다른 기기에서 먼저 응답한 이름은 덮어쓸 수 없음 (대리 수정·장난 방지)
  if (prev?.ownerHash && !(await verifyOwner(id, owner, prev.ownerHash))) {
    return fail("다른 기기에서 이미 응답한 이름이에요. 본인이라면 처음 응답한 기기에서 수정하거나 관리자에게 초기화를 요청하세요.", 409);
  }

  // 확정된 질문(예: 1차 식당 투표)의 기존 응답은 그대로 보존
  const answers = { ...parsed.answers };
  for (const qid of Object.keys(poll.decisions ?? {})) {
    if (prev?.answers[qid] !== undefined) answers[qid] = prev.answers[qid];
  }
  await store.saveResponse(id, key, {
    name,
    answers,
    updatedAt: Date.now(),
    ownerHash: prev?.ownerHash ?? (await hashOwner(id, owner)),
  });
  return json({ poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)) });
}

/** 관리자: 특정 응답 삭제(초기화) */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  if (!(await verifyAdmin(poll, req.headers.get("x-admin-token")))) return fail("권한이 없어요.", 403);
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!name.trim()) return fail("이름이 필요해요.");
  await store.deleteResponse(id, nameKey(name));
  return json({ poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)) });
}
