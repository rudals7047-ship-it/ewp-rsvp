import "server-only";
import { PLACE_LIMITS, type Place, type PlaceMenu, type Region } from "./places";
import type { Poll } from "./types";
import { SEED_PLACES } from "./places-seed";
import { getStore } from "./store";

/** 시드(네이버 수집본) + 사용자 추가·수정분 병합. 사용 횟수는 시드 값 + 앱에서 사용한 횟수 */
export async function getPlaces(region?: Region): Promise<Place[]> {
  const store = getStore();
  const [edits, uses] = await Promise.all([store.listPlaceEdits(), store.placeUses()]);
  const map = new Map<string, Place>(SEED_PLACES.map((p) => [p.id, p]));
  for (const e of edits) map.set(e.id, { ...map.get(e.id), ...e, uses: map.get(e.id)?.uses ?? 0 });
  return [...map.values()]
    .filter((p) => !region || p.region === region)
    .map((p) => ({ ...p, uses: p.uses + (uses[p.id] ?? 0) }));
}

export async function getPlace(id: string) {
  return (await getPlaces()).find((p) => p.id === id) ?? null;
}

const LABEL = /^(.*?)\s*\(([^()]+)\)$/;

/**
 * 투표에 쓴 메뉴를 해당 식당의 공용 정보에 자동으로 쌓음 (별도 입력 없이 목록이 풍성해지도록).
 * 이미 있는 메뉴는 건드리지 않고 새 메뉴만 뒤에 추가. 실패해도 투표 저장에는 영향 없음
 */
export async function learnMenus(poll: Poll) {
  const decided = poll.questions.filter((q) => q.topic === "place").map((q) => poll.decisions?.[q.id]).find(Boolean);
  const fallback = poll.place ?? decided;
  const byPlace = new Map<string, string[]>();
  for (const q of poll.questions) {
    if (q.topic !== "menu") continue;
    for (const o of q.options) {
      const place = q.optionGroups?.[o] ?? fallback;
      const id = place ? poll.placeInfo?.[place]?.id : undefined;
      if (id) byPlace.set(id, [...(byPlace.get(id) ?? []), o]);
    }
  }
  if (!byPlace.size) return;
  const store = getStore();
  const all = await getPlaces();
  for (const [id, labels] of byPlace) {
    const p = all.find((x) => x.id === id);
    if (!p) continue;
    const have = new Set(p.menus.map((m) => m.name.replace(/\s/g, "")));
    const add: PlaceMenu[] = [];
    for (const l of labels) {
      const m = LABEL.exec(l.trim());
      const name = (m ? m[1] : l).trim().slice(0, PLACE_LIMITS.menuName);
      const price = m?.[2].trim().slice(0, PLACE_LIMITS.price);
      const key = name.replace(/\s/g, "");
      if (!name || have.has(key)) continue;
      have.add(key);
      add.push(price ? { name, price } : { name });
    }
    const room = PLACE_LIMITS.menus - p.menus.length;
    if (!add.length || room <= 0) continue;
    await store.savePlace({ ...p, menus: [...p.menus, ...add.slice(0, room)], editedAt: Date.now(), uses: 0 });
  }
}
