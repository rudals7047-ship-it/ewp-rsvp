import { checkMasterKey, issueMaster, masterEnabled, verifyMaster } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { pinGuard } from "@/lib/ratelimit";

/** 사이트 관리자 기능이 켜져 있는지 / 현재 세션이 유효한지 */
export async function GET(req: Request) {
  return json({ enabled: masterEnabled(), active: await verifyMaster(req) });
}

/** 사이트 관리자 로그인 (MASTER_KEY 환경변수와 비교). 시도 횟수 제한 */
export async function POST(req: Request) {
  if (!masterEnabled()) return fail("사이트 관리자 기능이 설정되지 않았어요.", 404);
  const guard = await pinGuard(req, "master");
  if (guard.blocked) return fail("시도 횟수를 초과했어요. 10분 후 다시 시도해 주세요.", 429);
  const b = ((await readJson(req)) ?? {}) as { key?: unknown };
  if (!(await checkMasterKey(typeof b.key === "string" ? b.key : ""))) {
    return json({ error: "관리자 키가 일치하지 않아요.", attemptsLeft: await guard.fail() }, 401);
  }
  await guard.success();
  return json({ token: await issueMaster() });
}
