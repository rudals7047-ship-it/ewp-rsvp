import type { Answer, Poll, PollDetail, PollResponse, PollSummary, Question, QuestionKind } from "./types";
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
  place: 40,
};

export function pollStatus(p: Pick<Poll, "closed" | "deadline" | "eventAt">, now = Date.now()) {
  if (p.closed) return "closed" as const;
  const end = p.deadline ?? p.eventAt;
  if (end && Date.parse(end) <= now) return "closed" as const;
  return "open" as const;
}

export function toSummary(p: Poll, responseCount: number): PollSummary {
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
  };
}

export function toDetail(p: Poll, responses: PollResponse[]): PollDetail {
  return {
    ...toSummary(p, responses.length),
    note: p.note,
    place: p.place,
    roster: p.roster,
    decisions: p.decisions ?? {},
    questions: p.questions,
    responses: responses.sort((a, b) => a.updatedAt - b.updatedAt),
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
    },
  };
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
  const vis = visibleQuestions(poll, answers);
  for (const q of vis) {
    if (q.required && answers[q.id] === undefined) return { ok: false, error: `'${q.title}'에 답해 주세요.` };
  }
  // 물어보지 않는 질문의 응답은 제거 (확정된 질문은 호출 측에서 기존 응답 유지)
  const visIds = new Set(vis.map((q) => q.id));
  for (const k of Object.keys(answers)) if (!visIds.has(k)) delete answers[k];
  return { ok: true, answers };
}
