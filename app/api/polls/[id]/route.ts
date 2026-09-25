import { verifyAccess, verifyAdmin } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { toDetail } from "@/lib/poll";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

/** PIN 인증 토큰(x-poll-token)이 있어야 상세/결과 조회 가능 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  const ok =
    (await verifyAccess(poll, req.headers.get("x-poll-token"))) ||
    (await verifyAdmin(poll, req.headers.get("x-admin-token")));
  if (!ok) return fail("PIN 인증이 필요해요.", 401);
  return json({ poll: toDetail(poll, await store.getResponses(id)) });
}

/** 관리자: 마감/재개 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  if (!(await verifyAdmin(poll, req.headers.get("x-admin-token")))) return fail("권한이 없어요.", 403);
  const body = (await readJson(req)) as { action?: string } | null;
  if (body?.action === "close") {
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
  return json({ poll: toDetail(poll, await store.getResponses(id)) });
}

/** 관리자: 삭제 */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll) return json({ ok: true });
  if (!(await verifyAdmin(poll, req.headers.get("x-admin-token")))) return fail("권한이 없어요.", 403);
  await store.deletePoll(id);
  return json({ ok: true });
}
