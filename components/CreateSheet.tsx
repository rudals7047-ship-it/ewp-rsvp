"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ClipboardCopy,
  KeyRound,
  ListChecks,
  MessageSquareText,
  Plus,
  Share2,
  Trash2,
  UserCheck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useState } from "react";
import { ApiError, api, copyText, fmtDate, keys, kstToIso, kstToday, local, shareLink, track } from "@/lib/client";
import { LIMITS } from "@/lib/poll";
import type { QuestionKind, Template } from "@/lib/types";
import { PinPad } from "./PinPad";
import { Sheet, SheetBody, SheetFooter } from "./Sheet";
import { Button, Field, IconButton, Segmented, Toggle, cx, inputCls, toast } from "./ui";

type Step = "type" | "info" | "questions" | "pin" | "pin2" | "done";
type DraftQ = { key: string; kind: QuestionKind; title: string; options: string[] };

let seq = 0;
const k = () => `d${++seq}`;

function mealQuestions(): DraftQ[] {
  return [
    { key: k(), kind: "attendance", title: "참석하시나요?", options: [] },
    { key: k(), kind: "multi", title: "어느 식당이 좋으세요?", options: [] },
    { key: k(), kind: "single", title: "어떤 메뉴가 끌리세요?", options: [] },
    { key: k(), kind: "text", title: "요청사항이 있으면 알려주세요", options: [] },
  ];
}
function generalQuestions(): DraftQ[] {
  return [{ key: k(), kind: "single", title: "", options: [] }];
}

const SLOTS = { lunch: "12:00", dinner: "18:30" } as const;

