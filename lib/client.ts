"use client";

import { nameKey, visibleQuestions } from "./poll";
import type { Place, PlaceMenu, Region } from "./places";
import type { PollDetail, PollSummary, Question, RosterSummary } from "./types";
import { ATTEND } from "./types";

/* ---------- 브라우저 저장소 (실패해도 동작하도록) ---------- */

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const local = {
  get: (k: string) => safe(() => localStorage.getItem(k), null),
  set: (k: string, v: string) => safe(() => localStorage.setItem(k, v), undefined),
  del: (k: string) => safe(() => localStorage.removeItem(k), undefined),
};
export const session = {
  get: (k: string) => safe(() => sessionStorage.getItem(k), null),
  set: (k: string, v: string) => safe(() => sessionStorage.setItem(k, v), undefined),
  del: (k: string) => safe(() => sessionStorage.removeItem(k), undefined),
};

export const keys = {
  name: "me:name",
  owner: "me:owner",
  team: "me:team",
  region: "me:region",
  access: (id: string) => `access:${id}`,
  admin: (id: string) => `admin:${id}`,
};

/** 이 기기 고유의 응답 소유 토큰 (다른 기기가 같은 이름으로 덮어쓰는 것 방지) */
let memOwner: string | null = null;
export function ownerToken() {
  const saved = local.get(keys.owner);
  if (saved) return saved;
  if (!memOwner) {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    memOwner = btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    local.set(keys.owner, memOwner);
  }
  return memOwner;
}

/* ---------- API ---------- */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}, id?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (id) {
    const t = session.get(keys.access(id));
    const a = local.get(keys.admin(id));
    if (t) headers.set("x-poll-token", t);
    if (a) headers.set("x-admin-token", a);
    headers.set("x-owner-token", ownerToken());
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("네트워크 연결을 확인해 주세요.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "문제가 발생했어요.", res.status, data);
  return data as T;
}

export const api = {
  list: () => request<{ storage: "redis" | "memory"; polls: PollSummary[] }>("/api/polls"),
  create: (body: unknown) =>
    request<{ id: string; adminToken: string }>("/api/polls", { method: "POST", body: JSON.stringify(body) }),
  unlock: (id: string, pin: string) =>
    request<{ token: string; poll: PollDetail }>(
      `/api/polls/${id}/unlock`,
      { method: "POST", body: JSON.stringify({ pin }) },
      id,
    ),
  detail: (id: string) => request<{ poll: PollDetail }>(`/api/polls/${id}`, {}, id),
  respond: (id: string, name: string, answers: unknown, proxy = false) =>
    request<{ poll: PollDetail }>(
      `/api/polls/${id}/responses`,
      { method: "POST", body: JSON.stringify({ name, answers, proxy }) },
      id,
    ),
  admin: (
    id: string,
    body:
      | { action: "close" | "reopen" }
      | { action: "decide"; questionId: string; option: string | null }
      | { action: "addQuestion"; question: { kind: "single" | "multi"; title: string; options: string[] } }
      | { action: "startMenu"; option: string },
  ) => request<{ poll: PollDetail }>(`/api/polls/${id}`, { method: "PATCH", body: JSON.stringify(body) }, id),
  places: (region: Region) => request<{ places: Place[] }>(`/api/places?region=${region}`),
  savePlace: (p: {
    id?: string;
    region: Region;
    name: string;
    category: string;
    address: string;
    phone: string;
    menus: PlaceMenu[];
    naverId?: string;
  }) => request<{ place: Place }>("/api/places", { method: "POST", body: JSON.stringify(p) }),
  addMenus: (id: string, menus: PlaceMenu[]) =>
    request<{ place: Place; added: number }>("/api/places", { method: "POST", body: JSON.stringify({ action: "addMenus", id, menus }) }),
  revertPlace: (id: string) => request<{ place: Place }>("/api/places", { method: "POST", body: JSON.stringify({ action: "revert", id }) }),
  rosters: (region: Region) => request<{ rosters: RosterSummary[] }>(`/api/rosters?region=${region}`),
  createRoster: (b: { region: Region; title: string; names: string[]; pin: string }) =>
    request<{ roster: RosterSummary }>("/api/rosters", { method: "POST", body: JSON.stringify(b) }),
  roster: (id: string, b: { pin: string; action: "open" | "update" | "delete"; names?: string[]; title?: string }) =>
    request<{ names?: string[]; title?: string; ok?: true }>(`/api/rosters/${id}`, { method: "POST", body: JSON.stringify(b) }),
  adminLogin: (id: string, pin: string) =>
    request<{ adminToken: string; token: string; poll: PollDetail }>(`/api/polls/${id}/admin`, { method: "POST", body: JSON.stringify({ pin }) }, id),
  removeResponse: (id: string, name: string) =>
    request<{ poll: PollDetail }>(`/api/polls/${id}/responses?name=${encodeURIComponent(name)}`, { method: "DELETE" }, id),
  /** 관리자: 이 기기 명의로 묶인 응답을 '대신 입력한 응답'으로 바꿔 기기 명의 해제 (응답 내용은 유지) */
  releaseResponse: (id: string, name: string) =>
    request<{ poll: PollDetail }>(`/api/polls/${id}/responses?name=${encodeURIComponent(name)}&release=1`, { method: "DELETE" }, id),
  remove: (id: string) => request<{ ok: true }>(`/api/polls/${id}`, { method: "DELETE" }, id),
};

/* ---------- 분석 (GoatCounter 이벤트) ---------- */

export function track(event: string) {
  const gc = (window as unknown as { goatcounter?: { count?: (o: object) => void } }).goatcounter;
  safe(() => gc?.count?.({ path: event, title: event, event: true }), undefined);
}

export function vibrate(ms = 12) {
  safe(() => navigator.vibrate?.(ms), false);
}

/* ---------- 날짜 표시 (한국 시간 기준) ---------- */

const TZ = "Asia/Seoul";

export function fmtDate(iso: string, withTime = true) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, month: "long", day: "numeric", weekday: "short" })
    .format(d)
    .replace(/\s*\((.)\)/, " ($1)");
  if (!withTime) return date;
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return `${date} ${time}`;
}

