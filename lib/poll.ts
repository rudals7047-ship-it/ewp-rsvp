import { type PlaceSnap, type Region, menuLabel, parseSnap, regionOf } from "./places";
import type { Answer, Poll, PollDetail, PollResponse, PollSummary, Question, QuestionKind, Stage, StageState } from "./types";
import { ATTEND, ATTEND_OPTIONS } from "./types";

export const LIMITS = {
  team: 20,
  title: 60,
  note: 200,
  questions: 8,
  questionTitle: 60,
  options: 12,
  option: 40,
  name: 20,
  text: 300,
  roster: 80,
  responses: 300,
  place: 40,
};

export function pollStatus(p: Pick<Poll, "closed" | "deadline" | "eventAt">, now = Date.now()) {
  if (p.closed) return "closed" as const;
  const end = p.deadline ?? p.eventAt;
  if (end && Date.parse(end) <= now) return "closed" as const;
  return "open" as const;
}

const TOPIC_LABEL = { place: "식당 투표", menu: "메뉴 선택" } as const;

/**
 * 투표 진행 단계 (예: 식당 투표 ✓ → 메뉴 선택 ● ). withDetail=false면 확정값(식당 이름 등)은 숨김
 */
export function pollStages(p: Poll, withDetail: boolean): { stages: Stage[]; label: string } {
  const closed = pollStatus(p) === "closed";
  const round = p.round ?? 1;
  const decided = p.decisions ?? {};
  const stages: Stage[] = [];
  if (p.place) stages.push({ label: "장소 확정", state: "done", detail: withDetail ? p.place : undefined });
  const choice = p.questions.filter((q) => q.kind === "single" || q.kind === "multi");
  const rounds = Array.from(new Set(choice.map((q) => q.round ?? 1))).sort((a, b) => a - b);
  for (const r of rounds) {
    const qs = choice.filter((q) => (q.round ?? 1) === r);
    const topics = Array.from(new Set(qs.map((q) => q.topic).filter(Boolean))) as ("place" | "menu")[];
    const label =
      topics.length === 2
        ? "식당·메뉴 투표"
        : topics.length === 1
          ? TOPIC_LABEL[topics[0]]
          : rounds.length > 1
            ? `${r}차 투표`
            : "투표";
    const allDecided = qs.every((q) => decided[q.id]);
    const state: StageState = closed || r < round || allDecided ? "done" : "current";
    const d = qs.map((q) => decided[q.id]).filter(Boolean).join(", ");
    stages.push({ label, state, detail: withDetail && d ? d : undefined });
  }
  if (!rounds.length) stages.push({ label: p.questions.some((q) => q.kind === "attendance") ? "참석 확인" : "의견 수렴", state: closed ? "done" : "current" });
  // 식당 확정 후 메뉴를 받기로 했는데 아직 메뉴 질문이 없으면 예정 단계로 표시
  if (p.menuLater && !choice.some((q) => q.topic === "menu")) stages.push({ label: "메뉴 선택", state: "todo" });
  stages.push({ label: "마감", state: closed ? "done" : "todo" });
  const current = stages.find((x) => x.state === "current");
  const next = stages.find((x) => x.state === "todo" && x.label !== "마감");
  const label = closed
    ? "마감"
    : current
      ? `${current.label} 중`
      : next
        ? `${next.label} 준비 중`
        : "진행 중";
  return { stages, label };
}

export function toSummary(p: Poll, responseCount: number): PollSummary {
  const { stages, label } = pollStages(p, false);
  return {
    id: p.id,
    team: p.team,
    title: p.title,
    template: p.template,
    eventAt: p.eventAt,
    deadline: p.deadline,
    createdAt: p.createdAt,
    status: pollStatus(p),
    responseCount,
    round: p.round ?? 1,
    region: p.region ?? "ulsan",
    stageLabel: label,
    stages,
  };
}

/** requesterHash: 요청한 기기의 소유 토큰 해시 (응답별 own/locked 계산용, 해시 자체는 내보내지 않음) */
export function toDetail(p: Poll, responses: PollResponse[], requesterHash?: string | null): PollDetail {
  return {
    ...toSummary(p, responses.length),
    stages: pollStages(p, true).stages,
    hasAdminPin: !!p.adminPinHash,
    note: p.note,
    place: p.place,
    roster: p.roster,
    decisions: p.decisions ?? {},
    placeInfo: p.placeInfo ?? {},
    questions: p.questions,
    menuLater: p.menuLater,
    autoMenu: p.autoMenu,
    responses: responses
      .map(({ name, answers, updatedAt, ownerHash, proxy }) => ({
        name,
        answers,
        updatedAt,
        proxy: proxy || undefined,
        own: !!ownerHash && ownerHash === requesterHash,
        locked: !!ownerHash && ownerHash !== requesterHash,
      }))
      .sort((a, b) => a.updatedAt - b.updatedAt),
  };
}

