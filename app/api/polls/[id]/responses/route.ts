import { freshPoll } from "@/lib/advance";
import { requesterHash, hashOwner, verifyAccess, verifyAdmin, verifyOwner } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { LIMITS, nameKey, parseAnswers, pollStatus, toDetail } from "@/lib/poll";
import { overLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await freshPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  const isAdmin = await verifyAdmin(poll, req.headers.get("x-admin-token"));
  if (!isAdmin && !(await verifyAccess(poll, req.headers.get("x-poll-token")))) return fail("PIN 인증이 필요해요.", 401);
  if (pollStatus(poll) === "closed" && !isAdmin) return fail("이미 마감된 투표예요.", 409);
  if (await overLimit(req, "resp", 60, 600)) return fail("잠시 후 다시 시도해 주세요.", 429);

  const body = (await readJson(req)) as { name?: unknown; answers?: unknown; proxy?: unknown } | null;
  // 관리자(투표 생성자)는 다른 사람의 응답을 대신 입력·수정할 수 있음
  const proxy = isAdmin && body?.proxy === true;
  const owner = req.headers.get("x-owner-token") ?? "";
  if (!proxy && !/^[\w-]{16,64}$/.test(owner)) return fail("브라우저를 새로고침한 뒤 다시 시도해 주세요.");

  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, LIMITS.name) : "";
  if (!name) return fail("이름을 입력해 주세요.");
  const parsed = parseAnswers(poll, body?.answers);
  if (!parsed.ok) return fail(parsed.error);

  const key = nameKey(name);
  const all = await store.getResponses(id);
  const prev = all.find((r) => nameKey(r.name) === key);
  if (!prev && all.length >= LIMITS.responses) return fail("응답 인원이 너무 많아요.", 409);
  // 다른 기기에서 먼저 응답한 이름은 덮어쓸 수 없음 (대리 수정·장난 방지). 관리자 대리 입력은 예외
  if (!proxy && prev?.ownerHash && !(await verifyOwner(id, owner, prev.ownerHash))) {
    return fail("다른 기기에서 이미 응답한 이름이에요. 본인이라면 처음 응답한 기기에서 수정하거나 관리자에게 요청하세요.", 409);
  }

  // 한 기기 = 한 사람: 이 기기로 이미 다른 이름의 응답을 냈다면 거절 (남의 이름으로 추가 응답 방지)
  if (!proxy) {
    const me = await hashOwner(id, owner);
    const mine = all.find((r) => r.ownerHash === me && nameKey(r.name) !== key);
    if (mine) {
      return fail(`이 기기에서는 이미 '${mine.name}'님으로 응답했어요. 한 기기에서는 한 사람만 응답할 수 있어요. 이름을 잘못 골랐다면 관리자에게 삭제를 요청하세요.`, 409);
    }
  }

  // 확정된 질문(예: 1차 식당 투표)의 기존 응답은 그대로 보존
  const answers = { ...parsed.answers };
  for (const qid of Object.keys(poll.decisions ?? {})) {
    if (prev?.answers[qid] !== undefined) answers[qid] = prev.answers[qid];
  }
  await store.saveResponse(id, key, {
    name: proxy && prev ? prev.name : name,
    answers,
    updatedAt: Date.now(),
    // 대리 입력은 소유권을 새로 부여하지 않음 → 본인이 나중에 자기 기기에서 수정하면 그 기기가 소유
    ownerHash: proxy ? prev?.ownerHash : (prev?.ownerHash ?? (await hashOwner(id, owner))),
    proxy: proxy || undefined,
  });
  return json({ poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)) });
}

/** 관리자: 특정 응답 삭제(초기화) */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await freshPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  if (!(await verifyAdmin(poll, req.headers.get("x-admin-token")))) return fail("권한이 없어요.", 403);
  const url = new URL(req.url);
  const name = url.searchParams.get("name") ?? "";
  if (!name.trim()) return fail("이름이 필요해요.");
  if (url.searchParams.get("release") === "1") {
    // 응답은 그대로 두고 기기 명의만 해제 (관리자가 대신 입력한 것으로 표시)
    const r = (await store.getResponses(id)).find((x) => nameKey(x.name) === nameKey(name));
    if (!r) return fail("응답을 찾을 수 없어요.", 404);
    await store.saveResponse(id, nameKey(name), { ...r, ownerHash: undefined, proxy: true });
  } else {
    await store.deleteResponse(id, nameKey(name));
  }
  return json({ poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)) });
}
