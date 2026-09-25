import { randomId, verifyMaster } from "@/lib/auth";
import { overLimit } from "@/lib/ratelimit";
import { fail, json, readJson } from "@/lib/http";
import { PLACE_LIMITS, type Place, parseMenus, parseSnap, regionOf, toSnap } from "@/lib/places";
import { getPlace, getPlaceAny, getPlaces } from "@/lib/places-server";
import { getStore } from "@/lib/store";

export async function GET(req: Request) {
  const r = new URL(req.url).searchParams.get("region");
  return json({ places: await getPlaces(r ? regionOf(r) : undefined) });
}

/** 식당 추가/수정 (공용 목록). 기존 투표에는 스냅샷이 저장되므로 영향 없음 */
export async function POST(req: Request) {
  const store = getStore();
  if (await overLimit(req, "place", 40, 3600)) return fail("잠시 후 다시 시도해 주세요.", 429);
  const body = (await readJson(req)) as Record<string, unknown> | null;

  // 투표에 직접 넣은 메뉴를 식당 정보에 '추가만' (기존 메뉴는 절대 바꾸지 않음)
  if (body?.action === "addMenus") {
    const p = typeof body.id === "string" ? await getPlace(body.id) : null;
    if (!p) return fail("식당을 찾을 수 없어요.", 404);
    const have = new Set(p.menus.map((m) => m.name.replace(/\s/g, "")));
    const add = parseMenus(body.menus).filter((m) => {
      const k = m.name.replace(/\s/g, "");
      return !have.has(k) && !!have.add(k);
    });
    const menus = [...p.menus, ...add].slice(0, PLACE_LIMITS.menus);
    if (menus.length > p.menus.length) await store.savePlace({ ...p, menus, prev: toSnap(p), editedAt: Date.now(), uses: 0 });
    return json({ place: (await getPlace(p.id)) ?? p, added: menus.length - p.menus.length });
  }

  // 사이트 관리자: 목록에서 삭제(숨김). 이미 만든 투표의 식당 정보에는 영향 없음
  if (body?.action === "hide") {
    if (!(await verifyMaster(req))) return fail("사이트 관리자만 삭제할 수 있어요.", 403);
    const p = typeof body.id === "string" ? await getPlaceAny(body.id) : null;
    if (!p) return fail("식당을 찾을 수 없어요.", 404);
    await store.savePlace({ ...p, hidden: true, editedAt: Date.now(), uses: 0 });
    return json({ ok: true });
  }

  // 직전 저장본으로 되돌리기 (누가 잘못 고쳤을 때)
  if (body?.action === "revert") {
    const p = typeof body.id === "string" ? await getPlace(body.id) : null;
    if (!p?.prev) return fail("되돌릴 이전 내용이 없어요.");
    await store.savePlace({ ...p, ...p.prev, id: p.id, prev: toSnap(p), editedAt: Date.now(), uses: 0 });
    return json({ place: await getPlace(p.id) });
  }

  const snap = parseSnap(body);
  if (!snap) return fail("식당 이름을 입력해 주세요.");
  const existing = snap.id ? await getPlace(snap.id) : null;
  const place: Place = existing
    ? { ...existing, ...snap, id: existing.id, naverId: snap.naverId ?? existing.naverId, prev: toSnap(existing), editedAt: Date.now() }
    : { ...snap, id: `u${randomId(8)}`, region: regionOf(body?.region), status: "user", uses: 0, editedAt: Date.now() };
  // 사용 횟수는 별도 집계라 저장본에는 넣지 않음
  await store.savePlace({ ...place, uses: 0 });
  return json({ place: (await getPlace(place.id)) ?? place });
}
