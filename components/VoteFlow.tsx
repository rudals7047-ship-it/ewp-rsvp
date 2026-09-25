"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, CircleHelp, UserRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ApiError, api, keys, local, vibrate } from "@/lib/client";
import { nameKey, pendingQuestions, visibleQuestions } from "@/lib/poll";
import type { Answer, PollDetail, Question } from "@/lib/types";
import { ATTEND } from "@/lib/types";
import { SheetBody, SheetFooter } from "./Sheet";
import { Button, IconButton, cx, inputCls, toast } from "./ui";

type Step = { key: "name" } | { key: "q"; q: Question };

const inRoster = (roster: string[] | undefined, n: string) => !!roster?.some((r) => nameKey(r) === nameKey(n));

export function VoteFlow({
  poll,
  onDone,
  onCancel,
}: {
  poll: PollDetail;
  onDone: (poll: PollDetail, name: string, answers: Record<string, Answer>) => void;
  onCancel: () => void;
}) {
  const savedName = local.get(keys.name) ?? "";
  const existing = (n: string) => poll.responses.find((r) => nameKey(r.name) === nameKey(n));
  const [name, setName] = useState(savedName);
  const [typing, setTyping] = useState(() => !poll.roster?.length || (!!savedName && !inRoster(poll.roster, savedName)));
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => existing(savedName)?.answers ?? {});
  // 이미 응답한 사람이 2차 질문 때문에 다시 들어오면 새 질문으로 바로 이동
  const [idx, setIdx] = useState(() => {
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
      const { poll: updated } = await api.respond(poll.id, trimmed, final);
      local.set(keys.name, trimmed);
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
  const responded = new Set(poll.responses.map((r) => nameKey(r.name)));

  return (
    <>
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
                  title={poll.roster?.length && !typing ? "본인 이름을 선택하세요" : "이름을 알려주세요"}
                  sub="같은 이름으로 다시 응답하면 기존 응답이 수정돼요."
                />
                {poll.roster?.length && !typing ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {poll.roster.map((n) => {
                        const on = nameKey(n) === nameKey(name);
                        const done = responded.has(nameKey(n));
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
                            {done && <Check className={cx("size-3.5 shrink-0", on ? "text-white/80" : "text-accent")} strokeWidth={3} aria-label="응답함" />}
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
                      autoFocus={!savedName}
                      value={name}
                      maxLength={20}
                      onChange={(e) => chooseName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && name.trim() && next()}
                      placeholder="예) 김민준"
                      autoComplete="name"
                      enterKeyHint="next"
                      className={cx(inputCls, "pl-12 text-[17px] font-medium")}
                    />
                  </div>
                )}
                {prev && (
                  <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2.5 text-[13px] font-medium text-accent">
                    <Check className="size-4 shrink-0" strokeWidth={3} />
                    이전 응답을 불러왔어요. 수정 후 다시 저장할 수 있어요.
                  </p>
                )}
              </>
            ) : (
              <>
                {context.length > 0 && step.q.kind !== "attendance" && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {context.map((c) => (
                      <span key={c} className="rounded-full bg-accent-soft px-3 py-1 text-[12.5px] font-semibold text-accent">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <QuestionView q={step.q} answer={answers[step.q.id]} onPick={pick} onText={(v) => setAnswers({ ...answers, [step.q.id]: v })} index={idx} total={qCount} />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </SheetBody>

      {(step.key === "name" || current?.kind === "multi" || current?.kind === "text" || answers[current?.id ?? ""] !== undefined) && (
        <SheetFooter>
          {step.key === "name" ? (
            <Button className="w-full" disabled={!name.trim()} onClick={() => next()}>
              시작하기
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
  answer,
  onPick,
  onText,
  index,
  total,
}: {
  q: Question;
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
              <span className="min-w-0 flex-1 break-keep">{o}</span>
            </motion.button>
          );
        })}
      </div>
    </>
  );
}
