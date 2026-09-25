"use client";

import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { BarChart3, ChevronDown, Crown, Loader2, PencilLine, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, keys, local, progressTable, relUntil, session, track, vibrate } from "@/lib/client";
import { pendingQuestions } from "@/lib/poll";
import type { Answer, PollDetail, PollSummary } from "@/lib/types";
import { StageBar } from "./Flow";
import { PinPad } from "./PinPad";
import { Results } from "./Results";
import { Sheet, SheetBody, SheetFooter } from "./Sheet";
import { VoteFlow } from "./VoteFlow";
import { Button, cx, toast } from "./ui";

type Phase = "loading" | "pin" | "main" | "done";
type Tab = "respond" | "status" | "results" | "admin";

export function PollSheet({
  summary,
  onClose,
  onUpdated,
  onDeleted,
}: {
  summary: PollSummary | null;
  onClose: () => void;
  onUpdated: (p: PollDetail) => void;
  onDeleted: (id: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [poll, setPoll] = useState<PollDetail | null>(null);
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [myAnswers, setMyAnswers] = useState<Record<string, Answer> | null>(null);
  const [tab, setTab] = useState<Tab>("status");
  // 응답 탭의 명의: 본인 / 관리자 대리(proxy)
  const [proxy, setProxy] = useState<{ name?: string } | null>(null);
  const [proxyWho, setProxyWho] = useState<string | null>(null);
  useEffect(() => setProxyWho(null), [proxy]);
  const [respondKey, setRespondKey] = useState(0);
  const [adminTick, setAdminTick] = useState(0);
  const id = summary?.id;

  const route = useCallback((p: PollDetail) => {
    // 명의는 '이 기기로 직접 낸 응답'만 기준 (다른 투표에서 쓴 이름·대신 입력한 응답과 섞이지 않게)
    const mine = p.responses.find((r) => r.own);
    setMyName(mine?.name ?? null);
    const needs = !mine || pendingQuestions(p, mine.answers).length > 0;
    if (mine && !needs) local.set(`done:${p.id}`, String(p.round));
    // 만든 사람(관리자)은 관리/결과 화면부터: 참여는 하단 버튼으로
    const isAdmin = !!local.get(keys.admin(p.id));
    setPhase("main");
    setTab(p.status === "open" && needs && !isAdmin ? "respond" : "status");
  }, []);

  const accept = useCallback(
    (p: PollDetail) => {
      setPoll(p);
      onUpdated(p);
    },
    [onUpdated],
  );

  // 열릴 때: 저장된 인증 토큰이 있으면 바로 조회, 아니면 PIN 입력
  useEffect(() => {
    if (!id) return;
    setPoll(null);
    setPinMsg(null);
    const hasToken = session.get(keys.access(id)) || local.get(keys.admin(id));
    if (!hasToken) {
      setPhase("pin");
      return;
    }
    setPhase("loading");
    let alive = true;
    api
      .detail(id)
      .then(({ poll }) => {
        if (!alive) return;
        accept(poll);
        route(poll);
      })
      .catch(() => alive && setPhase("pin"));
    return () => {
      alive = false;
    };
  }, [id, accept, route]);

  // 결과 화면에서는 실시간에 가깝게 갱신
  useEffect(() => {
    if (!id || phase !== "main" || tab === "respond") return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api.detail(id).then(({ poll }) => accept(poll)).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [id, phase, tab, accept]);

  const unlock = useCallback(
    async (pin: string) => {
      if (!id) return false;
      try {
        const { token, poll } = await api.unlock(id, pin);
        session.set(keys.access(id), token);
        setPinMsg(null);
        accept(poll);
        track("pin-unlock");
        setTimeout(() => route(poll), 380); // 잠금 해제 애니메이션을 보여준 뒤 이동
        return true;
      } catch (e) {
        if (e instanceof ApiError) {
          const left = e.data.attemptsLeft as number | undefined;
          setPinMsg(e.status === 401 && left !== undefined ? `PIN이 일치하지 않아요 (남은 시도 ${left}회)` : e.message);
        } else setPinMsg("문제가 발생했어요.");
        return false;
      }
    },
    [id, accept, route],
  );

  return (
    <Sheet open={!!summary} onClose={onClose} label={summary?.title ?? "투표"}>
      {phase === "loading" && (
        <div className="flex h-[360px] items-center justify-center">
          <Loader2 className="size-7 animate-spin text-ink-3" />
        </div>
      )}
      {phase === "pin" && summary && (
        <SheetBody className="pb-safe">
          <PinPad
            title="PIN 4자리를 입력하세요"
            subtitle={
              <>
                <b className="font-semibold text-ink-2">{summary.title}</b>
                <br />
                투표 생성자가 공유한 PIN으로 보호되어 있어요
              </>
            }
            message={pinMsg}
            onSubmit={unlock}
          />
        </SheetBody>
      )}
      {phase === "main" && poll && (
        <>
          <PollHeader poll={poll} showStages={tab !== "respond"} />
          {tab === "respond" &&
            (poll.status === "open" || (proxy && isAdminOf(poll)) ? (
              <VoteFlow
                key={`${proxy ? `p-${proxy.name ?? ""}` : "self"}-${respondKey}`}
                poll={poll}
                proxy={proxy ? { initialName: proxy.name } : undefined}
                onWho={proxy ? setProxyWho : undefined}
                onCancel={() => setTab("status")}
                onDone={(p, name, answers) => {
                  accept(p);
                  if (proxy) {
                    toast(`${name}님의 응답을 대신 저장했어요`);
                    track("vote-proxy");
                    setProxy(null);
                    setTab("status");
                    return;
                  }
                  setMyName(name);
                  setMyAnswers(answers);
                  local.set(`done:${p.id}`, String(p.round));
                  track("vote-complete");
                  setPhase("done");
                }}
              />
            ) : (
              <SheetBody className="py-10 text-center text-[14px] text-ink-3">마감된 투표예요. 현황·결과 탭에서 확인하세요.</SheetBody>
            ))}
          {tab !== "respond" && (
            <Results
              key={adminTick}
              poll={poll}
              myName={myName}
              view={tab}
              onGoto={setTab}
              onAdminChange={() => setAdminTick((t) => t + 1)}
              onProxy={(name) => {
                setProxy({ name });
                setTab("respond");
              }}
              onChange={accept}
              onDeleted={() => {
                onDeleted(poll.id);
                onClose();
              }}
            />
          )}
          <Dock
            poll={poll}
            tab={tab}
            myName={myName}
            proxy={tab === "respond" && proxy ? { name: proxyWho ?? proxy.name } : null}
            adminTick={adminTick}
            onTab={(t) => {
              if (t === "respond") setProxy(null);
              setTab(t);
            }}
            onSelf={() => {
              setProxy(null);
              setRespondKey((k) => k + 1);
              setTab("respond");
            }}
            onRelease={async (name) => {
              try {
                const { poll: p } = await api.releaseResponse(poll.id, name);
                accept(p);
                setMyName(null);
                if (local.get(keys.name) === name) local.del(keys.name);
                toast(`'${name}'님 응답을 대신 입력한 것으로 바꿨어요. 이제 이 기기로 본인 응답을 할 수 있어요`);
              } catch (e) {
                toast(e instanceof ApiError ? e.message : "실패했어요");
              }
            }}
            onProxy={() => {
              setProxy({});
              setRespondKey((k) => k + 1);
              setTab("respond");
            }}
          />
        </>
      )}
      {phase === "done" && poll && (
        <Done
          poll={poll}
          name={myName ?? ""}
          answers={myAnswers ?? {}}
          onResults={() => {
            setPhase("main");
            setTab("status");
          }}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

const isAdminOf = (p: PollDetail) => !!local.get(keys.admin(p.id));

/** 상단: 팀·제목 한 줄 + (현황·결과·관리 탭에서) 투표 진행 단계 */
function PollHeader({ poll, showStages }: { poll: PollDetail; showStages: boolean }) {
  return (
    <div className="shrink-0 border-b border-line/70 px-5 pb-2.5 pt-2 sm:pt-5">
      <div className="flex min-w-0 items-center gap-2 pr-10">
        <span className="shrink-0 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{poll.team}</span>
        <h2 className="truncate text-[16px] font-bold tracking-tight">{poll.title}</h2>
      </div>
      {showStages && <StageBar stages={poll.stages} className="mt-2" />}
    </div>
  );
}

/** 하단 고정 바: 지금 누구 명의인지 + 핵심 요약 + 탭 (어느 화면에서든 한 번에 이동) */
function Dock({
  poll,
  tab,
  myName,
  proxy,
  adminTick,
  onTab,
  onSelf,
  onRelease,
  onProxy,
}: {
  poll: PollDetail;
  tab: Tab;
  myName: string | null;
  proxy: { name?: string } | null;
  adminTick: number;
  onTab: (t: Tab) => void;
  onSelf: () => void;
  onRelease: (name: string) => void;
  onProxy: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const isAdmin = adminTick >= 0 && isAdminOf(poll);
  // 메뉴가 열려 있을 때 바깥(빈 곳)을 누르거나 Esc를 누르면 닫힘
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  const { rows, pending } = progressTable(poll);
  const end = poll.deadline ?? poll.eventAt;
  const left = end ? relUntil(end) : null;
  const identity = proxy
    ? `관리자 · ${proxy.name ? `${proxy.name}님` : "대상 선택 중"} 대신 입력`
    : isAdmin
      ? `관리자${myName ? ` · 내 응답 ${myName}` : ""}`
      : myName
        ? `${myName}님`
        : "이름 선택 전";
  const summary = [poll.status === "open" ? poll.stageLabel : "마감", rows.length ? `완료 ${rows.length - pending.length}/${rows.length}` : null, poll.status === "open" && left ? `${left} 남음` : null]
    .filter(Boolean)
    .join(" · ");
  const tabs: { id: Tab; label: string; icon: typeof PencilLine; badge?: number }[] = [
    { id: "respond", label: proxy ? "대신 입력" : "내 응답", icon: PencilLine },
    { id: "status", label: "현황", icon: Users, badge: pending.length || undefined },
    { id: "results", label: "결과", icon: BarChart3 },
    ...(isAdmin || poll.hasAdminPin ? [{ id: "admin" as Tab, label: "관리", icon: Crown }] : []),
  ];
  const Icon = proxy || isAdmin ? Crown : UserRound;
  return (
    <div ref={box} className="pb-safe relative shrink-0 border-t border-line bg-surface px-3 pt-2">
      {menu && (
        <div className="absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
          {proxy && <MenuItem onClick={() => { setMenu(false); onSelf(); }}>내 이름으로 응답하기</MenuItem>}
          {!proxy && (
            <p className="border-b border-line px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
              {myName ? `이 기기는 ${myName}님 명의로 응답해요.` : "이 기기로 처음 응답한 이름으로 고정돼요."} 한 기기에서는 한 사람만 응답할 수 있어요.
            </p>
          )}
          {isAdmin && <MenuItem onClick={() => { setMenu(false); onProxy(); }}>👑 다른 사람 대신 입력·수정</MenuItem>}
          {isAdmin && !proxy && myName && (
            <MenuItem onClick={() => { setMenu(false); onRelease(myName); }}>
              👑 &lsquo;{myName}&rsquo;님 응답은 제가 대신 입력한 거예요 (이 기기 명의 해제)
            </MenuItem>
          )}
          {!isAdmin && poll.hasAdminPin && <MenuItem onClick={() => { setMenu(false); onTab("admin"); }}>👑 관리자 모드로 전환</MenuItem>}
        </div>
      )}
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          className={cx(
            "inline-flex max-w-[60%] items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold",
            proxy || isAdmin ? "bg-[#fdf5e3] text-[#8a5a12]" : "bg-ink/[0.06] text-ink-2",
          )}
        >
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{identity}</span>
          <ChevronDown className={cx("size-3.5 shrink-0 transition", menu && "rotate-180")} />
        </button>
        <span className="min-w-0 flex-1 truncate text-right text-[12px] font-medium text-ink-3">{summary}</span>
      </div>
      <nav aria-label="투표 화면" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const on = tab === t.id;
          const TIcon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => {
                setMenu(false);
                onTab(t.id);
              }}
              className={cx(
                "relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11.5px] font-semibold transition active:scale-95",
                on ? "bg-ink text-white" : "text-ink-3 hover:bg-ink/[0.04]",
              )}
            >
              <TIcon className="size-[18px]" />
              {t.label}
              {t.badge ? (
                <span className={cx("absolute right-2 top-1 rounded-full px-1.5 text-[10.5px] font-bold", on ? "bg-white text-ink" : "bg-[#f5c96a] text-ink")}>
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full border-b border-line/70 px-4 py-3 text-left text-[14px] font-semibold last:border-b-0 hover:bg-ink/[0.03]">
      {children}
    </button>
  );
}

function Done({
  poll,
  name,
  answers,
  onResults,
  onClose,
}: {
  poll: PollDetail;
  name: string;
  answers: Record<string, Answer>;
  onResults: () => void;
  onClose: () => void;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    vibrate(25);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const colors = ["#0f9d76", "#34d399", "#0e1116", "#f5c96a", "#ffffff"];
    confetti({ particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.62 }, colors, zIndex: 200, scalar: 0.9 });
    setTimeout(
      () => confetti({ particleCount: 40, spread: 100, startVelocity: 28, origin: { y: 0.55 }, colors, zIndex: 200, scalar: 0.8 }),
      180,
    );
  }, []);

  const chips = poll.questions.flatMap((q) => {
    const v = answers[q.id];
    if (!v || (Array.isArray(v) && !v.length)) return [];
    return [{ q: q.title, v: Array.isArray(v) ? v.join(", ") : v }];
  });

  return (
    <>
      <SheetBody className="pb-4 pt-8">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 12, stiffness: 220 }}
            className="relative flex size-20 items-center justify-center rounded-full bg-accent shadow-[0_12px_40px_-8px_rgb(15_157_118/0.6)]"
          >
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-accent"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.9, delay: 0.2 }}
            />
            <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, delay: 0.18, ease: "easeOut" }}
              />
            </svg>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6 text-[24px] font-bold tracking-tight"
          >
            응답 완료!
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-1.5 text-[15px] text-ink-3">
            {name}님의 응답이 안전하게 저장됐어요
          </motion.p>
        </div>

        {chips.length > 0 && (
          <motion.dl
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="mt-7 divide-y divide-line rounded-2xl bg-ink/[0.03] px-4"
          >
            {chips.map((c) => (
              <div key={c.q} className="flex gap-3 py-3 text-[14px]">
                <dt className="w-[42%] shrink-0 text-ink-3">{c.q}</dt>
                <dd className="min-w-0 flex-1 text-right font-semibold break-keep">{c.v}</dd>
              </div>
            ))}
          </motion.dl>
        )}
      </SheetBody>
      <SheetFooter className="grid grid-cols-[1fr_1.4fr] gap-2">
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
        <Button onClick={onResults}>현황 보기</Button>
      </SheetFooter>
    </>
  );
}
