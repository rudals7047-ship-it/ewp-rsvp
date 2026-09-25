"use client";

import { ShieldCheck } from "lucide-react";
import { Sheet, SheetBody, SheetFooter } from "./Sheet";
import { Button } from "./ui";

const ROWS: [string, string][] = [
  ["수집 항목", "응답자 이름(실명 또는 별칭), 투표 응답, 선택 입력한 요청사항. 전화번호·이메일·계정 정보는 받지 않아요."],
  ["열람 범위", "이름과 응답은 해당 투표의 PIN을 아는 사람만 볼 수 있어요. 목록에는 제목·팀명·일시·응답 수만 공개돼요."],
  ["명단 보관함", "제목만 공개되고, 이름은 명단 PIN을 입력해야 불러올 수 있어요. 이 기기(브라우저)에는 명단을 저장하지 않아요."],
  ["보관 기간", "투표와 응답은 모임일(없으면 마감·생성일)로부터 90일 뒤 자동으로 삭제돼요."],
  ["삭제 요청", "투표를 만든 사람이 개별 응답 초기화 또는 투표 전체 삭제를 할 수 있어요."],
  ["보안", "PIN은 원문을 저장하지 않고 암호화(HMAC) 값만 보관해요. 반복 오입력은 자동 차단돼요. 접속 제한용 IP도 해시로만 최대 1시간 보관해요."],
  ["방문 통계", "GoatCounter(쿠키 미사용)로 페이지 조회 수만 집계해요. 이름·응답 내용은 전송되지 않아요."],
  ["이 기기 저장", "편의를 위해 내 이름, 선택한 사업장·팀, 응답 여부 표시만 이 브라우저에 저장돼요."],
];

export function PrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} label="개인정보 안내">
      <SheetBody className="pb-6 pt-4 sm:pt-7">
        <div className="mb-5 flex items-center gap-2.5 pr-10">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-white">
            <ShieldCheck className="size-5" />
          </span>
          <h2 className="text-[20px] font-bold tracking-tight">개인정보 안내</h2>
        </div>
        <dl className="divide-y divide-line rounded-2xl border border-line">
          {ROWS.map(([k, v]) => (
            <div key={k} className="px-4 py-3.5">
              <dt className="text-[13px] font-bold">{k}</dt>
              <dd className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">
          투표 제목·팀명에는 실명이나 민감한 내용을 넣지 마세요. 결과 복사 텍스트에는 응답자 이름이 포함되니 공유 범위에 유의해 주세요.
        </p>
      </SheetBody>
      <SheetFooter>
        <Button className="w-full" onClick={onClose}>
          확인
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
