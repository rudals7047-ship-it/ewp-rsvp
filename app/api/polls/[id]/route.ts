import { freshPoll } from "@/lib/advance";
import { requesterHash, verifyAccess, verifyAdmin } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { LIMITS, addRound, parseQuestion, startMenuRound, toDetail } from "@/lib/poll";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

/** PIN 인증 토큰(x-poll-token)이 있어야 상세/결과 조회 가능 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await freshPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  const ok =
    (await verifyAccess(poll, req.headers.get("x-poll-token"))) ||
    (await verifyAdmin(poll, req.headers.get("x-admin-token")));
  if (!ok) return fail("PIN 인증이 필요해요.", 401);
  return json({ poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)) });
}

/** 관리자: 마감/재개 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await freshPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  if (!(await verifyAdmin(poll, req.headers.get("x-admin-token")))) return fail("권한이 없어요.", 403);
  const body = (await readJson(req)) as { action?: string; questionId?: string; option?: string; question?: unknown } | null;
  if (body?.action === "decide") {
    // 결과 확정 (예: 식당 확정). option이 비어 있으면 확정 취소
    const q = poll.questions.find((x) => x.id === body.questionId);
    if (!q || (q.kind !== "single" && q.kind !== "multi")) return fail("확정할 수 없는 질문이에요.");
    // 메뉴는 각자 고르는 개인 주문이라 1개로 확정하지 않음
    if (q.topic === "menu") return fail("메뉴는 각자 주문이라 확정할 필요가 없어요.");
    const decisions = { ...(poll.decisions ?? {}) };
    if (body.option) {
      if (!q.options.includes(body.option)) return fail("선택지를 찾을 수 없어요.");
      decisions[q.id] = body.option;
    } else delete decisions[q.id];
    poll.decisions = decisions;
  } else if (body?.action === "addQuestion") {
    // 다음 차수 질문 추가 (예: 식당 확정 후 메뉴 투표)
    if (poll.questions.length >= LIMITS.questions) return fail("질문은 최대 8개까지예요.");
    const r = parseQuestion(body.question, false);
    if (!r.ok) return fail(r.error);
    if (!r.data || (r.data.kind !== "single" && r.data.kind !== "multi")) return fail("선택지를 1개 이상 입력해 주세요.");
    addRound(poll, r.data);
  } else if (body?.action === "startMenu") {
    // 식당 확정 + 그 식당 메뉴로 메뉴 투표 시작 (한 번에)
    const err = startMenuRound(poll, typeof body.option === "string" ? body.option : "");
    if (err) return fail(err);
  } else if (body?.action === "close") {
    poll.closed = true;
  } else if (body?.action === "reopen") {
    poll.closed = false;
    // 마감 시각이 이미 지났다면 24시간 연장해서 다시 열기
    const end = poll.deadline ?? poll.eventAt;
    if (end && Date.parse(end) <= Date.now()) poll.deadline = new Date(Date.now() + 86_400_000).toISOString();
  } else {
    return fail("알 수 없는 요청이에요.");
  }
  await store.savePoll(poll);
  return json({ poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)) });
}

/** 관리자: 삭제 */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await freshPoll(id);
  if (!poll) return json({ ok: true });
  if (!(await verifyAdmin(poll, req.headers.get("x-admin-token")))) return fail("권한이 없어요.", 403);
  await store.deletePoll(id);
  return json({ ok: true });
}
