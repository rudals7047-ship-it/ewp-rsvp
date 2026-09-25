export type QuestionKind = "attendance" | "single" | "multi" | "text";

export interface Question {
  id: string;
  kind: QuestionKind;
  title: string;
  options: string[];
  required: boolean;
  /** true면 '불참' 응답자에게는 묻지 않음 */
  onlyIfAttending?: boolean;
  /** 몇 차 투표에서 추가된 질문인지 (기본 1) */
  round?: number;
}

export type Template = "meal" | "general";

export interface Poll {
  id: string;
  team: string;
  title: string;
  note?: string;
  template: Template;
  eventAt?: string; // ISO
  deadline?: string; // ISO
  createdAt: number;
  closed: boolean;
  pinSalt: string;
  pinHash: string;
  adminHash: string;
  questions: Question[];
  /** 현재 차수. 관리자가 2차 질문(예: 식당 확정 후 메뉴)을 열면 증가 */
  round?: number;
  /** 확정된 결과: questionId → 선택지 */
  decisions?: Record<string, string>;
  /** 참여 대상 명단 (선택) */
  roster?: string[];
  /** 이미 정해진 장소 (선택) */
  place?: string;
}

export type Answer = string | string[];

export interface PollResponse {
  name: string;
  answers: Record<string, Answer>;
  updatedAt: number;
}

export type PollStatus = "open" | "closed";

/** PIN 없이도 볼 수 있는 공개 정보 */
export interface PollSummary {
  id: string;
  team: string;
  title: string;
  template: Template;
  eventAt?: string;
  deadline?: string;
  createdAt: number;
  status: PollStatus;
  responseCount: number;
  round: number;
}

/** PIN 인증 후 볼 수 있는 정보 */
export interface PollDetail extends PollSummary {
  note?: string;
  place?: string;
  roster?: string[];
  decisions: Record<string, string>;
  questions: Question[];
  responses: PollResponse[];
}

export const ATTEND = { yes: "참석", maybe: "미정", no: "불참" } as const;
export const ATTEND_OPTIONS = [ATTEND.yes, ATTEND.maybe, ATTEND.no];