export function CreateSheet({
  open,
  onClose,
  teams,
  defaultTeam,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  teams: string[];
  defaultTeam: string | null;
  onCreated: (id: string, team: string) => void;
}) {
  const [step, setStep] = useState<Step>("type");
  const [dir, setDir] = useState(1);
  const [template, setTemplate] = useState<Template>("meal");
  const [team, setTeam] = useState(defaultTeam ?? "");
  const [addingTeam, setAddingTeam] = useState(!teams.length);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(kstToday());
  const [slot, setSlot] = useState<"lunch" | "dinner" | "custom">("dinner");
  const [time, setTime] = useState("19:00");
  const [deadlineMode, setDeadlineMode] = useState<"auto" | "custom">("auto");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [questions, setQuestions] = useState<DraftQ[]>(mealQuestions);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; adminToken: string; title: string; team: string } | null>(null);

  const close = onClose;

  function go(s: Step, d = 1) {
    setDir(d);
    setStep(s);
  }

  const isMeal = template === "meal";
  const eventTime = slot === "custom" ? time : SLOTS[slot];
  const eventAt = isMeal ? kstToIso(date, eventTime) : undefined;
  const autoTitle = isMeal && date ? `${fmtDate(kstToIso(date, "12:00")!, false)} ${slot === "lunch" ? "점심" : slot === "dinner" ? "저녁" : ""} 식사`.replace(/\s+/g, " ") : "";
  const finalTitle = title.trim() || autoTitle;
  const deadlineIso = deadlineMode === "custom" && deadline ? new Date(`${deadline}:00+09:00`).toISOString() : undefined;

  const validQs = questions.filter((q) => (q.kind === "single" || q.kind === "multi" ? q.options.length > 0 : true) && (q.title.trim() || q.kind === "attendance"));
  const infoError = !team.trim()
    ? "팀을 선택해 주세요"
    : !finalTitle
      ? "제목을 입력해 주세요"
      : isMeal && eventAt && Date.parse(eventAt) < Date.now()
        ? "모임 시각이 이미 지났어요"
        : deadlineIso && Date.parse(deadlineIso) < Date.now()
          ? "마감 시각이 이미 지났어요"
          : null;
  const qError = validQs.length === 0 ? "질문과 선택지를 1개 이상 입력해 주세요" : questions.some((q) => (q.kind === "single" || q.kind === "multi") && q.options.length > 0 && !q.title.trim()) ? "질문 제목을 입력해 주세요" : null;

  async function create(pinValue: string) {
    setBusy(true);
    try {
      const body = {
        template,
        team: team.trim(),
        title: finalTitle,
        note: note.trim() || undefined,
        eventAt,
        deadline: deadlineIso,
        pin: pinValue,
        questions: validQs.map((q) => ({ kind: q.kind, title: q.title.trim() || "참석하시나요?", options: q.options })),
      };
      const res = await api.create(body);
      local.set(keys.admin(res.id), res.adminToken);
      local.set(keys.team, body.team);
      setCreated({ ...res, title: body.title, team: body.team });
      track("poll-created");
      onCreated(res.id, body.team);
      go("done");
      return true;
    } catch (e) {
      setPinMsg(e instanceof ApiError ? e.message : "생성에 실패했어요");
      go("pin", -1);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = { type: 0, info: 1, questions: 2, pin: 3, pin2: 3, done: 4 }[step];
  const prevStep: Partial<Record<Step, Step>> = { info: "type", questions: "info", pin: "questions", pin2: "pin" };

  return (
    <Sheet open={open} onClose={close} label="새 투표 만들기">
      {step !== "done" && (
        <div className="flex shrink-0 items-center gap-2 px-3 pt-2 sm:pt-4">
          {prevStep[step] ? (
            <IconButton label="이전" onClick={() => go(prevStep[step]!, -1)}>
              <ChevronLeft className="size-6" />
            </IconButton>
          ) : (
            <span className="w-10" />
          )}
          <div className="flex flex-1 gap-1.5 pr-12">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cx("h-1 flex-1 rounded-full transition-colors duration-300", i <= stepIndex ? "bg-ink" : "bg-ink/[0.08]")} />
            ))}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={step}
          className="flex min-h-0 flex-1 flex-col"
          initial={{ opacity: 0, x: dir * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -28 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === "type" && (
            <SheetBody className="pb-safe pt-5">
              <Head title="어떤 투표를 만들까요?" sub="참여자는 PIN 4자리를 입력해야 응답할 수 있어요." />
              <div className="space-y-3">
                <TypeTile
                  icon={UtensilsCrossed}
                  title="식사 모임"
                  desc="참석 여부 · 선호 식당 · 메뉴를 한 번에"
                  tags={["점심/저녁", "참석 집계", "식당·메뉴 투표"]}
                  onClick={() => {
                    setTemplate("meal");
                    setQuestions(mealQuestions());
                    go("info");
                  }}
                  featured
                />
                <TypeTile
                  icon={ListChecks}
                  title="일반 투표"
                  desc="워크숍 날짜, 회식 장소, 기념품 등 무엇이든"
                  tags={["선택형", "복수 선택", "의견 받기"]}
                  onClick={() => {
                    setTemplate("general");
                    setQuestions(generalQuestions());
                    go("info");
                  }}
                />
              </div>
            </SheetBody>
          )}

          {step === "info" && (
            <>
              <SheetBody className="pb-6 pt-5">
                <Head title={isMeal ? "모임 정보" : "투표 정보"} />
                <div className="space-y-6">
                  <Field label="팀">
                    <div className="flex flex-wrap gap-2">
                      {teams.map((t) => (
                        <Chip
                          key={t}
                          on={!addingTeam && team === t}
                          onClick={() => {
                            setTeam(t);
                            setAddingTeam(false);
                          }}
                        >
                          {t}
                        </Chip>
                      ))}
                      {!addingTeam && (
                        <Chip
                          on={false}
                          dashed
                          onClick={() => {
                            setAddingTeam(true);
                            setTeam("");
                          }}
                        >
                          <Plus className="size-4" /> 새 팀
                        </Chip>
                      )}
                    </div>
                    {addingTeam && (
                      <input
                        autoFocus={teams.length > 0}
                        value={team}
                        onChange={(e) => setTeam(e.target.value)}
                        maxLength={LIMITS.team}
                        placeholder="팀 이름 (예: 회계세무부)"
                        className={cx(inputCls, teams.length ? "mt-2.5" : "")}
                      />
                    )}
                  </Field>

                  {isMeal && (
                    <>
                      <Field label="날짜">
                        <div className="mb-2 flex gap-2">
                          {[
                            ["오늘", kstToday()],
                            ["내일", kstToday(1)],
                          ].map(([l, v]) => (
                            <Chip key={l} on={date === v} onClick={() => setDate(v)}>
                              {l}
                            </Chip>
                          ))}
                        </div>
                        <input type="date" value={date} min={kstToday()} onChange={(e) => setDate(e.target.value)} className={cx(inputCls, "appearance-none")} />
                      </Field>
                      <Field label="시간">
                        <Segmented
                          value={slot}
                          onChange={setSlot}
                          options={[
                            { value: "lunch", label: "점심", sub: "12:00" },
                            { value: "dinner", label: "저녁", sub: "18:30" },
                            { value: "custom", label: "직접 입력", sub: slot === "custom" ? time : "시간 선택" },
                          ]}
                        />
                        {slot === "custom" && (
                          <input type="time" value={time} step={600} onChange={(e) => setTime(e.target.value)} className={cx(inputCls, "mt-2 appearance-none")} />
                        )}
                      </Field>
                    </>
                  )}

                  <Field asLabel label="제목" hint={isMeal ? "비워두면 자동으로 채워져요" : undefined}>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={LIMITS.title}
                      placeholder={autoTitle || "예) 10월 워크숍 날짜 투표"}
                      className={inputCls}
                    />
                  </Field>

                  <Field label="응답 마감">
                    <Segmented
                      value={deadlineMode}
                      onChange={setDeadlineMode}
                      options={[
                        { value: "auto", label: isMeal ? "모임 시작 시" : "직접 마감할 때까지" },
                        { value: "custom", label: "시각 지정" },
                      ]}
                    />
                    {deadlineMode === "custom" && (
                      <input
                        type="datetime-local"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        className={cx(inputCls, "mt-2 appearance-none")}
                      />
                    )}
                  </Field>

                  <Field asLabel label="안내 메모" hint="선택">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={LIMITS.note}
                      rows={2}
                      placeholder="예) 법인카드 사용, 1인 3만원 이내"
                      className={cx(inputCls, "h-auto resize-none py-3 leading-relaxed")}
                    />
                  </Field>
                </div>
              </SheetBody>
              <SheetFooter>
                <Button className="w-full" disabled={!!infoError} onClick={() => go("questions")}>
                  {infoError ?? (
                    <>
                      다음 <ArrowRight className="size-5" />
                    </>
                  )}
                </Button>
              </SheetFooter>
            </>
          )}

          {step === "questions" && (
            <>
              <SheetBody className="pb-6 pt-5">
                <Head
                  title="무엇을 물어볼까요?"
                  sub={isMeal ? "선택지를 비워둔 질문은 자동으로 빠져요. 불참자에게는 식당·메뉴를 묻지 않아요." : "질문과 선택지를 입력하세요."}
                />
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <QuestionEditor
                      key={q.key}
                      q={q}
                      index={i}
                      onChange={(nq) => setQuestions(questions.map((x) => (x.key === q.key ? nq : x)))}
                      onRemove={questions.length > 1 ? () => setQuestions(questions.filter((x) => x.key !== q.key)) : undefined}
                    />
                  ))}
                </div>
                {questions.length < LIMITS.questions && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <AddBtn onClick={() => setQuestions([...questions, { key: k(), kind: "single", title: "", options: [] }])} icon={ListChecks}>
                      선택형 질문
                    </AddBtn>
                    {!questions.some((q) => q.kind === "attendance") && (
                      <AddBtn onClick={() => setQuestions([{ key: k(), kind: "attendance", title: "참석하시나요?", options: [] }, ...questions])} icon={UserCheck}>
                        참석 여부
                      </AddBtn>
                    )}
                    <AddBtn onClick={() => setQuestions([...questions, { key: k(), kind: "text", title: "의견을 남겨주세요", options: [] }])} icon={MessageSquareText}>
                      주관식
                    </AddBtn>
                  </div>
                )}
              </SheetBody>
              <SheetFooter>
                <Button className="w-full" disabled={!!qError} onClick={() => go("pin")}>
                  {qError ?? (
                    <>
                      PIN 설정하기 <KeyRound className="size-5" />
                    </>
                  )}
                </Button>
              </SheetFooter>
            </>
          )}

          {step === "pin" && (
            <SheetBody className="pb-safe">
              <PinPad
                tone="set"
                title="참여 PIN을 정해주세요"
                subtitle="숫자 4자리 · 참여자에게 따로 알려주세요"
                message={pinMsg}
                onSubmit={(v) => {
                  setPin(v);
                  setPinMsg(null);
                  go("pin2");
                  return true;
                }}
              />
            </SheetBody>
          )}

          {step === "pin2" && (
            <SheetBody className="pb-safe">
              <PinPad
                tone="set"
                title="한 번 더 입력해 주세요"
                subtitle={busy ? "투표를 만드는 중…" : "확인을 위해 같은 PIN을 입력하세요"}
                message={pinMsg}
                onSubmit={async (v) => {
                  if (v !== pin) {
                    setPinMsg("PIN이 일치하지 않아요. 다시 입력해 주세요");
                    return false;
                  }
                  return create(v);
                }}
              />
            </SheetBody>
          )}

          {step === "done" && created && <CreatedView created={created} pin={pin} onClose={close} />}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-6 pr-8">
      <h2 className="text-[24px] font-bold leading-tight tracking-tight">{title}</h2>
      {sub && <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{sub}</p>}
    </div>
  );
}

