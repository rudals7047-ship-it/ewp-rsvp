"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  CircleHelp,
  ClipboardCopy,
  Crown,
  Hourglass,
  Lock,
  LockOpen,
  MapPin,
  PencilLine,
  Plus,
  RotateCcw,
  Share2,
  Users,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  ApiError,
  api,
  copyText,
  fmtDate,
  headcount,
  keys,
  local,
  missing,
  progressTable,
  relUntil,
  session,
  pollUrl,
  shareText,
  shareLink,
  summaryText,
  tally,
  track,
} from "@/lib/client";
import { menuLabel } from "@/lib/places";
import { LIMITS, nameKey } from "@/lib/poll";
import type { PollDetail, Question } from "@/lib/types";
import { ATTEND } from "@/lib/types";
import { ChipsInput } from "./ChipsInput";
import { IdentityBar, StageBar } from "./Flow";
import { MenuSuggestions, PlaceInfo } from "./Places";
import { SheetBody, SheetFooter } from "./Sheet";
import { Button, Toggle, cx, flash, inputCls, reveal, toast } from "./ui";

type AdminBody = Parameters<typeof api.admin>[1];

export function Results({
  poll,
  myName,
  onEdit,
  onProxy,
  onChange,
  onDeleted,
}: {
  poll: PollDetail;
  myName: string | null;
  onEdit: () => void;
  onProxy: (name?: string) => void;
  onChange: (p: PollDetail) => void;
  onDeleted: () => void;
}) {
  const [adminTick, setAdminTick] = useState(0);
  const isAdmin = adminTick >= 0 && !!local.get(keys.admin(poll.id));
  const open = poll.status === "open";
  const end = poll.deadline ?? poll.eventAt;
  const left = end ? relUntil(end) : null;
  const mine = myName ? poll.responses.find((r) => nameKey(r.name) === nameKey(myName)) : undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hc = headcount(poll);
  const miss = missing(poll);
  const prog = progressTable(poll);
  const decidedList = poll.questions.filter((q) => poll.decisions[q.id]);
  const hasOpenChoice = poll.questions.some((q) => (q.kind === "single" || q.kind === "multi") && !poll.decisions[q.id]);

  async function admin(body: AdminBody, done: string) {
    setBusy(JSON.stringify(body));
    try {
      const { poll: p } = await api.admin(poll.id, body);
      onChange(p);
      toast(done);
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "실패했어요");
      return false;
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
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <IdentityBar mode={isAdmin ? "admin" : mine ? "self" : "guest"} name={isAdmin ? null : (mine?.name ?? myName)} />
            <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-[12px] font-semibold text-ink-2">{poll.team}</span>
            {open && left && <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-[12px] font-semibold text-ink-3">마감까지 {left}</span>}
          </div>
          <h2 className="text-[22px] font-bold leading-snug tracking-tight">{poll.title}</h2>
          {poll.eventAt && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-ink-3">
              <CalendarDays className="size-4" />
              {fmtDate(poll.eventAt)}
            </p>
          )}
          {poll.note && <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{poll.note}</p>}
          <StageBar stages={poll.stages} className="mt-3" />
        </div>

        {/* 관리자 빠른 작업 */}
        {isAdmin && (
          <div className="mb-5 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="md" onClick={() => onProxy()}>
              <PencilLine className="size-4" /> 대신 입력·수정
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => reveal(document.getElementById("admin-menu"))}
            >
              <Crown className="size-4 text-[#c79a3a]" /> 관리자 메뉴
            </Button>
          </div>
        )}

        {/* 확정 정보 */}
        {(poll.place || decidedList.length > 0) && (
          <div className="mb-5 space-y-2">
            {poll.place &&
              (poll.placeInfo[poll.place] ? (
                <PlaceInfo p={poll.placeInfo[poll.place]} region={poll.region} label="📍 장소" dark />
              ) : (
                <Decided icon={MapPin} label="장소" value={poll.place} />
              ))}
            {decidedList.map((q) =>
              poll.placeInfo[poll.decisions[q.id]] ? (
                <PlaceInfo key={q.id} p={poll.placeInfo[poll.decisions[q.id]]} region={poll.region} label="✓ 확정된 식당" dark />
              ) : (
                <Decided key={q.id} icon={BadgeCheck} label={`${q.title} · 확정`} value={poll.decisions[q.id]} />
              ),
            )}
          </div>
        )}

        {/* 응답 현황 요약 */}
        {(hc || miss) && (
          <div className="mb-7 grid grid-cols-2 gap-2">
            {hc && (
              <Stat
                label="예약 인원"
                value={`${hc.yes}명`}
                sub={hc.maybe ? `미정 포함 최대 ${hc.yes + hc.maybe}명` : hc.no ? `불참 ${hc.no}명` : "확정 참석 기준"}
                tone="accent"
              />
            )}
            {miss ? (
              <Stat
                label="응답 완료"
                value={`${prog.rows.length - prog.pending.length}/${prog.rows.length}`}
                sub={prog.pending.length ? `남은 사람 ${prog.pending.length}명` : "전원 응답 완료 🎉"}
              />
            ) : (
              <Stat label="응답 완료" value={`${prog.rows.length - prog.pending.length}명`} sub={prog.pending.length ? `마무리 전 ${prog.pending.length}명` : "명단 미지정"} />
            )}
          </div>
        )}

        <ProgressTable poll={poll} isAdmin={isAdmin} onProxy={onProxy} />

        {poll.responses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line py-10 text-center text-[14px] text-ink-3">
            아직 응답이 없어요. 첫 번째로 참여해 보세요!
          </div>
        ) : (
          <div className="space-y-8">
            {poll.questions.map((q) =>
              q.kind === "attendance" ? (
                <Attendance key={q.id} poll={poll} q={q} />
              ) : q.kind === "text" ? (
                <Texts key={q.id} poll={poll} q={q} />
              ) : (
                <Bars
                  key={q.id}
                  poll={poll}
                  q={q}
                  isAdmin={isAdmin}
                  busy={busy !== null}
                  onDecide={(option) =>
                    admin({ action: "decide", questionId: q.id, option }, option ? `'${option}'(으)로 확정했어요` : "확정을 취소했어요")
                  }
                />
              ),
            )}
          </div>
        )}

        {/* 확정 후 다음 차수 질문 열기 */}
        {isAdmin && (poll.template !== "meal" || (decidedList.length > 0 && !poll.questions.some((q) => q.topic === "menu"))) && (
          <NextRound
            key={Object.values(poll.decisions).join()}
            poll={poll}
            highlight={decidedList.length > 0 && !hasOpenChoice}
            onSubmit={(question) => admin({ action: "addQuestion", question }, `${poll.round + 1}차 투표를 시작했어요`)}
          />
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
              // 개인정보: 공유 메시지에는 미응답자 실명 대신 인원수만
              const r = await shareLink(
                pollUrl(poll.id),
                poll.title,
                `${shareText(poll)}${prog.pending.length ? `\n🙋 아직 ${prog.pending.length}명이 응답을 마치지 않았어요` : ""}\n🔒 참여 PIN은 담당자에게 확인하세요`,
              );
              if (r === "copied") toast("링크를 복사했어요");
            }}
          >
            <Share2 className="size-4" /> {prog.pending.length ? "응답 요청" : "링크 공유"}
          </Button>
        </div>

        {isAdmin && (
          <div id="admin-menu" className="mt-6 rounded-2xl border border-line p-4">
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
              <>
              <Button variant="secondary" size="md" className="mb-3 w-full" onClick={() => onProxy()}>
                <PencilLine className="size-4" /> 다른 사람 응답 대신 입력·수정
              </Button>
              {poll.responses.length > 0 && <ResponseManager poll={poll} onChange={onChange} />}
              <div className="grid grid-cols-2 gap-2">
                {open ? (
                  <Button variant="secondary" size="md" disabled={busy !== null} onClick={() => admin({ action: "close" }, "투표를 마감했어요")}>
                    <Lock className="size-4" /> 지금 마감
                  </Button>
                ) : (
                  <Button variant="secondary" size="md" disabled={busy !== null} onClick={() => admin({ action: "reopen" }, "투표를 다시 열었어요")}>
                    <RotateCcw className="size-4" /> 다시 열기
                  </Button>
                )}
                <Button variant="danger" size="md" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> 삭제
                </Button>
              </div>
              </>
            )}
          </div>
        )}
        {!isAdmin && <AdminLogin poll={poll} onDone={(p) => { onChange(p); setAdminTick((t) => t + 1); }} />}
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