export function nameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function isoOrUndef(v: unknown) {
  if (typeof v !== "string" || !v) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

const KINDS: QuestionKind[] = ["attendance", "single", "multi", "text"];

export interface CreateInput {
  team: string;
  title: string;
  note?: string;
  place?: string;
  roster?: string[];
  menuLater?: boolean;
  adminPin?: string;
  region: Region;
  placeInfo?: Record<string, PlaceSnap>;
  template: "meal" | "general";
  eventAt?: string;
  deadline?: string;
  pin: string;
  questions: Question[];
}

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

/** 질문 하나 검증. 선택지 없는 선택형은 null(건너뜀) */
export function parseQuestion(raw: unknown, allowAttendance: boolean): Parsed<Question | null> {
  const q = (raw ?? {}) as Record<string, unknown>;
  const kind = KINDS.includes(q.kind as QuestionKind) ? (q.kind as QuestionKind) : "single";
  if (kind === "attendance" && !allowAttendance) return { ok: true, data: null };
  const title = str(q.title, LIMITS.questionTitle);
  const options =
    kind === "attendance"
      ? [...ATTEND_OPTIONS]
      : kind === "text"
        ? []
        : Array.from(
            new Set((Array.isArray(q.options) ? q.options : []).map((o) => str(o, LIMITS.option)).filter(Boolean)),
          ).slice(0, LIMITS.options);
  if ((kind === "single" || kind === "multi") && options.length < 1) return { ok: true, data: null };
  if (!title) return { ok: false, error: "질문 제목을 입력해 주세요." };
  return {
    ok: true,
    data: {
      id: "",
      kind,
      title,
      options,
      required: kind === "text" ? false : q.required !== false,
      onlyIfAttending: kind !== "attendance" && q.onlyIfAttending !== false ? true : undefined,
      topic: (kind === "single" || kind === "multi") && (q.topic === "place" || q.topic === "menu") ? q.topic : undefined,
      optionGroups: parseGroups(q.optionGroups, options),
    },
  };
}

function parseGroups(v: unknown, options: string[]) {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, g] of Object.entries(v as Record<string, unknown>)) {
    if (options.includes(k) && typeof g === "string" && g.trim()) out[k] = g.trim().slice(0, LIMITS.option);
  }
  return Object.keys(out).length ? out : undefined;
}

/** 식당과 연계된 메뉴 질문: 참여자가 고른 식당의 메뉴만 (선택 없으면 전체) */
export function allowedOptions(poll: QLike, q: Question, answers: Record<string, Answer>) {
  if (!q.optionGroups) return q.options;
  const placeQ = poll.questions.find((x) => x.topic === "place");
  const picked = placeQ ? answers[placeQ.id] : undefined;
  const places = new Set(Array.isArray(picked) ? picked : picked ? [picked] : []);
  if (!places.size) return q.options;
  const list = q.options.filter((o) => !q.optionGroups![o] || places.has(q.optionGroups![o]));
  return list.length ? list : q.options;
}

export function parseRoster(v: unknown) {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    const n = str(x, LIMITS.name).replace(/\s+/g, " ");
    if (!n || seen.has(nameKey(n))) continue;
    seen.add(nameKey(n));
    out.push(n);
    if (out.length >= LIMITS.roster) break;
  }
  return out.length ? out : undefined;
}