function Chip({ on, onClick, children, dashed }: { on: boolean; onClick: () => void; children: React.ReactNode; dashed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        "inline-flex h-10 items-center gap-1 rounded-full px-4 text-[14px] font-semibold transition active:scale-95",
        on ? "bg-ink text-white" : dashed ? "border border-dashed border-ink/20 text-ink-2" : "bg-ink/[0.05] text-ink-2 hover:bg-ink/[0.08]",
      )}
    >
      {children}
    </button>
  );
}

function TypeTile({
  icon: Icon,
  title,
  desc,
  tags,
  onClick,
  featured,
}: {
  icon: typeof ListChecks;
  title: string;
  desc: string;
  tags: string[];
  onClick: () => void;
  featured?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "group relative w-full overflow-hidden rounded-3xl p-5 text-left transition active:scale-[0.99]",
        featured ? "bg-ink text-white" : "border border-line bg-surface hover:border-ink/20",
      )}
    >
      {featured && <span className="pointer-events-none absolute -right-12 -top-16 size-48 rounded-full bg-accent/35 blur-3xl" />}
      <span className="relative flex items-start gap-4">
        <span className={cx("flex size-12 shrink-0 items-center justify-center rounded-2xl", featured ? "bg-white/10" : "bg-ink/[0.05]")}>
          <Icon className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between">
            <span className="text-[18px] font-bold">{title}</span>
            <ArrowRight className={cx("size-5 transition group-hover:translate-x-0.5", featured ? "text-white/60" : "text-ink-3")} />
          </span>
          <span className={cx("mt-0.5 block text-[14px]", featured ? "text-white/65" : "text-ink-3")}>{desc}</span>
          <span className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className={cx("rounded-full px-2 py-0.5 text-[11.5px] font-medium", featured ? "bg-white/10 text-white/75" : "bg-ink/[0.05] text-ink-3")}>
                {t}
              </span>
            ))}
          </span>
        </span>
      </span>
    </button>
  );
}

