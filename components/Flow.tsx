"use client";

import { Check, Crown, Eye, UserRound } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import type { Stage } from "@/lib/types";
import { cx } from "./ui";

/** 투표 전체 진행 단계 (예: ✓식당 투표 → ●메뉴 선택 → 마감). 얇은 한 줄 */
export function StageBar({ stages, className }: { stages: Stage[]; className?: string }) {
  return (
    <ol aria-label="투표 진행 단계" className={cx("no-scrollbar flex items-center gap-1 overflow-x-auto text-[12px] font-semibold", className)}>
      {stages.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <li aria-hidden className={cx("h-px w-3 shrink-0", s.state === "todo" ? "bg-ink/15" : "bg-ink/40")} />}
          <li
            aria-current={s.state === "current" ? "step" : undefined}
            className={cx(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1",
              s.state === "done" && "px-1.5 text-ink-3",
              s.state === "current" && "bg-ink text-white",
              s.state === "todo" && "border border-dashed border-ink/20 text-ink-3",
            )}
          >
            {s.state === "done" && <Check className="size-3 text-ink-3" strokeWidth={3.2} />}
            {s.state === "current" && <span className="live-dot relative size-1.5 rounded-full bg-[#34d399] text-[#34d399]" />}
            {s.label}
            {s.detail && <span className="max-w-[9rem] truncate font-medium opacity-80">· {s.detail}</span>}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/** 지금 화면이 누구 명의인지 */
export function IdentityBar({
  mode,
  name,
  className,
}: {
  mode: "admin" | "proxy" | "self" | "guest";
  name?: string | null;
  className?: string;
}) {
  const m = {
    admin: { icon: Crown, text: "관리자로 보는 중", cls: "bg-[#fdf5e3] text-[#8a5a12]" },
    proxy: { icon: Crown, text: name ? `관리자 · ${name}님 대신 입력 중` : "관리자 · 대신 입력할 사람 선택", cls: "bg-[#fdf5e3] text-[#8a5a12]" },
    self: { icon: UserRound, text: name ? `${name}님으로 응답 중` : "응답자: 이름 선택 전", cls: "bg-ink/[0.05] text-ink-2" },
    guest: { icon: Eye, text: name ? `${name}님 (아직 응답 전)` : "결과 보는 중 · 아직 응답 전", cls: "bg-ink/[0.05] text-ink-2" },
  }[mode];
  const Icon = m.icon;
  return (
    <p className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold", m.cls, className)}>
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{m.text}</span>
    </p>
  );
}

/** 내 응답 단계 이동줄: 지나간 단계는 탭해서 돌아가 수정 */
export function StepNav({
  steps,
  current,
  reached,
  onJump,
}: {
  steps: { label: string; locked?: boolean; done?: boolean }[];
  current: number;
  reached: number;
  onJump: (i: number) => void;
}) {
  // 현재 단계가 화면 밖(닫기 버튼 뒤)으로 밀리지 않도록 가운데로 스크롤
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = nav.current;
    const el = n?.querySelector<HTMLElement>('[aria-current="step"]');
    if (n && el) n.scrollTo({ left: el.offsetLeft - n.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" }); // 가로로만 이동
  }, [current]);
  return (
    <nav ref={nav} aria-label="응답 단계" className="no-scrollbar relative flex items-center gap-1 overflow-x-auto">
      {steps.map((s, i) => {
        const done = !!s.done;
        const can = !s.locked && i !== current && (i <= reached || done);
        return (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden className={cx("h-px w-2.5 shrink-0", i <= reached ? "bg-ink/40" : "bg-ink/12")} />}
            <button
              type="button"
              disabled={!can}
              onClick={() => onJump(i)}
              aria-current={i === current ? "step" : undefined}
              className={cx(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold transition",
                i === current && "bg-ink text-white",
                i !== current && s.locked && "px-1.5 text-ink-3",
                i !== current && !s.locked && done && "bg-ink/[0.06] text-ink-2 hover:bg-ink/[0.1] active:scale-95",
                i !== current && !s.locked && !done && "text-ink-3",
              )}
            >
              {(s.locked || (done && i !== current)) && <Check className="size-3" strokeWidth={3.2} />}
              {s.label}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