export function parseCreate(body: unknown): Parsed<CreateInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const team = str(b.team, LIMITS.team);
  const title = str(b.title, LIMITS.title);
  const pin = typeof b.pin === "string" ? b.pin : "";
  const template = b.template === "meal" ? "meal" : "general";
  if (!team) return { ok: false, error: "팀을 선택해 주세요." };
  if (!title) return { ok: false, error: "제목을 입력해 주세요." };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: "PIN은 숫자 4자리여야 해요." };
  const adminPin = typeof b.adminPin === "string" && b.adminPin ? b.adminPin : undefined;
  if (adminPin !== undefined && !/^\d{4}$/.test(adminPin)) return { ok: false, error: "관리자 PIN은 숫자 4자리여야 해요." };
  if (adminPin && adminPin === pin) return { ok: false, error: "관리자 PIN은 참여 PIN과 달라야 해요." };

  const rawQs = Array.isArray(b.questions) ? b.questions.slice(0, LIMITS.questions) : [];
  const questions: Question[] = [];
  for (const raw of rawQs) {
    const r = parseQuestion(raw, !questions.some((q) => q.kind === "attendance"));
    if (!r.ok) return r;
    if (r.data) questions.push(r.data);
  }
  if (!questions.length) return { ok: false, error: "질문을 하나 이상 추가해 주세요." };
  // 참석 질문은 항상 맨 앞, onlyIfAttending은 참석 질문이 있을 때만 의미 있음
  const hasAttendance = questions.some((q) => q.kind === "attendance");
  questions.sort((a, b) => Number(b.kind === "attendance") - Number(a.kind === "attendance"));
  questions.forEach((q, i) => {
    q.id = `q${i + 1}`;
    if (!hasAttendance || q.kind === "attendance") delete q.onlyIfAttending;
  });

  // 식당 스냅샷: 실제 선택지나 장소 이름에 해당하는 것만 보관
  const allowed = new Set([str(b.place, LIMITS.place), ...questions.flatMap((q) => q.options)].filter(Boolean));
  const placeInfo: Record<string, PlaceSnap> = {};
  if (b.placeInfo && typeof b.placeInfo === "object") {
    for (const [k, v] of Object.entries(b.placeInfo as Record<string, unknown>).slice(0, 20)) {
      const snap = parseSnap(v);
      if (snap && allowed.has(k)) placeInfo[k] = snap;
    }
  }

  const eventAt = isoOrUndef(b.eventAt);
  const deadline = isoOrUndef(b.deadline);
  if (deadline && eventAt && Date.parse(deadline) > Date.parse(eventAt)) {
    return { ok: false, error: "응답 마감은 모임 시작 전이어야 해요." };
  }
  return {
    ok: true,
    data: {
      team,
      title,
      note: str(b.note, LIMITS.note) || undefined,
      place: str(b.place, LIMITS.place) || undefined,
      roster: parseRoster(b.roster),
      menuLater: b.menuLater === true || undefined,
      adminPin,
      region: regionOf(b.region),
      placeInfo: Object.keys(placeInfo).length ? placeInfo : undefined,
      template,
      eventAt,
      deadline,
      pin,
      questions,
    },
  };
}

type QLike = { questions: Question[]; decisions?: Record<string, string> };

/** 실제로 물어볼 질문: 확정된 질문 제외, 불참자에게는 onlyIfAttending 제외 */
export function visibleQuestions(poll: QLike, answers: Record<string, Answer>) {
  const decided = poll.decisions ?? {};
  const att = poll.questions.find((q) => q.kind === "attendance");
  const notAttending = att && answers[att.id] === ATTEND.no;
  return poll.questions.filter((q) => !decided[q.id] && !(notAttending && q.onlyIfAttending));
}

/** 아직 답하지 않은 필수 질문 (2차 질문이 열렸을 때 재참여 유도용) */
export function pendingQuestions(poll: QLike, answers: Record<string, Answer>) {
  return visibleQuestions(poll, answers).filter((q) => q.required && answers[q.id] === undefined);
}

export function parseAnswers(poll: QLike, raw: unknown): { ok: true; answers: Record<string, Answer> } | { ok: false; error: string } {
  const input = (raw ?? {}) as Record<string, unknown>;
  const answers: Record<string, Answer> = {};
  for (const q of poll.questions) {
    const v = input[q.id];
    if (q.kind === "text") {
      const t = str(v, LIMITS.text);
      if (t) answers[q.id] = t;
    } else if (q.kind === "multi") {
      const arr = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && q.options.includes(x)) : [];
      if (arr.length) answers[q.id] = Array.from(new Set(arr));
    } else if (typeof v === "string" && q.options.includes(v)) {
      answers[q.id] = v;
    }
  }
  // 식당 연계 메뉴: 고르지 않은 식당의 메뉴는 제거
  for (const q of poll.questions) {
    if (!q.optionGroups || answers[q.id] === undefined) continue;
    const ok = new Set(allowedOptions(poll, q, answers));
    const v = answers[q.id];
    if (Array.isArray(v)) {
      const kept = v.filter((x) => ok.has(x));
      if (kept.length) answers[q.id] = kept;
      else delete answers[q.id];
    } else if (!ok.has(v)) delete answers[q.id];
  }
  const vis = visibleQuestions(poll, answers);
  for (const q of vis) {
    if (q.required && answers[q.id] === undefined) return { ok: false, error: `'${q.title}'에 답해 주세요.` };
  }
  // 물어보지 않는 질문의 응답은 제거 (확정된 질문은 호출 측에서 기존 응답 유지)
  const visIds = new Set(vis.map((q) => q.id));
  for (const k of Object.keys(answers)) if (!visIds.has(k)) delete answers[k];
  return { ok: true, answers };
}

