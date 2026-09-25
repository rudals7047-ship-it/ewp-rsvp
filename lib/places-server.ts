import "server-only";
import { type Place, type Region } from "./places";
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

