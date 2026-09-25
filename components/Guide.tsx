"use client";

import { BookOpen, ChevronRight, KeyRound, ShieldCheck, Users, Vote } from "lucide-react";
import { Sheet, SheetBody, SheetFooter } from "./Sheet";
import { Button } from "./ui";

type Section = { icon: React.ReactNode; title: string; rows: [string, string][] };

const SECTIONS: Section[] = [
  {
    icon: <Vote className="size-4" />,
    title: "이렇게 써요",
    rows: [
      ["1. 투표 만들기", "'새 투표 만들기' → 식사 모임 또는 일반 투표를 고르고 팀·일시·식당 후보·PIN을 정해요."],
      ["2. 공유하기", "만든 뒤 나오는 링크와 참여 PIN을 단톡방에 함께 보내 주세요."],
      ["3. 응답하기", "카드를 눌러 PIN 입력 → 이름 → 참석 → 식당 → 메뉴 → 요청사항 순서로 답해요. 같은 기기에서 다시 열면 수정할 수 있어요."],
      ["4. 메뉴 받기", "식당 투표가 끝나면 확정된 식당의 메뉴로 2차 투표가 열려요. 마감 시각이 되면 자동으로 시작되고, 관리자가 먼저 열 수도 있어요."],
      ["5. 결과 공유", "현황 화면에서 인원·득표·주문 집계를 보고 '결과 복사'로 메신저에 붙여넣을 수 있어요."],
    ],
  },
  {
    icon: <KeyRound className="size-4" />,
    title: "PIN과 권한",
    rows: [
      ["참여 PIN", "투표를 열 때마다 입력해요. PIN을 아는 사람만 질문과 결과를 볼 수 있어요."],
      ["관리자 PIN", "만든 사람용 PIN이에요. 다른 기기에서도 이 PIN으로 마감·수정·삭제·대신 입력을 할 수 있어요."],
      ["한 기기 한 사람", "한 기기에서는 한 사람만 응답해요. 다른 사람 응답은 관리자가 '대신 입력'으로 넣어 주세요."],
    ],
  },
  {
    icon: <Users className="size-4" />,
    title: "사업장과 팀",
    rows: [
      ["사업장", "상단에서 울산 / 당진을 고르면 그 사업장의 투표·팀·식당만 보여요."],
      ["팀 목록", "한국동서발전 홈페이지 조직도의 부서명을 미리 넣어 두었어요. 목록에 없는 팀은 직접 입력하면 돼요."],
      ["식당 목록", "자주 가는 식당과 메뉴·가격을 미리 넣어 두었어요. 틀린 정보는 식당을 고를 때 '편집'으로 고칠 수 있어요."],
    ],
  },
  {
    icon: <ShieldCheck className="size-4" />,
    title: "개인정보",
    rows: [
      ["수집 항목", "응답자 이름(실명 또는 별칭), 투표 응답, 선택 입력한 요청사항. 전화번호·이메일·계정 정보는 받지 않아요."],
      ["열람 범위", "이름과 응답은 해당 투표의 PIN을 아는 사람만 볼 수 있어요. 목록에는 제목·팀명·일시·응답 수만 공개돼요."],
      ["명단 보관함", "제목만 공개되고, 이름은 명단 PIN을 입력해야 불러올 수 있어요. 이 기기(브라우저)에는 명단을 저장하지 않아요."],
      ["보관", "투표와 응답은 삭제하기 전까지 계속 보관돼요. 지난 모임 기록도 목록에서 다시 볼 수 있어요."],
      ["삭제 요청", "투표를 만든 사람이 개별 응답 초기화 또는 투표 전체 삭제를 할 수 있어요."],
      ["보안", "PIN은 원문을 저장하지 않고 암호화(HMAC) 값만 보관해요. 반복 오입력은 자동 차단돼요. 접속 제한용 IP도 해시로만 최대 1시간 보관해요."],
      ["방문 통계", "GoatCounter(쿠키 미사용)로 페이지 조회 수만 집계해요. 이름·응답 내용은 전송되지 않아요."],
      ["이 기기 저장", "편의를 위해 내 이름, 선택한 사업장·팀, 응답 여부 표시만 이 브라우저에 저장돼요."],
    ],
  },
];

export function GuideSheet({ open, onClose, onMaster }: { open: boolean; onClose: () => void; onMaster?: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="이용 안내">
      <SheetBody className="pb-6 pt-4 sm:pt-7">
        <div className="mb-5 flex items-center gap-2.5 pr-10">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-white">
            <BookOpen className="size-5" />
          </span>
          <h2 className="text-[20px] font-bold tracking-tight">이용 안내</h2>
        </div>
        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="mb-2 flex items-center gap-1.5 text-[15px] font-bold">
                {s.icon}
                {s.title}
              </h3>
              <dl className="divide-y divide-line rounded-2xl border border-line">
                {s.rows.map(([k, v]) => (
                  <div key={k} className="px-4 py-3.5">
                    <dt className="text-[13px] font-bold">{k}</dt>
                    <dd className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
          투표 제목·팀명에는 실명이나 민감한 내용을 넣지 마세요. 결과 복사 텍스트에는 응답자 이름이 포함되니 공유 범위에 유의해 주세요.
        </p>
        {onMaster && (
          <button
            type="button"
            onClick={onMaster}
            className="mt-6 flex w-full items-center justify-between rounded-2xl border border-line px-4 py-3.5 text-left text-[13.5px] hover:bg-ink/[0.03]"
          >
            <span>
              <b className="block text-[13px]">사이트 관리</b>
              <span className="text-ink-3">사이트 관리자 전용 (관리 키 필요)</span>
            </span>
            <ChevronRight className="size-4 text-ink-3" />
          </button>
        )}
      </SheetBody>
      <SheetFooter>
        <Button className="w-full" onClick={onClose}>
          확인
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