function AddBtn({ onClick, icon: Icon, children }: { onClick: () => void; icon: typeof Plus; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-ink/20 px-3.5 text-[13.5px] font-semibold text-ink-2 transition hover:bg-ink/[0.03] active:scale-95"
    >
      <Plus className="size-4" />
      <Icon className="size-4 text-ink-3" />
      {children}
    </button>
  );
}

const KIND_LABEL: Record<QuestionKind, string> = { attendance: "참석 여부", single: "선택형", multi: "선택형", text: "주관식" };

function QuestionEditor({
  q,
  index,
  onChange,
  onRemove,
}: {
  q: DraftQ;
  index: number;
  onChange: (q: DraftQ) => void;
  onRemove?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const choice = q.kind === "single" || q.kind === "multi";

  function add(raw: string) {
    const items = raw
      .split(/[,\n]/)
      .map((s) => s.trim().slice(0, LIMITS.option))
      .filter(Boolean);
    if (!items.length) return;
    const next = Array.from(new Set([...q.options, ...items])).slice(0, LIMITS.options);
    onChange({ ...q, options: next });
    setDraft("");
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">{index + 1}</span>
        <span className="text-[12.5px] font-semibold text-ink-3">{KIND_LABEL[q.kind]}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="질문 삭제" className="ml-auto flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.05]">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {q.kind === "attendance" ? (
        <>
          <p className="text-[16px] font-semibold">{q.title}</p>
          <div className="mt-2.5 flex gap-1.5">
            {["참석", "미정", "불참"].map((o) => (
              <span key={o} className="rounded-full bg-ink/[0.05] px-3 py-1 text-[13px] font-medium text-ink-2">
                {o}
              </span>
            ))}
          </div>
        </>
      ) : (
        <input
          value={q.title}
          onChange={(e) => onChange({ ...q, title: e.target.value })}
          maxLength={LIMITS.questionTitle}
          placeholder={q.kind === "text" ? "예) 요청사항이 있으면 알려주세요" : "질문을 입력하세요"}
          className="w-full border-0 bg-transparent p-0 text-[16px] font-semibold outline-none placeholder:text-ink-3/70"
        />
      )}

      {choice && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <span key={o} className="inline-flex items-center gap-1 rounded-full bg-ink/[0.06] py-1 pl-3 pr-1 text-[14px] font-medium">
                {o}
                <button
                  type="button"
                  aria-label={`${o} 삭제`}
                  onClick={() => onChange({ ...q, options: q.options.filter((x) => x !== o) })}
                  className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-ink/10"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  add(draft);
                }
              }}
              onBlur={() => draft.trim() && add(draft)}
              onPaste={(e) => {
                const t = e.clipboardData.getData("text");
                if (/[,\n]/.test(t)) {
                  e.preventDefault();
                  add(t);
                }
              }}
              enterKeyHint="done"
              placeholder={q.options.length ? "선택지 추가" : "선택지 입력 후 추가 (쉼표로 여러 개)"}
              className="h-11 min-w-0 flex-1 rounded-xl bg-ink/[0.04] px-3.5 text-[16px] outline-none placeholder:text-ink-3/80 focus:bg-ink/[0.06]"
            />
            <button
              type="button"
              onClick={() => add(draft)}
              disabled={!draft.trim()}
              aria-label="선택지 추가"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition disabled:bg-ink/10 disabled:text-ink-3"
            >
              <Plus className="size-5" />
            </button>
          </div>
          <div className="mt-3">
            <Toggle checked={q.kind === "multi"} onChange={(v) => onChange({ ...q, kind: v ? "multi" : "single" })} label="복수 선택 허용" />
          </div>
        </>
      )}
      {q.kind === "text" && <p className="mt-1.5 text-[12.5px] text-ink-3">응답자가 자유롭게 입력해요 (선택 응답)</p>}
    </div>
  );
}

