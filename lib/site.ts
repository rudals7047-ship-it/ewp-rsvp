/**
 * 회계세무부 전용 사이트 (같은 앱·같은 데이터, 주소와 화면만 다름)
 * - ewptax.vercel.app 으로 들어오면 proxy.ts가 /t 경로로 넘김 (본 사이트에서는 /t 로도 열림)
 * - 팀·지역은 고정, 명단은 명단 보관함의 '회계세무부' 명단을 PIN으로 불러옴 (실명은 코드에 넣지 않음: 공개 저장소)
 */
export const TEAM_SITE = {
  host: "ewptax.vercel.app",
  team: "회계세무부",
  region: "ulsan",
  rosterTitle: "회계세무부",
} as const;

/** 투표 짧은 id (lib/auth.ts shortId 알파벳) */
export const POLL_ID = /^[2-9a-hjkmnp-z]{7}$/;

/** 지금 화면이 회계세무부 전용 사이트인지 (브라우저에서만) */
export function isTeamSite() {
  if (typeof location === "undefined") return false;
  return location.hostname === TEAM_SITE.host || location.pathname === "/t" || location.pathname.startsWith("/t/");
}

/** 투표 경로: 전용 도메인은 /<id>, 본 사이트의 전용 화면은 /t/<id>, 일반은 /p/<id> */
export function pollPath(id: string) {
  if (typeof location !== "undefined" && location.hostname === TEAM_SITE.host) return `/${id}`;
  return isTeamSite() ? `/t/${id}` : `/p/${id}`;
}
