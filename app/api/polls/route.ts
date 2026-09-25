import { hashAdminPin, shortId, hashAdmin, hashPin, randomId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { autoAdvance, parseCreate, toSummary } from "@/lib/poll";
import { overLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import type { Poll } from "@/lib/types";

export async function GET() {
  const store = getStore();
  const rows = await store.listPolls(200);
  // 마감이 지난 식당 투표는 목록에서도 메뉴 투표 단계로 보이게
  for (const row of rows) {
    const p = row.poll;
    if (p.menuLater && (p.round ?? 1) === 1 && p.deadline && Date.parse(p.deadline) <= Date.now()) {
      if (autoAdvance(p, await store.getResponses(p.id))) await store.savePoll(p);
    }
  }
  return json({
    storage: store.kind,
    polls: rows.map(({ poll, responseCount }) => toSummary(poll, responseCount)),
  });
}

export async function POST(req: Request) {
  const store = getStore();
  if (await overLimit(req, "create", 30, 3600)) {
    return fail("잠시 후 다시 시도해 주세요.", 429);
  }
  const parsed = parseCreate(await readJson(req));
  if (!parsed.ok) return fail(parsed.error);
  const { pin, adminPin, ...data } = parsed.data;

  // 짧고 읽기 쉬운 링크 ID (충돌 시 재시도)
  let id = shortId();
  for (let i = 0; i < 3 && (await store.getPoll(id)); i++) id = shortId();
  const adminToken = randomId(18);
  const pinSalt = randomId(9);
  const poll: Poll = {
    ...data,
    id,
    createdAt: Date.now(),
    closed: false,
    round: 1,
    pinSalt,
    pinHash: await hashPin(pin, pinSalt),
    adminHash: await hashAdmin(adminToken),
  };
  if (adminPin) {
    poll.adminPinSalt = randomId(9);
    poll.adminPinHash = await hashAdminPin(adminPin, poll.adminPinSalt);
  }
  await store.savePoll(poll);
  // 사용한 식당은 공용 목록에서 위로 올라오도록 사용 횟수 증가
  const ids = Object.values(poll.placeInfo ?? {}).map((p) => p.id).filter(Boolean);
  if (ids.length) await store.addPlaceUses([...new Set(ids)]).catch(() => {});
  return json({ id, adminToken }, 201);
}
