import type { PlaceSnap, Region } from "./places";

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
  /** 질문 주제: 식당 투표 / 메뉴 선택 (단계 표시용) */
  topic?: "place" | "menu";
  /** 메뉴 선택지 → 소속 식당 (식당·메뉴를 한 번에 받을 때, 고른 식당의 메뉴만 보여주기 위함) */
  optionGroups?: Record<string, string>;
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
  /** 사업장 (울산/당진) */
  region?: Region;
  /** 식당 정보 스냅샷: 선택지(식당 이름) 또는 place → 상세 */
  placeInfo?: Record<string, PlaceSnap>;
  /** 식당 확정 후 메뉴를 받을 예정 (단계 표시용) */
  menuLater?: boolean;
  /** 식당 투표 마감 시각에 1위 식당으로 메뉴 투표가 자동 시작됨 */
  autoMenu?: boolean;
  /** 마감 때 자동 전환을 시도했지만 못 함(동점 등): 다시 시도하지 않음 */
  autoTried?: boolean;
  /** 관리자 PIN (어느 기기에서든 관리자 모드 전환) */
  adminPinSalt?: string;
  adminPinHash?: string;
}

export type StageState = "done" | "current" | "todo";
export interface Stage {
  label: string;
  state: StageState;
  /** 확정된 값 등 상세 (PIN 인증 후에만 채워짐) */
  detail?: string;
}

export type Answer = string | string[];

export interface PollResponse {
  name: string;
  answers: Record<string, Answer>;
  updatedAt: number;
  /** 서버 전용: 응답한 기기의 소유 토큰 해시 (클라이언트로 내보내지 않음) */
  ownerHash?: string;
  /** 클라이언트용: 이 기기가 작성한 응답인지 / 다른 기기가 작성해 잠긴 응답인지 */
  own?: boolean;
  locked?: boolean;
  /** 관리자가 대신 입력한 응답 */
  proxy?: boolean;
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
  region: Region;
  /** 현재 단계 한 줄 요약 (예: "메뉴 선택 중") */
  stageLabel: string;
  stages: Stage[];
}

/** PIN 인증 후 볼 수 있는 정보 */
export interface PollDetail extends PollSummary {
  /** 관리자 PIN이 설정된 투표인지 */
  hasAdminPin: boolean;
  note?: string;
  place?: string;
  roster?: string[];
  decisions: Record<string, string>;
  placeInfo: Record<string, PlaceSnap>;
  questions: Question[];
  responses: PollResponse[];
  menuLater?: boolean;
  autoMenu?: boolean;
}

export const ATTEND = { yes: "참석", maybe: "미정", no: "불참" } as const;
export const ATTEND_OPTIONS = [ATTEND.yes, ATTEND.maybe, ATTEND.no];

/** 재사용 가능한 참석자 명단. 제목만 공개, 이름은 PIN 인증 후 */
export interface RosterList {
  id: string;
  region: Region;
  title: string;
  names: string[];
  pinSalt: string;
  pinHash: string;
  createdAt: number;
  updatedAt: number;
}

export interface RosterSummary {
  id: string;
  region: Region;
  title: string;
  updatedAt: number;
}