export function relUntil(iso: string, now = Date.now()) {
  const diff = Date.parse(iso) - now;
  if (diff <= 0) return null;
  const m = Math.round(diff / 60000);
  if (m < 60) return `${Math.max(1, m)}분`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}시간`;
  return `${Math.round(h / 24)}일`;
}

export function dday(iso: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
  const a = Date.parse(fmt.format(new Date(iso)));
  const b = Date.parse(fmt.format(new Date()));
  const d = Math.round((a - b) / 86400000);
  if (d === 0) return "오늘";
  if (d === 1) return "내일";
  if (d > 0) return `D-${d}`;
  return null;
}

/** 로컬 date/time input 값 → ISO (한국 시간으로 해석) */
export function kstToIso(date: string, time: string) {
  if (!date) return undefined;
  return new Date(`${date}T${time || "00:00"}:00+09:00`).toISOString();
}

export function kstToday(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() + offsetDays * 86400000));
}

/* ---------- 집계 ---------- */

export interface Tally {
  option: string;
  count: number;
  names: string[];
}

export function tally(poll: PollDetail, q: Question): Tally[] {
  const map = new Map<string, Tally>(q.options.map((o) => [o, { option: o, count: 0, names: [] }]));
  for (const r of poll.responses) {
    const v = r.answers[q.id];
    for (const o of Array.isArray(v) ? v : v ? [v] : []) {
      const t = map.get(o);
      if (t) {
        t.count++;
        t.names.push(r.name);
      }
    }
  }
  const list = [...map.values()];
  return q.kind === "attendance" ? list : list.sort((a, b) => b.count - a.count);
}

export function attendanceOf(poll: PollDetail, name: string) {
  const q = poll.questions.find((x) => x.kind === "attendance");
  const r = poll.responses.find((x) => x.name === name);
  return q && r ? (r.answers[q.id] as string | undefined) : undefined;
}

/* ---------- 사람별 응답 현황 ---------- */

export type CellState = "done" | "todo" | "skip";
export interface ProgressRow {
  name: string;
  responded: boolean;
  offRoster: boolean;
  proxy: boolean;
  cells: { state: CellState; text?: string }[];
  /** 아직 해야 할 항목 이름들 (예: ["메뉴"]) */
  todo: string[];
}

const shortOption = (o: string) => o.replace(/\s*\([^)]*원\)$/, "").replace(/\s*·\s*[\d,]+원$/, "");

/** 사람(명단 + 응답자) × 질문(참석·식당·메뉴…) 표: 누가 어디까지 했는지 */
export function progressTable(poll: PollDetail) {
  const cols = poll.questions
    .filter((q) => q.kind !== "text")
    .map((q) => ({
      id: q.id,
      label: q.kind === "attendance" ? "참석" : q.topic === "place" ? "식당" : q.topic === "menu" ? "메뉴" : q.title.length > 6 ? `${q.title.slice(0, 5)}…` : q.title,
      round: q.round ?? 1,
      q,
    }));
  const rosterKeys = new Set((poll.roster ?? []).map(nameKey));
  const byKey = new Map(poll.responses.map((r) => [nameKey(r.name), r]));
  const names = [...(poll.roster ?? []), ...poll.responses.filter((r) => !rosterKeys.has(nameKey(r.name))).map((r) => r.name)];
  const rows: ProgressRow[] = names.map((name) => {
    const r = byKey.get(nameKey(name));
    if (!r) {
      return { name, responded: false, offRoster: false, proxy: false, cells: cols.map(() => ({ state: "todo" as const })), todo: ["전체"] };
    }
    const vis = new Set(visibleQuestions(poll, r.answers).map((q) => q.id));
    const todo: string[] = [];
    const cells = cols.map(({ q, label }) => {
      const v = r.answers[q.id];
      const has = Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
      if (has) return { state: "done" as const, text: (Array.isArray(v) ? v : [v]).map(shortOption).join(", ") };
      // 확정된 질문(투표 종료)이나 불참자에게 묻지 않는 질문은 해당 없음
      if (poll.decisions[q.id] || !vis.has(q.id)) return { state: "skip" as const };
      if (q.required) todo.push(label);
      return { state: q.required ? ("todo" as const) : ("skip" as const) };
    });
    return { name: r.name, responded: true, offRoster: !!poll.roster?.length && !rosterKeys.has(nameKey(r.name)), proxy: !!r.proxy, cells, todo };
  });
  // 아직 할 일이 있는 사람을 위로
  rows.sort((a, b) => Number(b.todo.length > 0) - Number(a.todo.length > 0));
  return { cols, rows, pending: rows.filter((r) => r.todo.length > 0) };
}

/** 명단 대비 미응답자 */
export function missing(poll: PollDetail) {
  if (!poll.roster?.length) return null;
  const done = new Set(poll.responses.map((r) => nameKey(r.name)));
  return poll.roster.filter((n) => !done.has(nameKey(n)));
}

export function headcount(poll: PollDetail) {
  const q = poll.questions.find((x) => x.kind === "attendance");
  if (!q) return null;
  const t = tally(poll, q);
  const get = (o: string) => t.find((x) => x.option === o)?.count ?? 0;
  return { yes: get(ATTEND.yes), maybe: get(ATTEND.maybe), no: get(ATTEND.no) };
}

export function summaryText(poll: PollDetail) {
  const lines: string[] = [`[${poll.team}] ${poll.title}`];
  if (poll.eventAt) lines.push(`📅 ${fmtDate(poll.eventAt)}`);
  const placeLine = (name: string) => {
    const i = poll.placeInfo[name];
    return [name, i?.address, i?.phone].filter(Boolean).join(" · ");
  };
  if (poll.place) lines.push(`📍 ${placeLine(poll.place)}`);
  for (const q of poll.questions) if (poll.decisions[q.id]) lines.push(`✅ ${q.title} → ${placeLine(poll.decisions[q.id])} (확정)`);
  const hc = headcount(poll);
  if (hc) lines.push(`👥 참석 ${hc.yes}명${hc.maybe ? ` · 미정 ${hc.maybe}명` : ""} · 불참 ${hc.no}명`);
  const { rows, pending } = progressTable(poll);
  lines.push(`응답 완료 ${rows.length - pending.length}/${rows.length}명`);
  if (pending.length) lines.push(`⏳ 마무리 전: ${pending.map((r) => `${r.name}(${r.todo.includes("전체") ? "미응답" : `${r.todo.join("·")} 남음`})`).join(", ")}`);
  lines.push("");
  for (const q of poll.questions) {
    if (q.kind === "text") {
      const texts = poll.responses.filter((r) => r.answers[q.id]).map((r) => `- ${r.name}: ${r.answers[q.id]}`);
      if (texts.length) lines.push(`■ ${q.title}`, ...texts, "");
      continue;
    }
    lines.push(`■ ${q.title}`);
    for (const t of tally(poll, q)) {
      if (q.kind !== "attendance" && t.count === 0) continue;
      const mark = poll.decisions[q.id] === t.option ? " ✅" : "";
      lines.push(`- ${t.option} ${t.count}${mark}${t.names.length ? ` (${t.names.join(", ")})` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/** 공유용 링크: 짧은 경로 /p/<id> */
export function pollUrl(id: string) {
  return `${location.origin}/p/${id}`;
}

/** 공유 메시지: 무엇을·어느 단계인지·언제까지를 한눈에 */
export function shareText(p: { team: string; title: string; stageLabel?: string; eventAt?: string; deadline?: string }) {
  const lines = [`[${p.team}] ${p.title}`];
  if (p.stageLabel) lines.push(`🗳️ 지금: ${p.stageLabel}`);
  if (p.eventAt) lines.push(`📅 ${fmtDate(p.eventAt)}`);
  const end = p.deadline ?? p.eventAt;
  if (end) lines.push(`⏰ 응답 마감: ${fmtDate(end)}`);
  return lines.join("\n");
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = safe(() => document.execCommand("copy"), false);
    ta.remove();
    return ok;
  }
}

