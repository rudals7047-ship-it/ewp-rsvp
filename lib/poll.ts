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
  };
}

export function toDetail(p: Poll, responses: PollResponse[]): PollDetail {
  return {
    ...toSummary(p, responses.length),
    note: p.note,
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
  template: "meal" | "general";
  eventAt?: string;
  deadline?: string;
  pin: string;
  questions: Question[];
}

export function parseCreate(body: unknown): { ok: true; data: CreateInput } | { ok: false; error: string } {
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
  let hasAttendance = false;
  for (const [i, raw] of rawQs.entries()) {
    const q = (raw ?? {}) as Record<string, unknown>;
    const kind = KINDS.includes(q.kind as QuestionKind) ? (q.kind as QuestionKind) : "single";
    if (kind === "attendance") {
      if (hasAttendance) continue;
      hasAttendance = true;
    }
    const qTitle = str(q.title, LIMITS.questionTitle);
    const options =
      kind === "attendance"
        ? [...ATTEND_OPTIONS]
        : kind === "text"
          ? []
          : Array.from(
              new Set(
                (Array.isArray(q.options) ? q.options : [])
                  .map((o) => str(o, LIMITS.option))
                  .filter(Boolean),
              ),
            ).slice(0, LIMITS.options);
    if ((kind === "single" || kind === "multi") && options.length < 1) continue;
    if (!qTitle) return { ok: false, error: `${i + 1}번째 질문 제목을 입력해 주세요.` };
    questions.push({
      id: `q${questions.length + 1}`,
      kind,
      title: qTitle,
      options,
      required: kind === "text" ? false : q.required !== false,
      onlyIfAttending: kind !== "attendance" && q.onlyIfAttending !== false ? true : undefined,
    });
  }
  if (!questions.length) return { ok: false, error: "질문을 하나 이상 추가해 주세요." };
  // 참석 질문은 항상 맨 앞, onlyIfAttending은 참석 질문이 있을 때만 의미 있음
  questions.sort((a, b) => Number(b.kind === "attendance") - Number(a.kind === "attendance"));
  questions.forEach((q, i) => {
    q.id = `q${i + 1}`;
    if (!hasAttendance || q.kind === "attendance") delete q.onlyIfAttending;
  });

  return {
    ok: true,
    data: {
      team,
      title,
      note: str(b.note, LIMITS.note) || undefined,
      template,
      eventAt: isoOrUndef(b.eventAt),
      deadline: isoOrUndef(b.deadline),
      pin,
      questions,
    },
  };
}

/** 참석 질문 응답에 따라 실제로 물어볼 질문 목록 */
export function visibleQuestions(questions: Question[], answers: Record<string, Answer>) {
  const att = questions.find((q) => q.kind === "attendance");
  const notAttending = att && answers[att.id] === ATTEND.no;
  return questions.filter((q) => !(notAttending && q.onlyIfAttending));
}

export function parseAnswers(
  questions: Question[],
  raw: unknown,
): { ok: true; answers: Record<string, Answer> } | { ok: false; error: string } {
  const input = (raw ?? {}) as Record<string, unknown>;
  const answers: Record<string, Answer> = {};
  for (const q of questions) {
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
  for (const q of visibleQuestions(questions, answers)) {
    if (q.required && answers[q.id] === undefined) return { ok: false, error: `'${q.title}'에 답해 주세요.` };
  }
  // 보이지 않는 질문 응답 제거
  const vis = new Set(visibleQuestions(questions, answers).map((q) => q.id));
  for (const k of Object.keys(answers)) if (!vis.has(k)) delete answers[k];
  return { ok: true, answers };
}
