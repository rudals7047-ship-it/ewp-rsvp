"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Check,
  Eye,
  MapPin,
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
import { ApiError, api, copyText, pollUrl, shareText, fmtDate, keys, kstToIso, kstToday, local, shareLink, track } from "@/lib/client";
import { LIMITS } from "@/lib/poll";
import { type Place, type Region, menuLabel, toSnap } from "@/lib/places";
import type { QuestionKind, Template } from "@/lib/types";
import { ChipsInput } from "./ChipsInput";
import { RosterField } from "./Rosters";
import { MenuSuggestions, PlacePicker, SaveMenus } from "./Places";
import { PinPad } from "./PinPad";
import { Sheet, SheetBody, SheetFooter } from "./Sheet";
import { Button, Field, flash, IconButton, reveal, Segmented, Toggle, cx, inputCls, textareaCls, toast } from "./ui";

type Step = "type" | "info" | "questions" | "pin" | "pin2" | "admin" | "done";
type DraftQ = {
  key: string;
  kind: QuestionKind;
  title: string;
  options: string[];
  topic?: "place" | "menu";
  optionGroups?: Record<string, string>;
};

let seq = 0;
const k = () => `d${++seq}`;

function generalQuestions(): DraftQ[] {
  return [{ key: k(), kind: "single", title: "", options: [] }];
}

const SLOTS = { lunch: "12:00", dinner: "18:30" } as const;

type Created = { id: string; adminToken: string; title: string; team: string; menuLater: boolean; stageLabel: string };


/** "YYYY-MM-DD" 날짜 이동 */
function shiftDay(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** 시각(ms) → KST "YYYY-MM-DDTHH:MM" */
function kstLocal(ms: number) {
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 16);
}

/** KST "YYYY-MM-DDTHH:MM" → "9/26 17:00" */
function fmtLocal(v: string) {
  return `${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))} ${v.slice(11, 16)}`;
}

