import "server-only";
import { randomBytes } from "node:crypto";
import { BUILTIN_REGIONS, REGION_LIMITS, type RegionInfo, regionKey, sortRegions } from "./places";
import { getStore } from "./store";

/** 기본 지역 + 사용자가 추가한 지역. all이면 숨김·합쳐진 지역까지 (사이트 관리자용) */
export async function listRegions(all = false): Promise<RegionInfo[]> {
  const added = await getStore().listRegions();
  const list = [...BUILTIN_REGIONS, ...added.filter((r) => !BUILTIN_REGIONS.some((b) => b.id === r.id))];
  return sortRegions(all ? list : list.filter((r) => !r.hidden && !r.mergedInto));
}

/** 합쳐진 지역 → 합쳐진 곳 (예전 `?site=` 링크 이동용) */
export async function regionMoves(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of await listRegions(true)) {
    if (!r.mergedInto) continue;
    const to = await resolveRegion(r.id);
    if (to) out[r.id] = to;
  }
  return out;
}

/** 저장해도 되는 지역인지 확인하고, 합쳐진 지역이면 합쳐진 곳의 id를 돌려줌 */
export async function resolveRegion(id: string): Promise<string | null> {
  const all = await listRegions(true);
  let r = all.find((x) => x.id === id);
  for (let i = 0; r?.mergedInto && i < 5; i++) r = all.find((x) => x.id === r!.mergedInto);
  return r && !r.hidden && !r.mergedInto ? r.id : null;
}

export function cleanRegionLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || s.length > REGION_LIMITS.label) return null;
  return /^[가-힣a-zA-Z0-9 ·()-]+$/.test(s) ? s : null;
}

const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const newRegionId = () => "r" + [...randomBytes(6)].map((b) => ID_CHARS[b % ID_CHARS.length]).join("");

/** 새 지역 추가. 이름이 같은(띄어쓰기·대소문자 무시) 지역이 있으면 그 지역을 돌려줌 */
export async function createRegion(label: string): Promise<{ region: RegionInfo; existed: boolean } | { error: string }> {
  const all = await listRegions(true);
  const same = all.find((r) => regionKey(r.label) === regionKey(label));
  if (same) {
    if (same.mergedInto) {
      const target = all.find((r) => r.id === same.mergedInto);
      if (target && !target.hidden) return { region: target, existed: true };
    }
    if (same.hidden || same.mergedInto) return { error: "사이트 관리자가 정리한 지역 이름이에요. 다른 이름을 써 주세요." };
    return { region: same, existed: true };
  }
  const region: RegionInfo = { id: newRegionId(), label, createdAt: Date.now() };
  await getStore().saveRegion(region);
  return { region, existed: false };
}