/** 관리자: 잘못된 응답·장난 응답 초기화 (두 번 탭해서 확인) */
/** 다른 기기(카톡 내 브라우저 등)에서도 관리자 PIN으로 관리자 모드 전환 */
function AdminLogin({ poll, onDone }: { poll: PollDetail; onDone: (p: PollDetail) => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  if (!poll.hasAdminPin) return null;
  async function submit() {
    setBusy(true);
    try {
      const r = await api.adminLogin(poll.id, pin);
      local.set(keys.admin(poll.id), r.adminToken);
      session.set(keys.access(poll.id), r.token);
      toast("관리자 모드로 전환했어요");
      onDone(r.poll);
    } catch (e) {
      toast(e instanceof ApiError ? (e.data.attemptsLeft !== undefined ? `관리자 PIN이 달라요 (남은 시도 ${e.data.attemptsLeft}회)` : e.message) : "실패했어요");
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 text-center">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 underline underline-offset-4">
          <Crown className="size-3.5" /> 투표를 만든 분인가요? 관리자 모드로 전환
        </button>
      ) : (
        <div className="rounded-2xl border border-line p-3 text-left">
          <p className="mb-2 text-[12.5px] text-ink-3">만들 때 정한 관리자 PIN 4자리를 입력하세요.</p>
          <div className="flex gap-2">
            <input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoFocus
              maxLength={4}
              aria-label="관리자 PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && submit()}
              placeholder="PIN"
              className="h-11 w-[92px] shrink-0 rounded-xl bg-ink/[0.04] px-3 text-center text-[18px] font-bold tracking-[0.4em] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:tracking-normal focus:bg-ink/[0.06]"
            />
            <Button size="md" className="flex-1" loading={busy} onClick={() => (pin.length === 4 ? submit() : flash("admin-pin", "관리자 PIN 4자리를 입력해 주세요"))}>
              관리자 모드로 전환
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResponseManager({ poll, onChange }: { poll: PollDetail; onChange: (p: PollDetail) => void }) {
  const [armed, setArmed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mb-3 text-[13px] font-semibold text-ink-2 underline underline-offset-4">
        응답 관리 (잘못된 응답 초기화)
      </button>
    );
  }
  return (
    <div className="mb-3">
      <p className="mb-2 text-[12.5px] text-ink-3">초기화할 이름을 두 번 탭하세요. 본인은 다시 응답할 수 있어요.</p>
      <div className="flex flex-wrap gap-1.5">
        {poll.responses.map((r) => (
          <button
            key={r.name}
            type="button"
            onClick={async () => {
              if (armed !== r.name) return setArmed(r.name);
              try {
                const { poll: p } = await api.removeResponse(poll.id, r.name);
                onChange(p);
                toast(`${r.name}님의 응답을 초기화했어요`);
              } catch (e) {
                toast(e instanceof ApiError ? e.message : "실패했어요");
              }
              setArmed(null);
            }}
            className={cx(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition",
              armed === r.name ? "bg-danger text-white" : "bg-ink/[0.05] text-ink-2",
            )}
          >
            {r.name} <X className="size-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** 사람별 응답 현황: 누가 어디까지 했는지 (1차·2차 구분) */
function ProgressTable({ poll, isAdmin, onProxy }: { poll: PollDetail; isAdmin: boolean; onProxy: (name?: string) => void }) {
  const { cols, rows, pending } = progressTable(poll);
  if (!rows.length) return null;
  const multiRound = cols.some((c) => c.round > 1);
  const grid = { gridTemplateColumns: `minmax(4.5rem,1.1fr) repeat(${cols.length}, minmax(3.2rem,1fr))` };
  return (
    <section className="mb-8">
      <SectionTitle right={pending.length ? `마무리 전 ${pending.length}명` : "모두 완료"}>
        <Users className="mr-1 inline size-4 -translate-y-px text-ink-3" />
        사람별 응답 현황
      </SectionTitle>
      {pending.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {pending.map((r) => {
            const label = r.todo.includes("전체") ? "미응답" : `${r.todo.join("·")} 남음`;
            const chip = (
              <>
                <b className="font-semibold">{r.name}</b>
                <span className="text-[11.5px] opacity-80">{label}</span>
                {isAdmin && <PencilLine className="size-3" />}
              </>
            );
            return isAdmin ? (
              <button
                key={r.name}
                type="button"
                onClick={() => onProxy(r.name)}
                className="inline-flex items-center gap-1 rounded-full bg-[#fdf5e3] px-2.5 py-1 text-[12.5px] text-[#8a5a12] active:scale-95"
              >
                {chip}
              </button>
            ) : (
              <span key={r.name} className="inline-flex items-center gap-1 rounded-full bg-[#fdf5e3] px-2.5 py-1 text-[12.5px] text-[#8a5a12]">
                {chip}
              </span>
            );
          })}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line">
        <div className="min-w-full text-[12.5px]" role="table" aria-label="사람별 응답 현황">
          <div role="row" className="grid items-center gap-2 border-b border-line bg-ink/[0.03] px-3 py-2 font-semibold text-ink-3" style={grid}>
            <span role="columnheader">이름</span>
            {cols.map((c) => (
              <span role="columnheader" key={c.id} className="truncate">
                {c.label}
                {multiRound && <span className="ml-0.5 text-[10.5px] font-medium opacity-70">{c.round}차</span>}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div
              role="row"
              key={r.name}
              className={cx("grid items-center gap-2 border-b border-line/70 px-3 py-2 last:border-b-0", r.todo.length > 0 && "bg-[#fffaf0]")}
              style={grid}
            >
              <span role="cell" className="min-w-0 truncate font-semibold text-ink">
                {r.name}
                {r.proxy && <span className="ml-1 text-[10.5px] font-medium text-ink-3">대리</span>}
                {r.offRoster && <span className="ml-1 text-[10.5px] font-medium text-[#9a6412]">명단 외</span>}
              </span>
              {r.cells.map((c, i) => (
                <span role="cell" key={i} className="min-w-0 truncate">
                  {c.state === "done" ? (
                    <span className="text-ink-2">{c.text}</span>
                  ) : c.state === "todo" ? (
                    <span className="rounded-md bg-[#fdf5e3] px-1.5 py-0.5 text-[11.5px] font-semibold text-[#9a6412]">미응답</span>
                  ) : (
                    <span className="text-ink-3/60">–</span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">– 는 해당 없음(불참이거나 이미 확정된 항목){isAdmin ? " · 노란 이름을 누르면 대신 입력" : ""}</p>
    </section>
  );
}

function Decided({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
        <Icon className="size-[18px] text-[#6ee7b7]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-white/60">{label}</span>
        <span className="block truncate text-[16px] font-bold">{value}</span>
      </span>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "accent" }) {
  return (
    <div className={cx("rounded-2xl px-4 py-3.5", tone === "accent" ? "bg-accent-soft" : "bg-ink/[0.04]")}>
      <span className={cx("block text-[12.5px] font-semibold", tone === "accent" ? "text-accent" : "text-ink-3")}>{label}</span>
      <span className="mt-0.5 block text-[26px] font-bold leading-tight tracking-tight tabular-nums">{value}</span>
      <span className="block truncate text-[12px] text-ink-3">{sub}</span>
    </div>
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
  const proxied = new Set(poll.responses.filter((r) => r.proxy).map((r) => r.name));
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
              {proxied.has(n) && <span className="ml-1 opacity-60">(대리)</span>}
            </span>
          )),
        )}
      </div>
    </section>
  );
}

function Bars({
  poll,
  q,
  isAdmin,
  busy,
  onDecide,
}: {
  poll: PollDetail;
  q: Question;
  isAdmin: boolean;
  busy: boolean;
  onDecide: (option: string | null) => Promise<boolean>;
}) {
  const t = tally(poll, q);
  const decided = poll.decisions[q.id];
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const voters = poll.responses.filter((r) => {
    const v = r.answers[q.id];
    return Array.isArray(v) ? v.length : v;
  }).length;
  const max = Math.max(1, ...t.map((x) => x.count));
  const leader = t[0]?.count ? t[0].option : null;
  // 메뉴는 1등을 뽑는 투표가 아니라 개인별 주문 집계
  const isMenu = q.topic === "menu";

  return (
    <section>
      <SectionTitle right={`${voters}명 응답${q.kind === "multi" ? " · 복수 선택" : ""}${(q.round ?? 1) > 1 ? ` · ${q.round}차` : ""}`}>
        {isMenu ? "메뉴 주문 집계" : q.title}
      </SectionTitle>
      <div className="space-y-2">
        {t.map((x, i) => {
          const isDecided = decided === x.option;
          const top = !isMenu && !decided && x.count > 0 && x.count === t[0].count;
          const strong = isDecided || top;
          const pct = voters ? Math.round((x.count / voters) * 100) : 0;
          const selectable = picking;
          return (
            <button
              type="button"
              key={x.option}
              disabled={!selectable}
              onClick={() => setChoice(x.option)}
              aria-pressed={selectable ? choice === x.option : undefined}
              className={cx(
                "relative block w-full overflow-hidden rounded-2xl border text-left transition",
                selectable && choice === x.option ? "border-accent ring-4 ring-accent/15" : strong ? "border-ink/80" : "border-line",
                decided && !isDecided && "opacity-55",
                selectable && "cursor-pointer",
              )}
            >
              <motion.div
                className={cx("absolute inset-y-0 left-0", strong ? "bg-ink" : "bg-ink/[0.05]")}
                initial={{ width: 0 }}
                animate={{ width: strong ? "100%" : `${(x.count / max) * 100}%` }}
                transition={{ duration: 0.7, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              />
              <div className="relative flex items-center gap-2 px-4 py-3">
                <span className={cx("min-w-0 flex-1 break-keep text-[15px] font-semibold", strong && "text-white")}>
                  {isDecided ? (
                    <BadgeCheck className="mr-1 inline size-4 -translate-y-px text-[#6ee7b7]" />
                  ) : (
                    top && <Crown className="mr-1 inline size-4 -translate-y-px" />
                  )}
                  {x.option}
                  {q.optionGroups?.[x.option] && (
                    <span className={cx("ml-1.5 text-[12px] font-medium", strong ? "text-white/60" : "text-ink-3")}>{q.optionGroups[x.option]}</span>
                  )}
                  {isDecided && <span className="ml-1.5 rounded-md bg-[#6ee7b7]/20 px-1.5 py-px text-[11.5px] font-bold text-[#6ee7b7]">확정</span>}
                </span>
                <span className={cx("shrink-0 text-[14px] font-bold tabular-nums", strong ? "text-white" : "text-ink-2")}>
                  {isMenu ? (
                    `${x.count}명`
                  ) : (
                    <>
                      {x.count}표 <span className="font-medium opacity-70">{pct}%</span>
                    </>
                  )}
                </span>
              </div>
              {x.names.length > 0 && (
                <p className={cx("relative -mt-1.5 px-4 pb-2.5 text-[12px] leading-relaxed", strong ? "text-white/75" : "text-ink-3")}>
                  {x.names.join(", ")}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {isAdmin && !isMenu && (
        <AnimatePresence initial={false} mode="wait">
          {picking ? (
            <motion.div key="pick" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3">
              <p className="mb-2 text-[13px] text-ink-3">확정할 항목을 위에서 선택하세요.</p>
              <div className="grid grid-cols-[1fr_1.6fr] gap-2">
                <Button variant="secondary" size="md" onClick={() => setPicking(false)}>
                  취소
                </Button>
                <Button
                  size="md"
                  disabled={busy}
                  onClick={async () => {
                    if (!choice) return toast("확정할 항목을 위에서 선택해 주세요");
                    if (choice && (await onDecide(choice))) setPicking(false);
                  }}
                >
                  {choice ? `'${choice}' 확정` : "항목 선택"}
                </Button>
              </div>
            </motion.div>
          ) : decided ? (
            <motion.button
              key="undo"
              type="button"
              disabled={busy}
              onClick={() => onDecide(null)}
              className="mt-3 text-[13px] font-semibold text-ink-3 underline underline-offset-4"
            >
              확정 취소
            </motion.button>
          ) : (
            <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3">
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={() => {
                  if (!leader) return toast("아직 투표가 없어요. 응답이 모이면 확정할 수 있어요");
                  setChoice(leader);
                  setPicking(true);
                }}
              >
                <BadgeCheck className="size-4" /> 결과 확정하기
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </section>
  );
}

function NextRound({
  poll,
  highlight,
  onSubmit,
}: {
  poll: PollDetail;
  highlight: boolean;
  onSubmit: (q: { kind: "single" | "multi"; title: string; options: string[] }) => Promise<boolean>;
}) {
  const isMeal = poll.template === "meal";
  const place = poll.place ?? Object.values(poll.decisions)[0];
  const placeMenus = (place && poll.placeInfo[place]?.menus) || [];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(isMeal ? "어떤 메뉴로 하시겠어요?" : "");
  // 확정된 식당의 메뉴를 자동으로 채움 (탭해서 빼기 가능)
  const [options, setOptions] = useState<string[]>(() => placeMenus.slice(0, LIMITS.options).map(menuLabel));
  const [multi, setMulti] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (poll.questions.length >= LIMITS.questions) return null;

  if (!open) {
    return (
      <div className={cx("mt-8 rounded-2xl p-4", highlight ? "bg-ink text-white" : "border border-dashed border-ink/20")}>
        {highlight && (
          <p className="mb-3 text-[14px] leading-relaxed text-white/80">
            <b className="text-white">{place}</b> 확정! 이제 {isMeal ? "이 식당의 메뉴를" : "다음 질문을"} 물어볼까요? 응답했던 사람들의 카드에 &lsquo;{poll.round + 1}차 참여&rsquo;가 표시돼요.
          </p>
        )}
        <Button
          variant={highlight ? "secondary" : "ghost"}
          size="md"
          className={cx("w-full", highlight && "bg-white text-ink hover:bg-white/90")}
          onClick={() => setOpen(true)}
        >
          <Plus className="size-4" /> {isMeal ? "메뉴 투표 열기" : `${poll.round + 1}차 투표 열기 (질문 추가)`}
        </Button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8 rounded-2xl border border-line p-4">
      <p className="mb-3 text-[14px] font-bold">{poll.round + 1}차 투표 질문</p>
      <input
        id="nr-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={LIMITS.questionTitle}
        aria-label="질문"
        aria-invalid={(err && !title.trim()) || undefined}
        placeholder="질문을 입력하세요"
        className={cx(inputCls, "mb-3", err && !title.trim() && "border-danger ring-4 ring-danger/15")}
      />
      <div id="nr-options" className={cx("rounded-2xl", err && title.trim() && options.length === 0 && "-m-2 p-2 ring-2 ring-danger/70")}>
      {placeMenus.length > 0 && (
        <MenuSuggestions
          title={`${place} 메뉴 · 탭해서 빼거나 넣기`}
          menus={placeMenus}
          selected={options}
          onToggle={(l) => setOptions(options.includes(l) ? options.filter((x) => x !== l) : [...options, l].slice(0, LIMITS.options))}
        />
      )}
      <ChipsInput
        values={options.filter((o) => !placeMenus.some((m) => menuLabel(m) === o))}
        onChange={(custom) => setOptions([...options.filter((o) => placeMenus.some((m) => menuLabel(m) === o)), ...custom].slice(0, LIMITS.options))}
        max={LIMITS.options}
        maxLength={LIMITS.option}
        label="선택지"
        placeholder="선택지 추가"
        emptyPlaceholder={isMeal ? `${place ?? "식당"} 메뉴 입력 (쉼표로 여러 개)` : "선택지 입력 (쉼표로 여러 개)"}
      />
      </div>
      {err && <p className="mt-2 text-[12.5px] font-medium text-danger">{err}</p>}
      <div className="mt-3">
        <Toggle checked={multi} onChange={setMulti} label="복수 선택 허용" />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_1.6fr] gap-2">
        <Button variant="secondary" size="md" onClick={() => setOpen(false)}>
          취소
        </Button>
        <Button
          size="md"
          loading={busy}
          onClick={async () => {
            if (!title.trim() || options.length === 0) {
              setErr(!title.trim() ? "질문을 입력해 주세요" : "선택지를 1개 이상 넣어 주세요");
              flash(!title.trim() ? "nr-title" : "nr-options");
              return;
            }
            setErr(null);
            setBusy(true);
            const ok = await onSubmit({ kind: multi ? "multi" : "single", title: title.trim(), options });
            setBusy(false);
            if (ok) setOpen(false);
          }}
        >
          {poll.round + 1}차 투표 시작
        </Button>
      </div>
    </motion.div>
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
