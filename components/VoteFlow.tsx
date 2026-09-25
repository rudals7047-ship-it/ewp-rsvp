"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, CircleHelp, Lock, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, josa, keys, local, openExternal, vibrate } from "@/lib/client";
import { menuLabel, naverUrl } from "@/lib/places";
import { allowedOptions, nameKey, pendingQuestions, visibleQuestions } from "@/lib/poll";
import type { Answer, PollDetail, Question } from "@/lib/types";
import { ATTEND } from "@/lib/types";
import { IdentityBar, StepNav } from "./Flow";
import { PlaceInfo } from "./Places";
import { SheetBody, SheetFooter } from "./Sheet";
import { Button, IconButton, cx, flash, inputCls, textareaCls, toast } from "./ui";

type Step = { key: "name" } | { key: "q"; q: Question };

const inRoster = (roster: string[] | undefined, n: string) => !!roster?.some((r) => nameKey(r) === nameKey(n));

export function VoteFlow({
  poll,
  onDone,
  onCancel,
  proxy,
  onWho,
}: {
  poll: PollDetail;
  onDone: (poll: PollDetail, name: string, answers: Record<string, Answer>) => void;
  onCancel: () => void;
  /** 관리자 대리 입력 모드 (initialName: 미리 선택할 이름) */
  proxy?: { initialName?: string };
  /** 이름 단계를 지나 입력 대상이 정해지면 알림 (하단 바 명의 표시용) */
  onWho?: (name: string) => void;
}) {
  // 기억된 이름은 명단이 있으면 명단에 있을 때만 미리 선택 (다른 투표의 이름이 끼어들지 않게)
  const remembered = poll.responses.find((r) => r.own)?.name ?? local.get(keys.name) ?? "";
  const savedName = proxy
    ? (proxy.initialName ?? "")
    : poll.roster?.length && !inRoster(poll.roster, remembered) && !poll.responses.some((r) => r.own)
      ? ""
      : remembered;
  const existing = (n: string) => poll.responses.find((r) => nameKey(r.name) === nameKey(n));
  const [name, setName] = useState(savedName);
  const [typing, setTyping] = useState(() => !poll.roster?.length || (!!savedName && !inRoster(poll.roster, savedName)));
  const offRoster = !!poll.roster?.length && typing && !!name.trim() && !inRoster(poll.roster, name);
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => existing(savedName)?.answers ?? {});
  // 이미 응답한 사람이 2차 질문 때문에 다시 들어오면 새 질문으로 바로 이동
  const [idx, setIdx] = useState(() => {
    if (proxy) return 0;
    const ex = existing(savedName);
    if (!ex) return 0;
    const pending = pendingQuestions(poll, ex.answers)[0];
    if (!pending) return 0;
    return visibleQuestions(poll, ex.answers).findIndex((q) => q.id === pending.id) + 1;
  });
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const advancing = useRef(false);

  const steps: Step[] = useMemo(
    () => [{ key: "name" }, ...visibleQuestions(poll, answers).map((q) => ({ key: "q" as const, q }))],
    [poll, answers],
  );
  const step = steps[Math.min(idx, steps.length - 1)];
  const isLast = idx >= steps.length - 1;
  // 가장 멀리 진행한 단계 (기존 응답이 있으면 전체 단계를 이미 지난 것으로 봄)
  const [reached, setReached] = useState(() => (existing(savedName) ? 99 : 0));
  useEffect(() => setReached((r) => Math.max(r, idx)), [idx]);
  useEffect(() => {
    if (idx > 0 && name.trim()) onWho?.(name.trim());
  }, [idx, name, onWho]);
  // 단계가 바뀌면 새 화면을 맨 위부터 보여줌 (이전 단계의 스크롤 위치가 남지 않게)
  const top = useRef<HTMLDivElement>(null);
  const stepKey = step.key === "name" ? "name" : step.q.id;
  useEffect(() => {
    top.current?.parentElement?.scrollTo({ top: 0 });
  }, [stepKey]);

  // 단계 이동줄: 확정된 질문(예: 식당)은 잠긴 완료 단계로 함께 표시
  const stepLabel = (q: Question) =>
    q.kind === "attendance" ? "참석" : q.kind === "text" ? "요청사항" : q.topic === "place" ? "식당" : q.topic === "menu" ? "메뉴" : q.title.length > 7 ? `${q.title.slice(0, 6)}…` : q.title;
  const answered = (q: Question) => {
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "";
  };
  const navEntries: { label: string; locked?: boolean; done?: boolean; note?: string; stepIndex: number }[] = [
    { label: "이름", stepIndex: 0, done: !!name.trim() && idx > 0 },
  ];
  for (const q of poll.questions) {
    if (poll.decisions[q.id])
      navEntries.push({
        label: stepLabel(q),
        locked: true,
        note: `${stepLabel(q)}${josa(stepLabel(q), "은는")} '${poll.decisions[q.id]}'${josa(poll.decisions[q.id], "으로")} 확정돼 더 이상 바꿀 수 없어요. 변경은 관리자에게 요청하세요`,
        stepIndex: -1,
      });
    else {
      const si = steps.findIndex((st) => st.key === "q" && st.q.id === q.id);
      if (si > 0) navEntries.push({ label: stepLabel(q), stepIndex: si, done: answered(q) });
    }
  }
  const navItems = navEntries.map(({ label, locked, done, note }) => ({ label, locked, done, note }));
  const navCurrent = navEntries.findIndex((e) => e.stepIndex === Math.min(idx, steps.length - 1));
  const navReached = navEntries.reduce((m, e, i) => (e.stepIndex >= 0 && e.stepIndex <= Math.min(reached, steps.length - 1) ? i : m), 0);
  function jumpNav(i: number) {
    const target = navEntries[i]?.stepIndex;
    if (target === undefined || target < 0 || target === idx) return;
    if (target > 0 && !name.trim()) return;
    setDir(target > idx ? 1 : -1);
    setIdx(target);
  }

  // 이미 정해진/확정된 식당: 질문 대신 안내 카드로 보여줌
  const decidedPlace = poll.questions.map((q) => poll.decisions[q.id]).find((o) => o && poll.placeInfo[o]);
  const placeKey = (poll.place && poll.placeInfo[poll.place] ? poll.place : undefined) ?? decidedPlace;
  const placeCard = placeKey ? poll.placeInfo[placeKey] : undefined;
  // 확정된 결과(예: 식당) 안내 문구
  const context = [
    poll.place && `📍 ${poll.place}`,
    ...poll.questions.filter((q) => poll.decisions[q.id]).map((q) => `✓ ${poll.decisions[q.id]} 확정`),
  ].filter(Boolean) as string[];

  function chooseName(n: string) {
    setName(n);
    const ex = existing(n);
    setAnswers(ex ? ex.answers : {});
  }

  async function submit(final: Record<string, Answer>) {
    setBusy(true);
    try {
      const trimmed = name.trim();
      const { poll: updated } = await api.respond(poll.id, trimmed, final, !!proxy);
      if (!proxy) local.set(keys.name, trimmed);
      onDone(updated, trimmed, final);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  function next(nextAnswers = answers) {
    const vis = [{ key: "name" }, ...visibleQuestions(poll, nextAnswers)];
    if (idx >= vis.length - 1) return submit(nextAnswers);
    setDir(1);
    setIdx((i) => i + 1);
  }

  function back() {
    if (idx === 0) return onCancel();
    setDir(-1);
    setIdx((i) => i - 1);
  }

  function pick(q: Question, value: string) {
    if (advancing.current || busy) return;
    vibrate(8);
    if (q.kind === "multi") {
      const cur = (answers[q.id] as string[] | undefined) ?? [];
      const nextVal = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      setAnswers({ ...answers, [q.id]: nextVal });
      return;
    }
    const nextAnswers = { ...answers, [q.id]: value };
    setAnswers(nextAnswers);
    advancing.current = true;
    setTimeout(() => {
      advancing.current = false;
      next(nextAnswers);
    }, 220); // 선택 효과를 보여준 뒤 자동 진행
  }

  const qCount = steps.length - 1;
  const current = step.key === "q" ? step.q : null;
  const multiCount = current?.kind === "multi" ? ((answers[current.id] as string[] | undefined)?.length ?? 0) : 0;
  const textVal = current?.kind === "text" ? ((answers[current.id] as string | undefined) ?? "") : "";
  const prev = step.key === "name" && name.trim() ? existing(name) : undefined;
  const lockedName = !proxy && !!prev?.locked;
  // 한 기기 = 한 사람: 이 기기로 이미 응답했다면 그 이름으로 고정
  const myOwn = proxy ? undefined : poll.responses.find((r) => r.own);

  return (
    <>
      <div className="shrink-0 px-3 pt-2">
        <div className="flex items-center gap-1">
          <IconButton label="이전" onClick={back} className="shrink-0">
            <ChevronLeft className="size-6" />
          </IconButton>
          <StepNav steps={navItems} current={navCurrent} reached={navReached} onJump={jumpNav} />
        </div>
      </div>

      <SheetBody className="pb-6 pt-5">
        <div ref={top} aria-hidden />
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step.key === "name" ? "name" : step.q.id}
            custom={dir}
            initial={{ opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -28 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {step.key === "name" ? (
              <>
                {myOwn ? (
                  <>
                    <StepHead eyebrow={poll.title} title={`${myOwn.name}님, 응답을 이어서 할게요`} sub="이전 응답이 채워져 있어요. 바꿀 부분만 수정하세요." />
                    <div className="flex items-center gap-2 rounded-2xl bg-accent-soft px-4 py-3.5 text-[15px] font-semibold text-accent">
                      <UserRound className="size-5 shrink-0" /> {myOwn.name}
                      <Lock className="ml-auto size-4 shrink-0 opacity-70" strokeWidth={2.6} aria-label="이름 고정" />
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
                      한 기기에서는 한 사람만 응답할 수 있어요. 다른 사람 응답은 관리자가 &lsquo;대신 입력&rsquo;으로 넣을 수 있고, 이름을 잘못 골랐다면 관리자에게 삭제를 요청하세요.
                    </p>
                  </>
                ) : (
                  <>
                <StepHead
                  eyebrow={poll.title}
                  title={proxy ? "누구의 응답을 입력할까요?" : poll.roster?.length && !typing ? "본인 이름을 선택하세요" : "이름을 알려주세요"}
                  sub={proxy ? "이미 응답한 사람을 고르면 그 응답을 수정해요. 본인도 나중에 직접 수정할 수 있어요." : "같은 이름으로 다시 응답하면 기존 응답이 수정돼요."}
                />
                <div id="name-area">
                {poll.roster?.length && !typing ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {poll.roster.map((n) => {
                        const on = nameKey(n) === nameKey(name);
                        const r = existing(n);
                        const done = !!r;
                        return (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={on}
                            onClick={() => {
                              vibrate(6);
                              chooseName(n);
                            }}
                            className={cx(
                              "relative flex h-12 items-center justify-center gap-1 rounded-2xl border-2 px-2 text-[15px] font-semibold transition active:scale-95",
                              on ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink/15",
                            )}
                          >
                            <span className="truncate">{n}</span>
                            {done &&
                              (r?.locked && !proxy ? (
                                <Lock className={cx("size-3 shrink-0", on ? "text-white/70" : "text-ink-3")} strokeWidth={2.6} aria-label="다른 기기에서 응답함" />
                              ) : (
                                <Check className={cx("size-3.5 shrink-0", on ? "text-white/80" : "text-accent")} strokeWidth={3} aria-label="응답함" />
                              ))}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTyping(true);
                        chooseName("");
                      }}
                      className="mt-4 text-[14px] font-semibold text-ink-2 underline underline-offset-4"
                    >
                      명단에 이름이 없어요
                    </button>
                  </>
                ) : (
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
                    <input
                      autoFocus={!savedName && !proxy}
                      value={name}
                      maxLength={20}
                      onChange={(e) => chooseName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && name.trim() && !lockedName && next()}
                      placeholder="예) 김민준"
                      // 브라우저 입력 기록(대리 입력한 이름 등)이 후보로 뜨지 않도록 자동완성 끔
                      autoComplete="off"
                      name={proxy ? "proxy-respondent" : "respondent"}
                      enterKeyHint="next"
                      className={cx(inputCls, "pl-12 text-[17px] font-medium")}
                    />
                  </div>
                )}
                {poll.roster?.length && typing ? (
                  <div className={cx("mt-3 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed", offRoster ? "bg-[#fdf5e3] text-[#8a5a12]" : "bg-ink/[0.04] text-ink-2")}>
                    {offRoster ? "명단에 없는 이름이에요. 결과에 '명단 외'로 표시돼요." : "명단에 없는 분만 직접 입력해 주세요."}{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setTyping(false);
                        chooseName("");
                      }}
                      className="font-semibold underline underline-offset-2"
                    >
                      명단에서 고르기
                    </button>
                  </div>
                ) : null}
                </div>
                {prev &&
                  (lockedName ? (
                    <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-[#fdf5e3] px-3 py-2.5 text-[13px] font-medium leading-relaxed text-[#8a5a12]">
                      <Lock className="mt-0.5 size-4 shrink-0" strokeWidth={2.6} />
                      다른 기기에서 이미 응답한 이름이에요. 본인이라면 처음 응답한 기기에서 수정하거나, 관리자에게 초기화를 요청하세요.
                    </p>
                  ) : (
                    <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2.5 text-[13px] font-medium text-accent">
                      <Check className="size-4 shrink-0" strokeWidth={3} />
                      <span className="flex-1">{proxy ? `${prev.name}님의 기존 응답을 불러왔어요.` : `${prev.name}님의 이전 응답을 불러왔어요.`}</span>
                      {!proxy && (
                        <button
                          type="button"
                          onClick={() => {
                            // 한 기기를 여러 사람이 쓰는 경우: 이전 사람 이름을 지우고 새로 선택
                            local.del(keys.name);
                            chooseName("");
                            setTyping(!poll.roster?.length);
                          }}
                          className="shrink-0 font-semibold text-ink-2 underline underline-offset-2"
                        >
                          다른 사람이에요
                        </button>
                      )}
                    </div>
                  ))}
                  </>
                )}
              </>
            ) : (
              <>
                {placeCard && step.q.kind === "attendance" && (
                  <div className="mb-6">
                    <PlaceInfo p={placeCard} region={poll.region} label={poll.place ? "📍 장소가 정해졌어요" : "✓ 확정된 식당"} dark />
                  </div>
                )}
                {context.length > 0 && step.q.kind !== "attendance" && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {context.map((c) => (
                      <span key={c} className="rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <QuestionView q={step.q} options={allowedOptions(poll, step.q, answers)} placeInfo={poll.placeInfo} answer={answers[step.q.id]} onPick={pick} onText={(v) => setAnswers({ ...answers, [step.q.id]: v })} index={idx} total={qCount} />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </SheetBody>

      {(step.key === "name" || current?.kind === "multi" || current?.kind === "text" || answers[current?.id ?? ""] !== undefined) && (
        <SheetFooter className="pb-3">
          {step.key === "name" ? (
            <Button
              className="w-full"
              onClick={() => {
                if (!name.trim()) return flash("name-area", poll.roster?.length && !typing ? "이름을 선택해 주세요" : "이름을 입력해 주세요");
                if (lockedName) return flash("name-area", "다른 기기에서 이미 응답한 이름이에요");
                next();
              }}
            >
              {prev && !lockedName ? "응답 수정하기" : "시작하기"}
            </Button>
          ) : current?.kind === "multi" ? (
            <Button
              className="w-full"
              loading={busy}
              onClick={() => (current.required && multiCount === 0 ? flash("options-area", "하나 이상 골라 주세요") : next())}
            >
              {isLast ? "응답 제출" : "다음"}
              {multiCount > 0 && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[13px]">{multiCount}개 선택</span>}
            </Button>
          ) : current?.kind === "text" ? (
            <Button className="w-full" loading={busy} onClick={() => next()}>
              {textVal.trim() ? (isLast ? "응답 제출" : "다음") : isLast ? "건너뛰고 제출" : "건너뛰기"}
            </Button>
          ) : (
            <Button className="w-full" loading={busy} onClick={() => next()}>
              {isLast ? "응답 제출" : "다음"}
            </Button>
          )}
        </SheetFooter>
      )}
    </>
  );
}

/** 식당 선택지 아래 한 줄 정보: 분류 · 대표 메뉴 */
function PlaceLine({ p, on }: { p: PollDetail["placeInfo"][string]; on: boolean }) {
  const top = p.menus[0];
  const line = [p.category, top && menuLabel(top)].filter(Boolean).join(" · ");
  return (
    <span className={cx("mt-0.5 flex items-center gap-2 text-[12.5px] font-medium", on ? "text-white/65" : "text-ink-3")}>
      {line && <span className="min-w-0 truncate">{line}</span>}
      <span
        role="link"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          openExternal(naverUrl(p));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            openExternal(naverUrl(p));
          }
        }}
        className={cx("shrink-0 cursor-pointer underline underline-offset-2", on ? "text-white/80" : "text-ink-2")}
      >
        정보
      </span>
    </span>
  );
}

function StepHead({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mb-6">
      {eyebrow && <p className="mb-1.5 text-[13px] font-semibold text-ink-3">{eyebrow}</p>}
      <h2 className="text-[24px] font-bold leading-tight tracking-tight">{title}</h2>
      {sub && <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{sub}</p>}
    </div>
  );
}

const ATT_STYLE: Record<string, { icon: typeof Check; on: string; iconBg: string; desc: string }> = {
  [ATTEND.yes]: { icon: Check, on: "border-accent bg-accent-soft", iconBg: "bg-accent text-white", desc: "함께할게요" },
  [ATTEND.maybe]: { icon: CircleHelp, on: "border-[#d99a1e] bg-[#fdf5e3]", iconBg: "bg-[#e8a92c] text-white", desc: "아직 모르겠어요" },
  [ATTEND.no]: { icon: X, on: "border-ink/40 bg-ink/[0.04]", iconBg: "bg-ink/70 text-white", desc: "이번엔 어려워요" },
};

function QuestionView({
  q,
  options,
  placeInfo,
  answer,
  onPick,
  onText,
  index,
  total,
}: {
  q: Question;
  options: string[];
  placeInfo: PollDetail["placeInfo"];
  answer: Answer | undefined;
  onPick: (q: Question, v: string) => void;
  onText: (v: string) => void;
  index: number;
  total: number;
}) {
  const eyebrow = `${index} / ${total}`;
  if (q.kind === "attendance") {
    return (
      <>
        <StepHead eyebrow={eyebrow} title={q.title} />
        <div className="space-y-2.5">
          {q.options.map((o) => {
            const s = ATT_STYLE[o];
            const on = answer === o;
            const Icon = s?.icon ?? Check;
            return (
              <button
                key={o}
                onClick={() => onPick(q, o)}
                className={cx(
                  "flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-4 text-left transition active:scale-[0.99]",
                  on ? s?.on : "border-line bg-surface hover:border-ink/15",
                )}
              >
                <span className={cx("flex size-11 items-center justify-center rounded-full transition", on ? s?.iconBg : "bg-ink/[0.05] text-ink-3")}>
                  <Icon className="size-5" strokeWidth={2.6} />
                </span>
                <span>
                  <span className="block text-[17px] font-bold">{o}</span>
                  <span className="block text-[13px] text-ink-3">{s?.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </>
    );
  }
  if (q.kind === "text") {
    return (
      <>
        <StepHead eyebrow={eyebrow} title={q.title} sub="선택 사항이에요. 없으면 건너뛰어도 돼요." />
        <textarea
          value={(answer as string) ?? ""}
          onChange={(e) => onText(e.target.value)}
          maxLength={300}
          rows={4}
          placeholder="예) 갑각류 알레르기가 있어요 / 30분 정도 늦어요"
          className={textareaCls}
        />
      </>
    );
  }
  const multi = q.kind === "multi";
  const selected = multi ? ((answer as string[] | undefined) ?? []) : answer ? [answer as string] : [];
  return (
    <>
      <StepHead
        eyebrow={eyebrow}
        title={q.title}
        sub={[q.optionGroups ? "고르신 식당의 메뉴만 보여드려요." : "", multi ? "여러 개를 고를 수 있어요." : ""].filter(Boolean).join(" ") || undefined}
      />
      <div id="options-area" className="space-y-2">
        {options.map((o, i) => {
          const on = selected.includes(o);
          // 식당별 묶음 제목 (식당 연계 메뉴일 때)
          const group = q.optionGroups ? (q.optionGroups[o] ?? "공통 메뉴") : null;
          const prevGroup = i > 0 && q.optionGroups ? (q.optionGroups[options[i - 1]] ?? "공통 메뉴") : null;
          const header = group && group !== prevGroup ? (
            <p key={`h-${group}`} className={cx("flex items-center gap-1.5 px-1 text-[13px] font-bold text-ink-2", i > 0 && "pt-3")}>
              <span className="size-1.5 rounded-full bg-accent" /> {group}
            </p>
          ) : null;
          return [header,
            <motion.button
              key={o}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onPick(q, o)}
              aria-pressed={on}
              className={cx(
                "flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[16px] font-semibold transition active:scale-[0.99]",
                on ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink/15",
              )}
            >
              <span
                className={cx(
                  "flex size-6 shrink-0 items-center justify-center border-2 transition",
                  multi ? "rounded-lg" : "rounded-full",
                  on ? "border-white bg-white text-ink" : "border-ink/15",
                )}
              >
                {on && <Check className="size-3.5" strokeWidth={3.5} />}
              </span>
              <span className="min-w-0 flex-1 break-keep">
                {o}
                {placeInfo[o] && <PlaceLine p={placeInfo[o]} on={on} />}
              </span>
            </motion.button>,
          ];
        })}
      </div>
    </>
  );
}