export function CreateSheet({
  open,
  onClose,
  teams,
  defaultTeam,
  region,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  teams: string[];
  defaultTeam: string | null;
  region: Region;
  onCreated: (id: string, team: string) => void;
}) {
  const [step, setStep] = useState<Step>("type");
  const [dir, setDir] = useState(1);
  const [template, setTemplate] = useState<Template>("meal");
  const [team, setTeam] = useState(defaultTeam ?? "");
  const [addingTeam, setAddingTeam] = useState(!teams.length);
  const [title, setTitle] = useState("");
  // 오후 6시가 지났으면 기본 날짜를 내일로
  const [date, setDate] = useState(() => (new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 16) >= "18:00" ? kstToday(1) : kstToday()));
  // 오전에는 점심, 그 이후에는 저녁을 기본 선택
  const [slot, setSlot] = useState<"lunch" | "dinner" | "custom">(() =>
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "numeric", hourCycle: "h23" }).format(new Date())) < 11
      ? "lunch"
      : "dinner",
  );
  const [time, setTime] = useState("19:00");
  const [deadlineMode, setDeadlineMode] = useState<"auto" | "custom">("auto");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [questions, setQuestions] = useState<DraftQ[]>(generalQuestions);
  const [roster, setRoster] = useState<string[]>([]);
  // 식사 모임 구성
  const [placeMode, setPlaceMode] = useState<"vote" | "fixed" | "none">("vote");
  const [candidatePlaces, setCandidatePlaces] = useState<Place[]>([]);
  const [fixedPlace, setFixedPlace] = useState<Place[]>([]);
  // 후보 투표면 메뉴는 항상 식당 확정 후 2차로 (한 번에 받기는 흐름이 복잡해 제거)
  const menuLater = true;
  const [askMenu, setAskMenu] = useState(false);
  const [menus, setMenus] = useState<string[]>([]);
  const [menuMulti, setMenuMulti] = useState(false);
  const [askNote, setAskNote] = useState(true);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [adminPin, setAdminPin] = useState("");
  // 다음 버튼을 눌렀는데 빠진 항목이 있으면 해당 칸을 강조
  const [tried, setTried] = useState<{ info?: boolean; questions?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

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
  // 마감 빠른 선택 (KST "YYYY-MM-DDTHH:MM"). 이미 지났거나 모임 뒤인 시각은 제외
  const deadlinePresets: [string, string][] = (
    isMeal && date
      ? [
          ["전날 17시", `${shiftDay(date, -1)}T17:00`],
          ["당일 10시", `${date}T10:00`],
          ["1시간 전", kstLocal(Date.parse(eventAt ?? "") - 3600_000)],
        ]
      : [
          ["오늘 18시", `${kstToday()}T18:00`],
          ["내일 18시", `${kstToday(1)}T18:00`],
          ["3일 뒤 18시", `${kstToday(3)}T18:00`],
        ]
  ).filter(([, v]) => {
    const t = Date.parse(`${v}:00+09:00`);
    return !!v && t > Date.now() && (!eventAt || t < Date.parse(eventAt));
  }) as [string, string][];

  const candidates = Array.from(new Set(candidatePlaces.map((p) => p.name)));
  const place = fixedPlace[0]?.name ?? "";
  const placeInfo = Object.fromEntries(
    (placeMode === "vote" ? candidatePlaces : placeMode === "fixed" ? fixedPlace : []).map((p) => [p.name, toSnap(p)]),
  );
  const menuSource = placeMode === "fixed" ? (fixedPlace[0]?.menus ?? []) : [];
  // 식당·메뉴 한 번에 받기: 후보 식당별 메뉴 → 선택지 라벨(식당 간 같은 이름이면 식당명 덧붙임)과 소속 식당
  const together = false;
  const dupLabels = (() => {
    const seen = new Map<string, number>();
    for (const p of candidatePlaces) for (const m of p.menus) seen.set(menuLabel(m), (seen.get(menuLabel(m)) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([l]) => l));
  })();
  const groupLabel = (p: Place, m: Place["menus"][number]) => (dupLabels.has(menuLabel(m)) ? `${menuLabel(m)} · ${p.name}`.slice(0, 40) : menuLabel(m));
  const menuGroups: Record<string, string> = {};
  if (together) for (const p of candidatePlaces) for (const m of p.menus) if (menus.includes(groupLabel(p, m))) menuGroups[groupLabel(p, m)] = p.name;
  const suggested = new Set(together ? candidatePlaces.flatMap((p) => p.menus.map((m) => groupLabel(p, m))) : menuSource.map(menuLabel));
  const mealQs: DraftQ[] = [
    { key: "a", kind: "attendance", title: "참석하시나요?", options: [] },
    ...(placeMode === "vote" && candidates.length ? [{ key: "r", kind: "multi" as const, title: "어느 식당이 좋으세요?", options: candidates, topic: "place" as const }] : []),
    ...(placeMode !== "vote" && askMenu && menus.length
      ? [{ key: "m", kind: (menuMulti ? "multi" : "single") as QuestionKind, title: "어떤 메뉴로 하시겠어요?", options: menus, topic: "menu" as const, optionGroups: together && Object.keys(menuGroups).length ? menuGroups : undefined }]
      : []),
    ...(askNote ? [{ key: "n", kind: "text" as const, title: "요청사항이 있으면 알려주세요", options: [] }] : []),
  ];
  const validQs = (isMeal ? mealQs : questions).filter((q) => (q.kind === "single" || q.kind === "multi" ? q.options.length > 0 : true) && (q.title.trim() || q.kind === "attendance"));
  const infoError = !team.trim()
    ? "팀을 선택해 주세요"
    : !finalTitle
      ? "제목을 입력해 주세요"
      : isMeal && eventAt && Date.parse(eventAt) < Date.now()
        ? "모임 시각이 이미 지났어요"
        : deadlineIso && Date.parse(deadlineIso) < Date.now()
          ? "마감 시각이 이미 지났어요"
          : deadlineIso && eventAt && Date.parse(deadlineIso) > Date.parse(eventAt)
            ? "마감은 모임 시작 전이어야 해요"
            : null;
  const qError = isMeal
    ? placeMode === "vote" && candidates.length < 2
      ? "식당 후보를 2곳 이상 입력해 주세요"
      : placeMode === "fixed" && !place.trim()
        ? "식당을 선택해 주세요"
        : placeMode !== "vote" && askMenu && menus.length === 0
          ? "메뉴를 1개 이상 넣거나 '메뉴도 받기'를 꺼 주세요"
          : null
    : validQs.length === 0 ? "질문과 선택지를 1개 이상 입력해 주세요" : questions.some((q) => (q.kind === "single" || q.kind === "multi") && q.options.length > 0 && !q.title.trim()) ? "질문 제목을 입력해 주세요" : null;

  const infoField = !team.trim() ? "team" : !finalTitle ? "title" : infoError?.includes("모임 시각") ? "date" : infoError ? "deadline" : null;
  const qField = isMeal ? (qError?.includes("메뉴") ? "menu" : "place") : "questions";
  function attempt(kind: "info" | "questions", error: string | null, field: string | null, next: Step) {
    if (!error) {
      setTried((t) => ({ ...t, [kind]: false }));
      return go(next);
    }
    setTried((t) => ({ ...t, [kind]: true }));
    flash(`f-${field}`); // 해당 칸으로 이동 + 강조
  }
  const ferr = (field: string) => (tried.info && infoField === field ? infoError : null);

  async function create(pinValue: string, adminPinValue: string) {
    setBusy(true);
    try {
      const body = {
        template,
        team: team.trim(),
        title: finalTitle,
        note: note.trim() || undefined,
        place: isMeal && placeMode === "fixed" ? place.trim() : undefined,
        placeInfo: isMeal ? placeInfo : undefined,
        region,
        roster: roster.length ? roster : undefined,
        eventAt,
        deadline: deadlineIso,
        pin: pinValue,
        questions: validQs.map((q) => ({ kind: q.kind, title: q.title.trim() || "참석하시나요?", options: q.options, topic: q.topic, optionGroups: q.optionGroups })),
        menuLater: isMeal && placeMode === "vote" && menuLater && candidates.length > 0,
        adminPin: adminPinValue,
      };
      const res = await api.create(body);
      local.set(keys.admin(res.id), res.adminToken);
      local.set(keys.team, body.team);
      setCreated({
        ...res,
        title: body.title,
        team: body.team,
        menuLater: isMeal && placeMode === "vote" && menuLater,
        stageLabel: isMeal && placeMode === "vote" && candidates.length ? "식당 투표 중" : isMeal && askMenu && menus.length ? "메뉴 선택 중" : isMeal ? "참석 확인 중" : "투표 중",
      });
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

  const stepIndex = { type: 0, info: 1, questions: 2, pin: 3, pin2: 3, admin: 3, done: 4 }[step];
  const prevStep: Partial<Record<Step, Step>> = { info: "type", questions: "info", pin: "questions", pin2: "pin", admin: "pin" };

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
                  <Field label="팀" id="f-team" error={ferr("team")}>
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

                  <Field label="참여 대상 명단" hint={roster.length ? `${roster.length}명` : "선택"}>
                    <RosterField region={region} names={roster} onChange={setRoster} defaultTitle={team.trim()} />
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
                      입력하면 참여자는 이름을 탭해서 고르고, 결과에서 미응답자를 확인할 수 있어요. 명단은 PIN을 입력한 사람만 볼 수 있어요.
                    </p>
                  </Field>

                  {isMeal && (
                    <>
                      <Field label="날짜" id="f-date" error={ferr("date")}>
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

                  <Field asLabel label="제목" id="f-title" error={ferr("title")} hint={isMeal ? "비워두면 자동으로 채워져요" : "PIN 없이 목록에 보여요"}>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={LIMITS.title}
                      placeholder={autoTitle || "예) 10월 워크숍 날짜 투표"}
                      className={inputCls}
                    />
                  </Field>

                  <Field label="응답 마감" id="f-deadline" error={ferr("deadline")}>
                    <Segmented
                      value={deadlineMode}
                      onChange={(m) => {
                        setDeadlineMode(m);
                        if (m === "custom") {
                          if (!deadline) setDeadline(deadlinePresets[0]?.[1] ?? "");
                          setTimeout(() => reveal(document.getElementById("f-deadline")), 80);
                        }
                      }}
                      options={[
                        { value: "auto", label: isMeal ? "모임 시작 시" : "직접 마감할 때까지" },
                        { value: "custom", label: "시각 지정", sub: deadlineMode === "custom" && deadline ? fmtLocal(deadline) : undefined },
                      ]}
                    />
                    {deadlineMode === "custom" && (
                      <div className="mt-2.5 rounded-2xl bg-ink/[0.035] p-3">
                        {deadlinePresets.length > 0 && (
                          <div className="mb-2.5 flex flex-wrap gap-2">
                            {deadlinePresets.map(([l, v]) => (
                              <Chip key={l} on={deadline === v} onClick={() => setDeadline(v)}>
                                {l}
                              </Chip>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
                          <input
                            type="date"
                            aria-label="마감 날짜"
                            value={deadline.slice(0, 10)}
                            min={kstToday()}
                            onChange={(e) => e.target.value && setDeadline(`${e.target.value}T${deadline.slice(11, 16) || "17:00"}`)}
                            className={cx(inputCls, "min-w-0 appearance-none px-3")}
                          />
                          <input
                            type="time"
                            aria-label="마감 시간"
                            value={deadline.slice(11, 16)}
                            step={600}
                            onChange={(e) => e.target.value && setDeadline(`${deadline.slice(0, 10) || kstToday()}T${e.target.value}`)}
                            className={cx(inputCls, "min-w-0 appearance-none px-3")}
                          />
                        </div>
                        {isMeal && (
                          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-2">
                            식당을 투표로 정하면 이 시각에 <b>1위 식당으로 확정되고 메뉴 투표가 자동으로 시작</b>돼요.
                          </p>
                        )}
                      </div>
                    )}
                  </Field>

                  <Field asLabel label="안내 메모" hint="선택">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={LIMITS.note}
                      rows={3}
                      placeholder="예) 법인카드 사용, 1인 3만원 이내"
                      // 키보드가 다 올라온 뒤 입력칸을 시트 안에서 보이는 위치로
                      onFocus={(e) => {
                        const el = e.currentTarget;
                        setTimeout(() => reveal(el), 350);
                      }}
                      className={textareaCls}
                    />
                  </Field>
                </div>
              </SheetBody>
              <SheetFooter>
                <Button className="w-full" onClick={() => attempt("info", infoError, infoField, "questions")}>
                  {(
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
                {isMeal ? (
                  <>
                <Head title="식당과 메뉴" sub="참석 여부는 항상 먼저 물어보고, 불참자에게는 식당·메뉴를 묻지 않아요." />
                <div className="space-y-6">
                  <Field label="식당" id="f-place" error={tried.questions && qField === "place" ? qError : null}>
                    <Segmented
                      value={placeMode}
                      onChange={setPlaceMode}
                      options={[
                        { value: "vote", label: "후보 투표" },
                        { value: "fixed", label: "이미 정함" },
                        { value: "none", label: "묻지 않음" },
                      ]}
                    />
                    <div className="mt-3">
                      {placeMode === "vote" && (
                        <PlacePicker
                          region={region}
                          mode="multi"
                          selected={candidatePlaces}
                          max={LIMITS.options}
                          onChange={(v) => {
                            // 빠진 식당의 메뉴는 선택지에서도 제거 (직접 입력한 공통 메뉴는 유지)
                            const keep = new Set(v.flatMap((p) => p.menus.map(menuLabel)));
                            setMenus((ms) => ms.filter((m) => !suggested.has(m) || keep.has(m) || [...keep].some((k) => m.startsWith(`${k} · `))));
                            setCandidatePlaces(v);
                          }}
                        />
                      )}
                      {placeMode === "fixed" && (
                        <PlacePicker
                          region={region}
                          mode="single"
                          selected={fixedPlace}
                          onChange={(v) => {
                            setFixedPlace(v);
                            // 식당을 고르면 대표 메뉴 6개를 선택지로 미리 채움 (탭으로 조정)
                            const ms = (v[0]?.menus ?? []).slice(0, LIMITS.options).map(menuLabel);
                            setMenus(ms);
                            setAskMenu(ms.length > 0);
                          }}
                        />
                      )}
                      {placeMode === "none" && <p className="text-[13px] text-ink-3">식당은 투표하지 않아요. 참석 여부와 메뉴만 받아요.</p>}
                    </div>
                  </Field>

                  <Field label="메뉴" id="f-menu" error={tried.questions && qField === "menu" ? qError : null}>
                    {placeMode === "vote" ? (
                      <div className="rounded-2xl bg-accent-soft px-4 py-3.5 text-[13.5px] leading-relaxed text-[#0b6b51]">
                        <b className="font-semibold">① 참석 + 식당 투표</b> → 마감되면 1위 식당 확정 → <b className="font-semibold">② 그 식당 메뉴로 메뉴 투표</b> (같은 링크)
                        <br />
                        메뉴는 확정된 식당의 메뉴가 자동으로 채워져요. 지금은 입력할 필요가 없어요.
                        <div className="mt-2.5 border-t border-[#0b6b51]/15 pt-2.5">
                          {deadlineMode === "custom" && deadline ? (
                            <p>
                              ⏰ <b className="font-semibold">{fmtLocal(deadline)}</b> 식당 투표 마감 → 메뉴 투표 <b className="font-semibold">자동 시작</b>
                            </p>
                          ) : (
                            <p>식당 투표 마감을 고르면 그 시각에 메뉴 투표가 자동으로 시작돼요. 안 고르면 관리자가 한 번 눌러 시작해요.</p>
                          )}
                          {deadlinePresets.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {deadlinePresets.map(([l, v]) => (
                                <button
                                  key={l}
                                  type="button"
                                  onClick={() => {
                                    setDeadlineMode("custom");
                                    setDeadline(v);
                                  }}
                                  className={cx(
                                    "rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-95",
                                    deadlineMode === "custom" && deadline === v ? "bg-[#0b6b51] text-white" : "bg-white/70 text-[#0b6b51]",
                                  )}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
                          <span>
                            <span className="block text-[14.5px] font-semibold">메뉴도 받기</span>
                            <span className="block text-[12.5px] text-ink-3">
                              {placeMode === "fixed" && fixedPlace[0]?.menus.length ? "이 식당 메뉴가 자동으로 채워져요" : "참여자가 먹을 메뉴를 골라요"}
                            </span>
                          </span>
                          <Toggle
                            checked={askMenu}
                            onChange={(v) => {
                              setAskMenu(v);
                              if (v && !menus.length && menuSource.length) setMenus(menuSource.slice(0, LIMITS.options).map(menuLabel));
                            }}
                            label=""
                            ariaLabel="메뉴도 받기"
                          />
                        </div>
                        {askMenu && (
                          <div className="mt-3">
                            <MenuSuggestions
                              title="탭해서 빼거나 넣기"
                              menus={menuSource}
                              selected={menus}
                              onToggle={(l) => setMenus(menus.includes(l) ? menus.filter((x) => x !== l) : [...menus, l].slice(0, LIMITS.options))}
                            />
                            <ChipsInput
                              values={menus.filter((m) => !suggested.has(m))}
                              onChange={(custom) => setMenus([...menus.filter((m) => suggested.has(m)), ...custom].slice(0, LIMITS.options))}
                              max={LIMITS.options}
                              maxLength={LIMITS.option}
                              label="메뉴"
                              placeholder="메뉴 추가"
                              emptyPlaceholder={menuSource.length ? "목록에 없는 메뉴 직접 추가" : "예) 김치찌개, 된장찌개 (쉼표로 여러 개)"}
                            />
                            <SaveMenus placeId={fixedPlace[0]?.id} placeName={fixedPlace[0]?.name ?? ""} labels={menus.filter((m) => !suggested.has(m))} />
                            {menus.length > 0 && (
                              <div className="mt-3">
                                <Toggle checked={menuMulti} onChange={setMenuMulti} label="복수 선택 허용" />
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </Field>

                  <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3.5">
                    <span>
                      <span className="block text-[14.5px] font-semibold">요청사항 받기</span>
                      <span className="block text-[12.5px] text-ink-3">알레르기, 늦참 등 자유 입력 (선택 응답)</span>
                    </span>
                    <Toggle checked={askNote} onChange={setAskNote} label="" ariaLabel="요청사항 받기" />
                  </div>

                  <FlowPreview
                    steps={[
                      ...(placeMode === "fixed" && place ? [{ t: `장소 안내 · ${place}`, s: "선택 없이 화면 위에 자동으로 보여줘요", auto: true }] : []),
                      { t: "이름 선택", s: roster.length ? "명단에서 탭" : "이름 입력" },
                      { t: "참석 여부", s: "참석 · 미정 · 불참" },
                      ...(placeMode === "vote" && candidates.length ? [{ t: `식당 투표 · ${candidates.length}곳`, s: "주소·대표메뉴와 함께 표시" }] : []),
                      ...(placeMode !== "vote" && askMenu && menus.length ? [{ t: `메뉴 선택 · ${menus.length}개`, s: menuMulti ? "복수 선택" : "하나만 선택" }] : []),
                      ...(placeMode === "vote" && menuLater ? [{ t: "식당 확정 후 → 2차 메뉴 투표", s: "관리자가 확정하면 열려요", later: true }] : []),
                      ...(askNote ? [{ t: "요청사항", s: "선택 응답 · 건너뛰기 가능" }] : []),
                    ]}
                  />
                </div>
                  </>
                ) : (
                  <>
                    <Head title="무엇을 물어볼까요?" sub="질문과 선택지를 입력하세요." />
                    {tried.questions && qError && (
                      <p id="f-questions" className="-mt-3 mb-4 rounded-xl bg-danger/5 px-3 py-2 text-[13px] font-medium text-danger">{qError}</p>
                    )}
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
                  </>
                )}
              </SheetBody>
              <SheetFooter>
                <Button className="w-full" onClick={() => attempt("questions", qError, qField, "pin")}>
                  {(
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
                  setPinMsg(null);
                  go("admin");
                  return true;
                }}
              />
            </SheetBody>
          )}

          {step === "admin" && (
            <SheetBody className="pb-safe">
              <PinPad
                tone="set"
                title="관리자 PIN을 정해주세요"
                subtitle={
                  busy ? (
                    "투표를 만드는 중…"
                  ) : (
                    <>
                      나만 아는 4자리 · <b className="font-semibold text-ink-2">참여 PIN과 다르게</b>
                      <br />
                      다른 폰·카톡 브라우저에서도 이 PIN으로 마감·대신 입력을 할 수 있어요
                    </>
                  )
                }
                message={pinMsg}
                onSubmit={async (v) => {
                  if (v === pin) {
                    setPinMsg("참여 PIN과 다른 번호로 정해 주세요");
                    return false;
                  }
                  setAdminPin(v);
                  return create(pin, v);
                }}
              />
            </SheetBody>
          )}

          {step === "done" && created && <CreatedView created={created} pin={pin} adminPin={adminPin} onClose={close} />}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

/** 생성자에게 '참여자는 이렇게 진행돼요'를 보여주는 미리보기 */
function FlowPreview({ steps }: { steps: { t: string; s: string; auto?: boolean; later?: boolean }[] }) {
  let n = 0;
  return (
    <div className="rounded-2xl bg-ink/[0.03] p-4">
      <p className="mb-3 flex items-center gap-1.5 text-[12.5px] font-bold text-ink-2">
        <Eye className="size-4" /> 참여자 화면 미리보기
      </p>
      <ol className="space-y-0">
        {steps.map((st, i) => (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-18px)] w-px bg-ink/10" />}
            <span
              className={cx(
                "relative flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                st.auto ? "bg-accent text-white" : st.later ? "border border-dashed border-ink/30 text-ink-3" : "bg-ink text-white",
              )}
            >
              {st.auto ? <MapPin className="size-3.5" /> : st.later ? "2" : ++n}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className={cx("block text-[14px] font-semibold", st.later && "text-ink-3")}>{st.t}</span>
              <span className="block text-[12px] text-ink-3">{st.s}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
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
  const choice = q.kind === "single" || q.kind === "multi";

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
          <div className="mt-3">
            <ChipsInput
              values={q.options}
              onChange={(options) => onChange({ ...q, options })}
              max={LIMITS.options}
              maxLength={LIMITS.option}
              label="선택지"
              placeholder="선택지 추가"
              emptyPlaceholder="선택지 입력 후 추가 (쉼표로 여러 개)"
            />
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
  adminPin,
  onClose,
}: {
  created: Created;
  pin: string;
  adminPin: string;
  onClose: () => void;
}) {
  const url = typeof window !== "undefined" ? pollUrl(created.id) : "";
  const baseText = shareText({ team: created.team, title: created.title, stageLabel: created.stageLabel });
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[12.5px] font-semibold text-white/55">참여 PIN · 팀원 공유</p>
              <p className="mt-1 text-[30px] font-bold tracking-[0.25em] tabular-nums">{pin}</p>
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-[#f5c96a]">관리자 PIN · 나만</p>
              <p className="mt-1 text-[30px] font-bold tracking-[0.25em] tabular-nums text-[#f5c96a]">{adminPin}</p>
            </div>
          </div>
          <p className="mt-3 break-all text-[13px] text-white/60">{url}</p>
        </div>

        <div className="mt-3 grid gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={async () => {
              const r = await shareLink(url, created.title, `${baseText}\n🔒 참여 PIN은 별도로 안내드려요`);
              if (r === "copied") toast("링크를 복사했어요");
            }}
          >
            <Share2 className="size-4" /> 링크만 공유 (PIN 별도 안내)
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={async () => {
              const ok = await copyText(`${baseText}\n🔒 참여 PIN: ${pin}\n👉 ${url}`);
              toast(ok ? "PIN 포함 메시지를 복사했어요" : "복사에 실패했어요");
            }}
          >
            <ClipboardCopy className="size-4" /> PIN 포함 메시지 복사
          </Button>
        </div>

        {created.menuLater && (
          <div className="mt-5 rounded-2xl bg-accent-soft p-4 text-[13px] leading-relaxed text-[#0b6b51]">
            <b className="font-semibold">다음 단계</b> — 식당 투표가 모이면 카드를 열고 결과 화면의 <b className="font-semibold">&lsquo;식당 확정&rsquo;</b>을 눌러 메뉴 투표를 시작하세요.
          </div>
        )}

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
