import { hashRosterPin, randomId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { LIMITS, parseRoster } from "@/lib/poll";
import { regionOf } from "@/lib/places";
import { overLimit } from "@/lib/ratelimit";
import { getStore } from "@/lib/store";
import type { RosterList, RosterSummary } from "@/lib/types";

/** 공개 목록: 제목만 (인원수·이름은 노출하지 않음) */
export async function GET(req: Request) {
  const region = regionOf(new URL(req.url).searchParams.get("region"));
  const list = (await getStore().listRosters())
    .filter((r) => r.region === region)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<RosterSummary>(({ id, region, title, updatedAt }) => ({ id, region, title, updatedAt }));
  return json({ rosters: list });
}

export async function POST(req: Request) {
  if (await overLimit(req, "roster-create", 20, 3600)) return fail("잠시 후 다시 시도해 주세요.", 429);
  const b = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const title = typeof b.title === "string" ? b.title.trim().slice(0, LIMITS.team) : "";
  const pin = typeof b.pin === "string" ? b.pin : "";
  const names = parseRoster(b.names);
  if (!title) return fail("명단 이름을 입력해 주세요.");
  if (!/^\d{4}$/.test(pin)) return fail("PIN은 숫자 4자리여야 해요.");
  if (!names) return fail("이름을 1명 이상 입력해 주세요.");
  const pinSalt = randomId(9);
  const r: RosterList = {
    id: randomId(8),
    region: regionOf(b.region),
    title,
    names,
    pinSalt,
    pinHash: await hashRosterPin(pin, pinSalt),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await getStore().saveRoster(r);
  return json({ roster: { id: r.id, region: r.region, title: r.title, updatedAt: r.updatedAt } }, 201);
}
