"use client";

import { motion } from "motion/react";
import { ArrowUpRight, CalendarDays, Check, Crown, ListChecks, Lock, Users, UtensilsCrossed } from "lucide-react";
import { dday, fmtDate, relUntil } from "@/lib/client";
import type { PollSummary } from "@/lib/types";
import { cx } from "./ui";

export function PollCard({
  poll,
  onOpen,
  doneRound,
  isAdmin,
  showTeam,
  now,
}: {
  poll: PollSummary;
  onOpen: () => void;
  /** 이 기기에서 응답한 차수 (0 = 미응답) */
  doneRound: number;
  isAdmin: boolean;
  showTeam: boolean;
  now: number;
}) {
  const TypeIcon = poll.template === "meal" ? UtensilsCrossed : ListChecks;
  const end = poll.deadline ?? poll.eventAt;
  const left = end ? relUntil(end, now) : null;
  const d = poll.eventAt ? dday(poll.eventAt) : null;
  const responded = doneRound >= poll.round;
  const newRound = doneRound > 0 && !responded;

  if (poll.status === "open") {
    return (
      <motion.button
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.985 }}
        onClick={onOpen}
        className="group relative w-full overflow-hidden rounded-[26px] bg-ink p-5 text-left text-white shadow-lift sm:p-6"
      >
        {/* 은은한 광원 */}
        <span className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-accent/35 blur-3xl transition-opacity duration-500 group-hover:opacity-80" />
        <span className="pointer-events-none absolute -bottom-28 -left-10 size-56 rounded-full bg-[#6c7cff]/15 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <span className="relative inline-flex items-center gap-1.5 rounded-full bg-accent/20 py-1 pl-2 pr-2.5 text-[12px] font-semibold text-[#6ee7b7]">
            <span className="live-dot relative size-1.5 rounded-full bg-[#34d399] text-[#34d399]" />
            진행 중
          </span>
          <span className="shrink-0 rounded-full bg-[#f5c96a]/20 px-2.5 py-1 text-[12px] font-bold text-[#f5c96a]">{poll.stageLabel}</span>
          {showTeam && (
            <span className="truncate rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white/80">
              {poll.team}
            </span>
          )}
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[11px] font-semibold text-white/75">
            <Lock className="size-3" strokeWidth={2.6} />
            PIN 보호
          </span>
        </div>

        <div className="relative mt-5 flex items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <TypeIcon className="size-5 text-white/90" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[20px] font-bold leading-snug tracking-tight sm:text-[22px]">{poll.title}</h3>
            {poll.eventAt && (
              <p className="mt-1 flex items-center gap-1.5 text-[14px] text-white/65">
                <CalendarDays className="size-4" />
                {fmtDate(poll.eventAt)}
                {d && <span className="rounded-md bg-white/10 px-1.5 py-px text-[12px] font-semibold text-white/85">{d}</span>}
              </p>
            )}
          </div>
        </div>

        <div className="relative mt-5 flex items-center gap-3 border-t border-white/10 pt-4 text-[13px]">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-white/70">
            <Users className="size-4 shrink-0" />
            <span>
              응답 <b className="font-semibold text-white">{poll.responseCount}</b>명
            </span>
            {left && <span className="truncate text-white/50">· {left} 남음</span>}
          </span>
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            {isAdmin && <Crown className="size-4 text-[#f5c96a]" aria-label="내가 만든 투표" />}
            {newRound ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#f5c96a] px-3.5 py-1.5 text-[13px] font-bold text-ink">
                {poll.round}차 참여 <ArrowUpRight className="size-4" strokeWidth={2.6} />
              </span>
            ) : responded ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-semibold">
                <Check className="size-3.5" strokeWidth={3} /> 응답함
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold text-ink transition group-hover:gap-1.5">
                참여하기 <ArrowUpRight className="size-4" strokeWidth={2.6} />
              </span>
            )}
          </span>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileTap={{ scale: 0.99 }}
      onClick={onOpen}
      className="flex w-full items-center gap-3.5 rounded-[20px] border border-line bg-surface/70 px-4 py-3.5 text-left transition hover:bg-surface"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink/[0.04] text-ink-3">
        <TypeIcon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold text-ink-2">{poll.title}</span>
          {isAdmin && <Crown className="size-3.5 shrink-0 text-[#c79a3a]" aria-label="내가 만든 투표" />}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
          {showTeam && `${poll.team} · `}
          {poll.eventAt ? fmtDate(poll.eventAt, false) : fmtDate(new Date(poll.createdAt).toISOString(), false)} · {poll.responseCount}명 응답
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11.5px] font-semibold text-ink-3">마감</span>
        <Lock className={cx("size-3.5 text-ink-3/70")} aria-label="PIN 보호" />
      </span>
    </motion.button>
  );
}

export function CardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-[196px] rounded-[26px]" />
      <div className="skeleton h-[68px] rounded-[20px]" />
      <div className="skeleton h-[68px] rounded-[20px]" />
    </div>
  );
}
