import { freshPoll } from "@/lib/advance";
import { issueAccess, issueAdminSession, requesterHash, verifyAdminPin } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { toDetail } from "@/lib/poll";
import { pinGuard } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";

/** 관리자 PIN으로 이 기기를 관리자 모드로 전환 (다른 기기·카톡 내 브라우저 등) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const poll = await freshPoll(id);
  if (!poll) return fail("투표를 찾을 수 없어요.", 404);
  if (!poll.adminPinHash) return fail("관리자 PIN이 설정되지 않은 투표예요. 만들 때 받은 관리 링크를 사용해 주세요.", 400);

  const guard = await pinGuard(req, `admin:${id}`);
  if (guard.blocked) return fail("시도 횟수를 초과했어요. 10분 후 다시 시도해 주세요.", 429);
  const body = (await readJson(req)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!(await verifyAdminPin(poll, pin))) {
    return json({ error: "관리자 PIN이 일치하지 않아요.", attemptsLeft: await guard.fail() }, 401);
  }
  await guard.success();
  return json({
    adminToken: await issueAdminSession(poll),
    token: await issueAccess(poll),
    poll: toDetail(poll, await store.getResponses(id), await requesterHash(req, id)),
  });
}
