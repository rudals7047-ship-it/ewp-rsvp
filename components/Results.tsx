"use client";

import { motion } from "motion/react";
import {
  CalendarDays,
  Check,
  CircleHelp,
  ClipboardCopy,
  Crown,
  Lock,
  LockOpen,
  PencilLine,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { ApiError, api, copyText, fmtDate, keys, local, relUntil, shareLink, summaryText, tally, track } from "@/lib/client";
import type { PollDetail, Question } from "@/lib/types";
import { ATTEND } from "@/lib/types";
import { SheetBody, SheetFooter } from "./Sheet";
import { Button, cx, toast } from "./ui";

export function Results({
  poll,
  myName,
  onEdit,
  onChange,
  onDeleted,
}: {
  poll: PollDetail;
  myName: string | null;
  onEdit: () => void;
  onChange: (p: PollDetail) => void;
  onDeleted: () => void;
}) {
  const isAdmin = !!local.get(keys.admin(poll.id));
  const open = poll.status === "open";
  const end = poll.deadline ?? poll.eventAt;
  const left = end ? relUntil(end) : null;
  const mine = myName ? poll.responses.find((r) => r.name === myName) : undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function adminAction(action: "close" | "reopen") {
    setBusy(action);
    try {
      const { poll: p } = await api.admin(poll.id, action);
      onChange(p);
      toast(action === "close" ? "투표를 마감했어요" : "투표를 다시 열었어요");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "실패했어요");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api.remove(poll.id);
      local.del(keys.admin(poll.id));
      toast("투표를 삭제했어요");
      onDeleted();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "실패했어요");
      setBusy(null);
    }
  }

  return (
    <>
      <SheetBody className="pb-6 pt-3 sm:pt-7">
        <div className="mb-5 pr-10">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] font-semibold">
            <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-ink-2">{poll.team}</span>
            {open ? (
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">진행 중{left && ` · ${left} 남음`}</span>
            ) : (
              <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-ink-3">마감됨</span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2.5 py-1 text-ink-3">
              <LockOpen className="size-3" strokeWidth={2.6} /> PIN 인증됨
            </span>
          </div>
          <h2 className="text-[22px] font-bold leading-snug tracking-tight">{poll.title}</h2>
          {poll.eventAt && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-ink-3">
              <CalendarDays className="size-4" />
              {fmtDate(poll.eventAt)}
            </p>
          )}
          {poll.note && <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{poll.note}</p>}
        </div>

        {poll.responses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-10 text-center text-[14px] text-ink-3">
            아직 응답이 없어요. 첫 번째로 참여해 보세요!
          </div>
        ) : (
          <div className="space-y-7">
            {poll.questions.map((q) =>
              q.kind === "attendance" ? (
                <Attendance key={q.id} poll={poll} q={q} />
              ) : q.kind === "text" ? (
                <Texts key={q.id} poll={poll} q={q} />
              ) : (
                <Bars key={q.id} poll={poll} q={q} />
              ),
            )}
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={async () => {
              const ok = await copyText(summaryText(poll));
              toast(ok ? "결과를 복사했어요. 메신저에 붙여넣으세요" : "복사에 실패했어요");
              track("results-copy");
            }}
          >
            <ClipboardCopy className="size-4" /> 결과 복사
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={async () => {
              const r = await shareLink(
                `${location.origin}/p/${poll.id}`,
                poll.title,
                `[${poll.team}] ${poll.title}\n참여 PIN은 담당자에게 확인하세요 🔒`,
              );
              if (r === "copied") toast("링크를 복사했어요");
            }}
          >
            <Share2 className="size-4" /> 링크 공유
          </Button>
        </div>

        {isAdmin && (
          <div className="mt-6 rounded-2xl border border-line p-4">
            <p className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
              <Crown className="size-4 text-[#c79a3a]" /> 관리자 메뉴
            </p>
            {confirmDelete ? (
              <div className="space-y-2">
                <p className="text-[13px] text-ink-2">응답을 포함해 모두 삭제돼요. 되돌릴 수 없어요.</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="md" onClick={() => setConfirmDelete(false)}>
                    취소
                  </Button>
                  <Button variant="danger" size="md" loading={busy === "delete"} onClick={remove}>
                    삭제하기
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {open ? (
                  <Button variant="secondary" size="md" loading={busy === "close"} onClick={() => adminAction("close")}>
                    <Lock className="size-4" /> 지금 마감
                  </Button>
                ) : (
                  <Button variant="secondary" size="md" loading={busy === "reopen"} onClick={() => adminAction("reopen")}>
                    <RotateCcw className="size-4" /> 다시 열기
                  </Button>
                )}
                <Button variant="danger" size="md" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> 삭제
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetBody>

      {open && (
        <SheetFooter>
          <Button className="w-full" onClick={onEdit}>
            {mine ? (
              <>
                <PencilLine className="size-5" /> 내 응답 수정
              </>
            ) : (
              "투표 참여하기"
            )}
          </Button>
        </SheetFooter>
      )}
    </>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-[15px] font-bold tracking-tight">{children}</h3>
      {right && <span className="shrink-0 text-[12px] text-ink-3">{right}</span>}
    </div>
  );
}

const ATT_META: Record<string, { icon: typeof Check; cls: string; chip: string }> = {
  [ATTEND.yes]: { icon: Check, cls: "bg-accent-soft text-accent", chip: "bg-accent-soft text-accent" },
  [ATTEND.maybe]: { icon: CircleHelp, cls: "bg-[#fdf5e3] text-[#b7791f]", chip: "bg-[#fdf5e3] text-[#9a6412]" },
  [ATTEND.no]: { icon: X, cls: "bg-ink/[0.05] text-ink-3", chip: "bg-ink/[0.05] text-ink-3" },
};

function Attendance({ poll, q }: { poll: PollDetail; q: Question }) {
  const t = tally(poll, q);
  return (
    <section>
      <SectionTitle right={`총 ${poll.responses.length}명`}>참석 현황</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {t.map((x) => {
          const m = ATT_META[x.option];
          const Icon = m?.icon ?? Check;
          return (
            <div key={x.option} className={cx("rounded-2xl px-3 py-3.5", m?.cls)}>
              <span className="flex items-center gap-1 text-[12.5px] font-semibold">
                <Icon className="size-3.5" strokeWidth={3} />
                {x.option}
              </span>
              <span className="mt-1 block text-[28px] font-bold leading-none tracking-tight tabular-nums">
                {x.count}
                <span className="ml-0.5 text-[14px] font-semibold">명</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {t.flatMap((x) =>
          x.names.map((n) => (
            <span key={x.option + n} className={cx("rounded-full px-2.5 py-1 text-[12.5px] font-medium", ATT_META[x.option]?.chip)}>
              {n}
            </span>
          )),
        )}
      </div>
    </section>
  );
}

function Bars({ poll, q }: { poll: PollDetail; q: Question }) {
  const t = tally(poll, q);
  const voters = poll.responses.filter((r) => {
    const v = r.answers[q.id];
    return Array.isArray(v) ? v.length : v;
  }).length;
  const max = Math.max(1, ...t.map((x) => x.count));
  return (
    <section>
      <SectionTitle right={`${voters}명 응답${q.kind === "multi" ? " · 복수 선택" : ""}`}>{q.title}</SectionTitle>
      <div className="space-y-2">
        {t.map((x, i) => {
          const top = x.count > 0 && x.count === t[0].count;
          const pct = voters ? Math.round((x.count / voters) * 100) : 0;
          return (
            <div key={x.option} className={cx("relative overflow-hidden rounded-2xl border", top ? "border-ink/80" : "border-line")}>
              <motion.div
                className={cx("absolute inset-y-0 left-0", top ? "bg-ink" : "bg-ink/[0.05]")}
                initial={{ width: 0 }}
                animate={{ width: `${(x.count / max) * 100}%` }}
                transition={{ duration: 0.7, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              />
              <div className="relative flex items-center gap-2 px-4 py-3">
                <span
                  className={cx(
                    "min-w-0 flex-1 text-[15px] font-semibold break-keep",
                    top && "text-white",
                  )}
                >
                  {top && <Crown className="mr-1 inline size-4 -translate-y-px" />}
                  {x.option}
                </span>
                <span className={cx("shrink-0 text-[14px] font-bold tabular-nums", top ? "text-white" : "text-ink-2")}>
                  {x.count}표 <span className="font-medium opacity-70">{pct}%</span>
                </span>
              </div>
              {x.names.length > 0 && (
                <p className={cx("relative px-4 pb-2.5 -mt-1.5 text-[12px] leading-relaxed", top ? "text-white/75" : "text-ink-3")}>
                  {x.names.join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Texts({ poll, q }: { poll: PollDetail; q: Question }) {
  const list = poll.responses.filter((r) => typeof r.answers[q.id] === "string" && r.answers[q.id]);
  if (!list.length) return null;
  return (
    <section>
      <SectionTitle right={`${list.length}건`}>{q.title}</SectionTitle>
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.name} className="rounded-2xl bg-ink/[0.03] px-4 py-3">
            <span className="text-[12.5px] font-semibold text-ink-3">{r.name}</span>
            <p className="mt-0.5 whitespace-pre-line text-[14.5px] leading-relaxed">{r.answers[q.id] as string}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
