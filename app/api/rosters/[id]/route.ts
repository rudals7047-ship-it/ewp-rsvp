import { verifyRosterPin } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { LIMITS, parseRoster } from "@/lib/poll";
import { pinGuard } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

/**
 * 명단 열기/수정/삭제는 모두 PIN 필요 (POST 본문으로 전달해 URL·로그에 PIN이 남지 않게)
 * action: "open" | "update" | "delete"
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const store = getStore();
  const roster = await store.getRoster(id);
  if (!roster) return fail("명단을 찾을 수 없어요.", 404);

  const guard = await pinGuard(req, `roster:${id}`);
  if (guard.blocked) return fail("시도 횟수를 초과했어요. 10분 후 다시 시도해 주세요.", 429);
  const b = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const pin = typeof b.pin === "string" ? b.pin : "";
  if (!(await verifyRosterPin(roster, pin))) {
    return json({ error: "PIN이 일치하지 않아요.", attemptsLeft: await guard.fail() }, 401);
  }
  await guard.success();

  if (b.action === "delete") {
    await store.deleteRoster(id);
    return json({ ok: true });
  }
  if (b.action === "update") {
    const names = parseRoster(b.names);
    if (!names) return fail("이름을 1명 이상 입력해 주세요.");
    const title = typeof b.title === "string" && b.title.trim() ? b.title.trim().slice(0, LIMITS.team) : roster.title;
    await store.saveRoster({ ...roster, names, title, updatedAt: Date.now() });
    return json({ names, title });
  }
  return json({ names: roster.names, title: roster.title });
}
