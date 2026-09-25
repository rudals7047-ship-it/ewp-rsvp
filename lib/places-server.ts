import "server-only";
import { type Place, type Region } from "./places";
import { SEED_PLACES } from "./places-seed";
import { getStore } from "./store";

/** 메뉴 이름 비교용: 띄어쓰기·괄호·끝의 크기 표기(S/M/L/소/중/대) 무시 ("광동식탕수육S" = "광동식 탕수육 (소/대)") */
const menuKey = (n: string) => n.replace(/\([^)]*\)|\s/g, "").replace(/[SML소중대]$/i, "").toLowerCase();

/** 시드(네이버 수집본) + 사용자 추가·수정분 병합. 사용 횟수는 시드 값 + 앱에서 사용한 횟수 */
export async function getPlaces(region?: Region): Promise<Place[]> {
  const store = getStore();
  const [edits, uses] = await Promise.all([store.listPlaceEdits(), store.placeUses()]);
  const map = new Map<string, Place>(SEED_PLACES.map((p) => [p.id, p]));
  for (const e of edits) {
    const seed = map.get(e.id);
    const merged: Place = { ...seed, ...e, uses: seed?.uses ?? 0 };
    // 시드 메뉴를 나중에 보강했으면 보강본을 쓰고, 편집본에만 있던 메뉴는 뒤에 합침
    if (seed?.refreshedAt && (e.editedAt ?? 0) < seed.refreshedAt) {
      const have = new Set(seed.menus.map((m) => menuKey(m.name)));
      merged.menus = [...seed.menus, ...(e.menus ?? []).filter((m) => !have.has(menuKey(m.name)))].slice(0, 30);
    }
    map.set(e.id, merged);
  }
  return [...map.values()]
    .filter((p) => (!region || p.region === region) && !p.hidden)
    // 빠진 칸이 있어도 화면·검색에서 오류 나지 않도록 기본값 보정
    .map((p) => ({ ...p, category: p.category ?? "", address: p.address ?? "", phone: p.phone ?? "", menus: p.menus ?? [], baseUses: p.uses ?? 0, uses: uses[p.id] ?? 0 }));
}

export async function getPlace(id: string) {
  return (await getPlaces()).find((p) => p.id === id) ?? null;
}

/** 숨김 포함 (사이트 관리자용) */
export async function getPlaceAny(id: string) {
  const store = getStore();
  const e = (await store.listPlaceEdits()).find((x) => x.id === id);
  const seed = SEED_PLACES.find((x) => x.id === id);
  return e || seed ? ({ ...seed, ...e } as Place) : null;
}