/* ---------- 다음 차수 (식당 확정 → 메뉴 투표) ---------- */

type NewQ = Pick<Question, "kind" | "title" | "options" | "required"> & Partial<Pick<Question, "topic" | "optionGroups">>;

/** 다음 차수 질문 추가. 요청사항(자유 입력)은 항상 마지막. 이미 지난 마감은 풀어서 다시 받을 수 있게 */
export function addRound(poll: Poll, q: NewQ) {
  const round = (poll.round ?? 1) + 1;
  const nextId = Math.max(0, ...poll.questions.map((x) => Number(x.id.slice(1)) || 0)) + 1;
  const hasAttendance = poll.questions.some((x) => x.kind === "attendance");
  const firstText = poll.questions.findIndex((x) => x.kind === "text");
  const at = firstText === -1 ? poll.questions.length : firstText;
  const topic = poll.template === "meal" && !poll.questions.some((x) => x.topic === "menu") ? "menu" : q.topic;
  poll.questions.splice(at, 0, { ...q, id: `q${nextId}`, round, topic, onlyIfAttending: hasAttendance ? true : undefined });
  poll.round = round;
  poll.closed = false;
  // 식당 투표 마감이 지났으면 메뉴는 모임 시작 전까지 받음
  if (poll.deadline && Date.parse(poll.deadline) <= Date.now()) poll.deadline = undefined;
}

/** 식당 투표 득표 순위 (동점이면 top이 여러 개) */
export function placeRanking(poll: Poll, responses: PollResponse[]) {
  const q = poll.questions.find((x) => x.topic === "place");
  if (!q) return null;
  const count = new Map(q.options.map((o) => [o, 0]));
  for (const r of responses) {
    const v = r.answers[q.id];
    for (const o of Array.isArray(v) ? v : v ? [v] : []) if (count.has(o)) count.set(o, count.get(o)! + 1);
  }
  const max = Math.max(0, ...count.values());
  return { q, count, top: max > 0 ? [...count].filter(([, n]) => n === max).map(([o]) => o) : [] };
}

/** 식당을 확정하고 그 식당 메뉴로 메뉴 투표 시작. 실패하면 이유 문자열 */
export function startMenuRound(poll: Poll, place: string): string | null {
  const q = poll.questions.find((x) => x.topic === "place");
  if (!q || !q.options.includes(place)) return "식당을 찾을 수 없어요.";
  if (poll.questions.some((x) => x.topic === "menu")) return "메뉴 투표가 이미 시작됐어요.";
  const menus = (poll.placeInfo?.[place]?.menus ?? []).map(menuLabel).slice(0, LIMITS.options);
  if (!menus.length) return "이 식당은 등록된 메뉴가 없어요. 관리 탭에서 메뉴를 직접 입력해 주세요.";
  if (poll.questions.length >= LIMITS.questions) return "질문은 최대 8개까지예요.";
  poll.decisions = { ...(poll.decisions ?? {}), [q.id]: place };
  addRound(poll, { kind: "single", title: "어떤 메뉴로 하시겠어요?", options: menus, required: true, topic: "menu" });
  return null;
}

/**
 * 식당 투표 마감 시각이 지나면 1위 식당(동점 없음)으로 확정하고 메뉴 투표를 자동 시작.
 * 동점·무투표·메뉴 정보 없음이면 그대로 두고 관리자가 한 번에 시작하도록 안내. 바뀌었으면 true
 */
export function autoAdvance(poll: Poll, responses: PollResponse[], now = Date.now()) {
  if (poll.template !== "meal" || !poll.menuLater || poll.closed || (poll.round ?? 1) !== 1) return false;
  if (!poll.deadline || Date.parse(poll.deadline) > now) return false;
  if (poll.eventAt && Date.parse(poll.eventAt) <= now) return false;
  const rank = placeRanking(poll, responses);
  if (!rank || poll.decisions?.[rank.q.id] || rank.top.length !== 1) return false;
  if (startMenuRound(poll, rank.top[0])) return false;
  poll.autoMenu = true;
  return true;
}
