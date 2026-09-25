import { clientIp, randomId } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { type Place, parseSnap, regionOf } from "@/lib/places";
import { getPlace, getPlaces } from "@/lib/places-server";
import { getStore } from "@/lib/store";

export async function GET(req: Request) {
  const r = new URL(req.url).searchParams.get("region");
  return json({ places: await getPlaces(r ? regionOf(r) : undefined) });
}

/** 식당 추가/수정 (공용 목록). 기존 투표에는 스냅샷이 저장되므로 영향 없음 */
export async function POST(req: Request) {
  const store = getStore();
  if ((await store.hit(`rl:place:${clientIp(req)}`, 3600)) > 40) return fail("잠시 후 다시 시도해 주세요.", 429);
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const snap = parseSnap(body);
  if (!snap) return fail("식당 이름을 입력해 주세요.");
  const existing = snap.id ? await getPlace(snap.id) : null;
  const place: Place = existing
    ? { ...existing, ...snap, id: existing.id, naverId: snap.naverId ?? existing.naverId, editedAt: Date.now() }
    : { ...snap, id: `u${randomId(8)}`, region: regionOf(body?.region), status: "user", uses: 0, editedAt: Date.now() };
  // 사용 횟수는 별도 집계라 저장본에는 넣지 않음
  await store.savePlace({ ...place, uses: 0 });
  return json({ place: (await getPlace(place.id)) ?? place });
}