function CreatedView({
  created,
  pin,
  onClose,
}: {
  created: { id: string; adminToken: string; title: string; team: string };
  pin: string;
  onClose: () => void;
}) {
  const url = typeof window !== "undefined" ? `${location.origin}/p/${created.id}` : "";
  const baseText = `[${created.team}] ${created.title}\n아래 링크에서 참여해 주세요 🗳️`;
  return (
    <>
      <SheetBody className="pb-6 pt-8">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 13, stiffness: 220 }}
            className="flex size-16 items-center justify-center rounded-full bg-accent text-white"
          >
            <Check className="size-8" strokeWidth={3} />
          </motion.div>
          <h2 className="mt-5 text-[22px] font-bold tracking-tight">투표가 만들어졌어요</h2>
          <p className="mt-1.5 text-[14px] text-ink-3">링크와 PIN을 팀원들에게 공유하세요</p>
        </div>

        <div className="mt-7 rounded-2xl bg-ink p-5 text-white">
          <p className="text-[12.5px] font-semibold text-white/55">참여 PIN</p>
          <p className="mt-1 text-[34px] font-bold tracking-[0.3em] tabular-nums">{pin}</p>
          <p className="mt-2 break-all text-[13px] text-white/60">{url}</p>
        </div>

        <div className="mt-3 grid gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={async () => {
              const r = await shareLink(url, created.title, `${baseText}\n🔒 PIN은 별도로 안내드려요`);
              if (r === "copied") toast("링크를 복사했어요");
            }}
          >
            <Share2 className="size-4" /> 링크만 공유 (PIN 별도 안내)
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={async () => {
              const ok = await copyText(`${baseText}\n🔒 PIN: ${pin}\n${url}`);
              toast(ok ? "PIN 포함 메시지를 복사했어요" : "복사에 실패했어요");
            }}
          >
            <ClipboardCopy className="size-4" /> PIN 포함 메시지 복사
          </Button>
        </div>

        <div className="mt-5 rounded-2xl border border-line p-4 text-[13px] leading-relaxed text-ink-3">
          <p>
            이 기기에서는 <b className="text-ink-2">관리자 권한</b>(마감·삭제)이 자동으로 유지돼요. 다른 기기에서도 관리하려면 관리 링크를 보관하세요.
          </p>
          <button
            type="button"
            className="mt-2 font-semibold text-ink underline underline-offset-4"
            onClick={async () => {
              const ok = await copyText(`${url}#admin=${created.adminToken}`);
              toast(ok ? "관리 링크를 복사했어요 (외부 공유 금지)" : "복사에 실패했어요");
            }}
          >
            관리 링크 복사
          </button>
        </div>
      </SheetBody>
      <SheetFooter>
        <Button className="w-full" onClick={onClose}>
          완료
        </Button>
      </SheetFooter>
    </>
  );
}