export async function shareLink(url: string, title: string, text: string) {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    try {
      await nav.share({ title, text, url });
      return "shared" as const;
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled" as const;
    }
  }
  return (await copyText(`${text}\n${url}`)) ? ("copied" as const) : ("failed" as const);
}

export { ATTEND };

/**
 * 가게 정보 등 외부 링크 열기. 카카오톡 인앱 브라우저에서는 같은 창으로 넘어가면 투표 화면으로 돌아올 수 없어서
 * 휴대폰 기본 브라우저로 열도록 넘김 (카카오톡 openExternal 스킴, 라인은 openExternalBrowser 파라미터)
 */
export function openExternal(url: string) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) {
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return;
  }
  if (/\bLine\//i.test(ua)) url += `${url.includes("?") ? "&" : "?"}openExternalBrowser=1`;
  window.open(url, "_blank", "noopener");
}

/** 받침에 맞는 조사 (식당은/메뉴는, 미가로/댓잎장어로/수림복국으로). 한글이 아니면 (으)로 형태 */
export function josa(word: string, pair: "은는" | "이가" | "을를" | "으로") {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return pair === "으로" ? "(으)로" : `${pair[0]}(${pair[1]})`;
  const jong = (c - 0xac00) % 28;
  if (pair === "으로") return jong === 0 || jong === 8 ? "로" : "으로";
  return jong ? pair[0] : pair[1];
}
