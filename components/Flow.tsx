"use client";

import { Check, Crown, Eye, Lock, Megaphone, UserRound } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import type { Stage } from "@/lib/types";
import { josa } from "@/lib/client";
import { cx, toast } from "./ui";

/** 투표 전체 진행 단계 (예: ✓식당 투표 → ●메뉴 선택 → 마감). 얇은 한 줄 */
export function StageBar({ stages, className, onTap }: { stages: Stage[]; className?: string; onTap?: (s: Stage, i: number) => void }) {
  return (
    <ol aria-label="투표 진행 단계" className={cx("no-scrollbar flex items-center gap-1 overflow-x-auto text-[12px] font-semibold", className)}>
      {stages.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <li aria-hidden className={cx("h-px w-3 shrink-0", s.state === "todo" ? "bg-ink/15" : "bg-ink/40")} />}
          <li className="shrink-0">
            <button
              type="button"
              aria-current={s.state === "current" ? "step" : undefined}
              aria-disabled={s.state === "done" || undefined}
              onClick={() => (onTap ? onTap(s, i) : toast(stageText(s, stages, i)))}
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition active:scale-95",
                s.state === "done" && "hatch text-ink-3",
                s.state === "current" && "bg-ink text-white",
                s.state === "todo" && "border border-dashed border-ink/20 text-ink-3",
              )}
            >
              {s.state === "done" && <Lock className="size-3" strokeWidth={2.6} />}
              {s.state === "current" && <span className="live-dot relative size-1.5 rounded-full bg-[#34d399] text-[#34d399]" />}
              {s.label}
              {s.detail && <span className="max-w-[9rem] truncate font-medium opacity-80">· {s.detail}</span>}
            </button>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/** 진행 단계를 눌렀을 때 기본 안내 */
export function stageText(s: Stage, stages: Stage[], i: number) {
  if (s.state === "done") {
    if (s.label === "마감") return "투표가 마감됐어요";
    return s.detail ? `${s.label}: '${s.detail}'${josa(s.detail, "으로")} 확정돼 더 이상 선택할 수 없어요` : `'${s.label}' 단계는 끝나서 더 이상 선택할 수 없어요`;
  }
  if (s.state === "current") return `지금은 '${s.label}' 단계예요`;
  const prev = [...stages.slice(0, i)].reverse().find((x) => x.state !== "done") ?? stages[i - 1];
  return `${s.label}${josa(s.label, "은는")} 앞 단계${prev ? `(${prev.label})` : ""}가 완료되어야 열려요`;
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
  steps: { label: string; locked?: boolean; done?: boolean; note?: string }[];
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
        // 확정된 단계는 눌러도 이동하지 않고 안내만
        const blocker = steps.slice(0, i).find((x) => !x.locked && !x.done) ?? steps[current];
        const tap = s.locked
          ? () => toast(s.note ?? `${s.label}${josa(s.label, "은는")} 확정돼 더 이상 바꿀 수 없어요`)
          : can
            ? () => onJump(i)
            : () => toast(`'${blocker?.label ?? "앞"}' 단계를 먼저 마쳐야 '${s.label}' 단계로 넘어갈 수 있어요`);
        return (
          <Fragment key={i}>
            {i > 0 && <span aria-hidden className={cx("h-px w-2.5 shrink-0", i <= reached ? "bg-ink/40" : "bg-ink/12")} />}
            <button
              type="button"
              disabled={i === current}
              aria-disabled={s.locked || !can || undefined}
              onClick={tap}
              aria-current={i === current ? "step" : undefined}
              className={cx(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold transition",
                i === current && "bg-ink text-white",
                i !== current && s.locked && "hatch text-ink-3 active:scale-95",
                i !== current && !s.locked && done && "bg-ink/[0.06] text-ink-2 hover:bg-ink/[0.1] active:scale-95",
                i !== current && !s.locked && !done && "text-ink-3",
              )}
            >
              {s.locked ? <Lock className="size-3" strokeWidth={2.6} /> : done && i !== current && <Check className="size-3" strokeWidth={3.2} />}
              {s.label}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** 만든 사람이 남긴 안내 메모: 눈에 띄게 */
export function NoteCard({ note, className }: { note: string; className?: string }) {
  return (
    <div className={cx("flex gap-2.5 rounded-2xl border border-[#f0d9a8] bg-[#fdf5e3] px-4 py-3", className)}>
      <Megaphone className="mt-0.5 size-4 shrink-0 text-[#b7791f]" />
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-[#8a5a12]">만든 사람의 안내</p>
        <p className="mt-0.5 whitespace-pre-line break-keep text-[14px] font-medium leading-relaxed text-ink">{note}</p>
      </div>
    </div>
  );
}
