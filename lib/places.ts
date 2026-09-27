/** 식당 공용 목록 (클라이언트·서버 공용) */

/**
 * 지역 (투표·팀·식당 목록을 나누는 단위)
 * - 기본 지역: 아래 BUILTIN_REGIONS (부서 목록 lib/teams.ts, 초기 식당 lib/places-seed.ts 포함)
 * - 그 밖의 지역: 누구나 홈에서 추가 (DB 저장, id는 r + 영문·숫자 6자)
 * - id는 링크(`?site=<id>`)와 저장 데이터에 쓰이므로 한 번 정하면 바꾸지 않음
 */
export interface RegionInfo {
  id: string;
  label: string;
  /** 네이버 지도 검색에 붙일 지역명 (없으면 label) */
  city?: string;
  builtin?: boolean;
  createdAt?: number;
  /** 사이트 관리자가 숨김 */
  hidden?: boolean;
  /** 다른 지역으로 합쳐짐 (예전 링크는 합쳐진 지역으로 이동) */
  mergedInto?: string;
}

export type Region = string;

export const BUILTIN_REGIONS: RegionInfo[] = [
  { id: "ulsan", label: "울산", city: "울산", builtin: true },
  { id: "dangjin", label: "당진", city: "당진", builtin: true },
];
/** 지역 값이 없던 예전 데이터·잘못된 링크는 첫 번째 기본 지역으로 */
export const DEFAULT_REGION: Region = BUILTIN_REGIONS[0].id;
export const REGION_LIMITS = { label: 10 };

const REGION_ID = /^[a-z][a-z0-9]{1,15}$/;
/** 형식만 확인 (실제로 있는 지역인지는 서버에서 저장할 때 확인) */
export const regionOf = (v: unknown): Region => (typeof v === "string" && REGION_ID.test(v) ? v : DEFAULT_REGION);
/** 지역 이름 비교용: 띄어쓰기·대소문자 무시 */
export const regionKey = (label: string) => label.replace(/\s+/g, "").toLowerCase();

/**
 * 화면 표시 순서. 지금은 기본 지역(울산 → 당진) 먼저, 그다음 추가된 순
 * 나중에 투표 수 순으로 바꾸려면 여기만 고치면 됨 (pollCounts: 지역별 투표 수)
 */
