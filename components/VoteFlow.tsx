"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, CircleHelp, Crown, Lock, UserRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ApiError, api, keys, local, vibrate } from "@/lib/client";
import { menuLabel, naverUrl } from "@/lib/places";
import { nameKey, pendingQuestions, visibleQuestions } from "@/lib/poll";
import type { Answer, PollDetail, Question } from "@/lib/types";
import { ATTEND } from "@/lib/types";
import { PlaceInfo } from "./Places";
import { SheetBody, SheetFooter } from "./Sheet";
import { Button, IconButton, cx, inputCls, toast } from "./ui";

type Step = { key: "name" } | { key: "q"; q: Question };

const inRoster = (roster: string[] | undefined, n: string) => !!roster?.some((r) => nameKey(r) === nameKey(n));

export function VoteFlow({
  poll,
  onDone,
  onCancel,
  proxy,
}: {
  poll: PollDetail;
  onDone: (poll: PollDetail, name: string, answers: Record<string, Answer>) => void;
  onCancel: () => void;
  /** 관리자 대리 입력 모드 (initialName: 미리 선택할 이름) */
  proxy?: { initialName?: string };
}) {
  const savedName = proxy ? (proxy.initialName ?? "") : (poll.responses.find((r) => r.own)?.name ?? local.get(keys.name) ?? "");
  const existing = (n: string) => poll.responses.find((r) => nameKey(r.name) === nameKey(n));
  const [name, setName] = useState(savedName);
  const [typing, setTyping] = useState(() => !poll.roster?.length || (!!savedName && !inRoster(poll.roster, savedName)));
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

  return (
    <>
      {proxy && (
        <div className="mx-4 mt-1 flex items-center gap-1.5 rounded-xl bg-[#fdf5e3] px-3 py-2 text-[12.5px] font-semibold text-[#8a5a12] sm:mr-14 sm:mt-4">
          <Crown className="size-4 shrink-0" /> 관리자 대리 입력 중 · 결과에 &lsquo;대리&rsquo;로 표시돼요
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2 sm:pt-4">
        <IconButton label="이전" onClick={back}>
          <ChevronLeft className="size-6" />
        </IconButton>
        <div className="flex flex-1 gap-1.5 pr-12">
          {steps.map((_, i) => (
            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
              <motion.span
                className="block h-full rounded-full bg-ink"
                initial={false}
                animate={{ width: i <= idx ? "100%" : "0%" }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
          ))}
        </div>
      </div>

      <SheetBody className="pb-6 pt-5">
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
                <StepHead
                  eyebrow={poll.title}
                  title={proxy ? "누구의 응답을 입력할까요?" : poll.roster?.length && !typing ? "본인 이름을 선택하세요" : "이름을 알려주세요"}
                  sub={proxy ? "이미 응답한 사람을 고르면 그 응답을 수정해요. 본인도 나중에 직접 수정할 수 있어요." : "같은 이름으로 다시 응답하면 기존 응답이 수정돼요."}
                />
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
                      autoComplete="name"
                      enterKeyHint="next"
                      className={cx(inputCls, "pl-12 text-[17px] font-medium")}
                    />
                  </div>
                )}
                {prev &&
                  (lockedName ? (
                    <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-[#fdf5e3] px-3 py-2.5 text-[13px] font-medium leading-relaxed text-[#8a5a12]">
                      <Lock className="mt-0.5 size-4 shrink-0" strokeWidth={2.6} />
                      다른 기기에서 이미 응답한 이름이에요. 본인이라면 처음 응답한 기기에서 수정하거나, 관리자에게 초기화를 요청하세요.
                    </p>
                  ) : (
                    <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2.5 text-[13px] font-medium text-accent">
                      <Check className="size-4 shrink-0" strokeWidth={3} />
                      {proxy ? `${prev.name}님의 기존 응답을 불러왔어요.` : "이전 응답을 불러왔어요. 수정 후 다시 저장할 수 있어요."}
                    </p>
                  ))}
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
                <QuestionView q={step.q} placeInfo={poll.placeInfo} answer={answers[step.q.id]} onPick={pick} onText={(v) => setAnswers({ ...answers, [step.q.id]: v })} index={idx} total={qCount} />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </SheetBody>

      {(step.key === "name" || current?.kind === "multi" || current?.kind === "text" || answers[current?.id ?? ""] !== undefined) && (
        <SheetFooter>
          {step.key === "name" ? (
            <Button className="w-full" disabled={!name.trim() || lockedName} onClick={() => next()}>
              {prev && !lockedName ? "응답 수정하기" : "시작하기"}
            </Button>
          ) : current?.kind === "multi" ? (
            <Button className="w-full" loading={busy} disabled={current.required && multiCount === 0} onClick={() => next()}>
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
          window.open(naverUrl(p), "_blank", "noopener");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.stopPropagation();
            window.open(naverUrl(p), "_blank", "noopener");
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
  placeInfo,
  answer,
  onPick,
  onText,
  index,
  total,
}: {
  q: Question;
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
          className={cx(inputCls, "h-auto resize-none py-3.5 leading-relaxed")}
        />
      </>
    );
  }
  const multi = q.kind === "multi";
  const selected = multi ? ((answer as string[] | undefined) ?? []) : answer ? [answer as string] : [];
  return (
    <>
      <StepHead eyebrow={eyebrow} title={q.title} sub={multi ? "여러 개를 고를 수 있어요." : undefined} />
      <div className="space-y-2">
        {q.options.map((o, i) => {
          const on = selected.includes(o);
          return (
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
            </motion.button>
          );
        })}
      </div>
    </>
  );
}