export function sortRegions(list: RegionInfo[], _pollCounts?: Record<string, number>) {
  const order = (r: RegionInfo) => {
    const b = BUILTIN_REGIONS.findIndex((x) => x.id === r.id);
    return b >= 0 ? b : BUILTIN_REGIONS.length;
  };
  return [...list].sort((a, b) => order(a) - order(b) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

// 화면 곳곳(식당 링크 등)에서 지역 이름을 찾을 수 있도록 마지막으로 받은 지역 목록을 기억
let known: RegionInfo[] = BUILTIN_REGIONS;
export const setKnownRegions = (list: RegionInfo[]) => {
  if (list.length) known = list;
};
export const regionInfo = (r: Region | undefined) => known.find((x) => x.id === (r ?? DEFAULT_REGION));
export const regionLabel = (r: Region | undefined) => regionInfo(r)?.label ?? "";

export interface PlaceMenu {
  name: string;
  price?: string;
}

/**
 * verified: 네이버에서 1곳으로 정확히 일치
 * estimated: 동명 업소 중 사업장(지역) 인근으로 추정
 * unverified: 네이버에서 찾지 못함
 * user: 사용자가 추가
 */
export type PlaceStatus = "verified" | "estimated" | "unverified" | "user";

export interface Place {
  id: string;
  region: Region;
  name: string;
  /** 법인카드 가맹점명 등 다른 이름 (검색용) */
  cardName?: string;
  category: string;
  address: string;
  phone: string;
  menus: PlaceMenu[];
  naverId?: string;
  status: PlaceStatus;
  note?: string;
  /** 이 사이트에서 투표에 쓰인 횟수 (정렬·표시용) */
  uses: number;
  /** 참고용 기본 순위: 초기 자료(8월 법인카드 사용 건수). 화면에 숫자로 보여주지 않고 동률일 때 정렬에만 씀 */
  baseUses?: number;
  /** 사용자가 수정한 시각 */
  editedAt?: number;
  /** 직전 저장본 (잘못 고쳤을 때 되돌리기용) */
  prev?: PlaceSnap;
  /** 사이트 관리자가 목록에서 숨김(삭제) */
  hidden?: boolean;
  /** 기본 데이터(시드)의 메뉴를 보강한 시각: 이보다 오래된 사용자 편집본보다 시드 메뉴를 우선 */
  refreshedAt?: number;
}

/** 투표에 저장되는 식당 정보 스냅샷 (이후 공용 목록이 바뀌어도 투표 내용은 유지) */
export type PlaceSnap = Pick<Place, "id" | "name" | "category" | "address" | "phone" | "menus" | "naverId">;

export const PLACE_LIMITS = { name: 40, category: 30, address: 80, phone: 20, menus: 30, menuName: 30, price: 15 };

export function toSnap(p: Place | PlaceSnap): PlaceSnap {
  return { id: p.id, name: p.name, category: p.category, address: p.address, phone: p.phone, menus: p.menus, naverId: p.naverId };
}

export function menuLabel(m: PlaceMenu) {
  return (m.price ? `${m.name} (${m.price})` : m.name).slice(0, 40);
}

/** 선택지 라벨 "이름 (가격)" → 메뉴 */
export function parseLabel(label: string): PlaceMenu {
  // 괄호 안에 숫자가 있을 때만 가격으로 봄 (예: "짬뽕(곱빼기)"는 이름 그대로)
  const m = /^(.*?)\s*\(([^()]*\d[^()]*)\)$/.exec(label.trim());
  const name = (m ? m[1] : label).trim().slice(0, PLACE_LIMITS.menuName);
  const price = m?.[2].trim().slice(0, PLACE_LIMITS.price);
  return price ? { name, price } : { name };
}

export function naverUrl(p: Pick<Place, "name" | "naverId">, region?: Region) {
  if (p.naverId) return `https://m.place.naver.com/restaurant/${p.naverId}/home`;
  const info = region ? regionInfo(region) : undefined;
  const city = info?.city ?? info?.label ?? "";
  return `https://m.search.naver.com/search.naver?query=${encodeURIComponent(`${p.name} ${city}`.trim())}`;
}

/** 많이 고른 순: 이 사이트에서 투표에 쓰인 횟수 → 같으면 초기 자료(카드 사용 건수) */
export function byPopular(a: Pick<Place, "uses" | "baseUses">, b: Pick<Place, "uses" | "baseUses">) {
  return b.uses - a.uses || (b.baseUses ?? 0) - (a.baseUses ?? 0);
}

/* ---------- 검색 (초성 지원) ---------- */

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

function chosung(s: string) {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }
  return out;
}

const clean = (s: string) => s.toLowerCase().replace(/[\s·&()\-,.]/g, "");

/** 한글 포함 검색 (초성만 입력하면 초성으로 비교: "ㅎㄱ" → "회계세무부") */
export function koIncludes(text: string, query: string) {
  const q = clean(query);
  if (!q) return true;
  const t = clean(text);
  return /^[ㄱ-ㅎ]+$/.test(q) ? chosung(t).includes(q) : t.includes(q);
}

/** 이름·가맹점명·분류·메뉴에서 검색. 초성만 입력하면 초성 검색 */
export function searchPlaces(places: Place[], query: string) {
  const q = clean(query);
  const sorted = [...places].sort((a, b) => byPopular(a, b) || a.name.localeCompare(b.name, "ko"));
  if (!q) return sorted;
  const onlyCho = /^[ㄱ-ㅎ]+$/.test(q);
  const scored: { p: Place; s: number }[] = [];
  for (const p of sorted) {
    const names = [p.name, p.cardName ?? ""].map(clean);
    let s = 0;
    if (onlyCho) {
      if (names.some((n) => chosung(n).startsWith(q))) s = 3;
      else if (names.some((n) => chosung(n).includes(q))) s = 2;
    } else if (names.some((n) => n.startsWith(q))) s = 4;
    else if (names.some((n) => n.includes(q))) s = 3;
    else if (clean(p.category ?? "").includes(q)) s = 2;
    else if ((p.menus ?? []).some((m) => clean(m.name).includes(q))) s = 1;
    if (s) scored.push({ p, s });
  }
  return scored.sort((a, b) => b.s - a.s || byPopular(a.p, b.p)).map((x) => x.p);
}

/* ---------- 입력 검증 ---------- */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

export function parseMenus(v: unknown): PlaceMenu[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: PlaceMenu[] = [];
  for (const raw of v) {
    const m = (raw ?? {}) as Record<string, unknown>;
    const name = str(m.name, PLACE_LIMITS.menuName);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const price = str(m.price, PLACE_LIMITS.price);
    out.push(price ? { name, price } : { name });
    if (out.length >= PLACE_LIMITS.menus) break;
  }
  return out;
}

export function parseSnap(v: unknown): PlaceSnap | null {
  const p = (v ?? {}) as Record<string, unknown>;
  const name = str(p.name, PLACE_LIMITS.name);
  if (!name) return null;
  const naverId = str(p.naverId, 20);
  return {
    id: str(p.id, 60),
    name,
    category: str(p.category, PLACE_LIMITS.category),
    address: str(p.address, PLACE_LIMITS.address),
    phone: str(p.phone, PLACE_LIMITS.phone).replace(/[^\d\-+]/g, ""),
    menus: parseMenus(p.menus),
    naverId: /^\d+$/.test(naverId) ? naverId : undefined,
  };
}
