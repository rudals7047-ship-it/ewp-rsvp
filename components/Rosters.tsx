"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Lock, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/client";
import { LIMITS } from "@/lib/poll";
import type { Region } from "@/lib/places";
import type { RosterSummary } from "@/lib/types";
import { ChipsInput } from "./ChipsInput";
import { Button, cx, toast } from "./ui";

const pinCls =
  "h-11 w-[92px] shrink-0 rounded-xl bg-ink/[0.04] px-3 text-center text-[18px] font-bold tracking-[0.4em] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:tracking-normal placeholder:text-ink-3/80 focus:bg-ink/[0.06]";

function PinInput({ value, onChange, onEnter, label }: { value: string; onChange: (v: string) => void; onEnter?: () => void; label: string }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      maxLength={4}
      aria-label={label}
      placeholder="PIN"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      onKeyDown={(e) => e.key === "Enter" && value.length === 4 && onEnter?.()}
      className={pinCls}
    />
  );
}

/**
 * 참석자 명단: 보관함에서 PIN으로 불러오기 + 직접 입력 + 보관함에 저장
 * 보관함 목록에는 제목만 보이고, 실명은 PIN 인증 후에만 받아온다.
 */
export function RosterField({
  region,
  names,
  onChange,
  defaultTitle,
}: {
  region: Region;
  names: string[];
  onChange: (v: string[]) => void;
  defaultTitle: string;
}) {
  const [lists, setLists] = useState<RosterSummary[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // 불러온 명단(수정 저장용). PIN은 메모리에만 보관
  const [source, setSource] = useState<{ id: string; title: string; pin: string; names: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [savePin, setSavePin] = useState("");

  useEffect(() => {
    api
      .rosters(region)
      .then(({ rosters }) => setLists(rosters))
      .catch(() => setLists([]));
  }, [region]);

  async function open(r: RosterSummary) {
    if (pin.length !== 4) return;
    setBusy(true);
    try {
      const res = await api.roster(r.id, { pin, action: "open" });
      onChange(res.names ?? []);
      setSource({ id: r.id, title: r.title, pin, names: res.names ?? [] });
      setOpening(null);
      setPin("");
      toast(`'${r.title}' 명단 ${res.names?.length ?? 0}명을 불러왔어요`);
    } catch (e) {
      toast(e instanceof ApiError ? (e.data.attemptsLeft !== undefined ? `PIN이 일치하지 않아요 (남은 시도 ${e.data.attemptsLeft}회)` : e.message) : "불러오지 못했어요");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  async function saveNew() {
    setBusy(true);
    try {
      const { roster } = await api.createRoster({ region, title: saveTitle.trim(), names, pin: savePin });
      setLists((l) => [roster, ...(l ?? [])]);
      setSource({ id: roster.id, title: roster.title, pin: savePin, names });
      setSaving(false);
      setSavePin("");
      toast("명단 보관함에 저장했어요. 다음부터 PIN으로 불러올 수 있어요");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  async function saveUpdate() {
    if (!source) return;
    setBusy(true);
    try {
      await api.roster(source.id, { pin: source.pin, action: "update", names });
      setSource({ ...source, names });
      toast(`'${source.title}' 명단을 업데이트했어요`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  const changed = source && (source.names.length !== names.length || source.names.some((n, i) => n !== names[i]));

  return (
    <div>
      {lists && lists.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 flex items-center gap-1 text-[12.5px] font-semibold text-ink-3">
            <Lock className="size-3.5" /> 명단 보관함 · PIN으로 불러오기
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lists.map((r) => {
              const on = source?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setOpening(opening === r.id ? null : r.id);
                    setPin("");
                  }}
                  className={cx(
                    "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition active:scale-95",
                    on ? "bg-ink text-white" : opening === r.id ? "bg-ink/[0.1] text-ink" : "bg-ink/[0.05] text-ink-2",
                  )}
                >
                  {on ? <Check className="size-3.5" strokeWidth={3} /> : <Users className="size-3.5" />}
                  {r.title}
                </button>
              );
            })}
          </div>
          <AnimatePresence>
            {opening && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line p-2">
                  <PinInput label="명단 PIN" value={pin} onChange={setPin} onEnter={() => open(lists.find((x) => x.id === opening)!)} />
                  <Button size="md" className="flex-1" loading={busy} disabled={pin.length !== 4} onClick={() => open(lists.find((x) => x.id === opening)!)}>
                    명단 불러오기
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <ChipsInput
        values={names}
        onChange={onChange}
        max={LIMITS.roster}
        maxLength={LIMITS.name}
        label="이름"
        placeholder="이름 추가"
        emptyPlaceholder="예) 김민준, 이서연 (쉼표로 여러 명)"
      />

      {names.length > 0 && (
        <div className="mt-2.5">
          {source && changed ? (
            <button type="button" disabled={busy} onClick={saveUpdate} className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 underline underline-offset-4">
              <Save className="size-3.5" /> &lsquo;{source.title}&rsquo; 명단에 변경사항 저장
            </button>
          ) : !source && !saving ? (
            <button
              type="button"
              onClick={() => {
                setSaving(true);
                setSaveTitle(defaultTitle);
              }}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-2 underline underline-offset-4"
            >
              <Save className="size-3.5" /> 이 명단을 보관함에 저장 (다음에 재사용)
            </button>
          ) : null}
          {saving && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-1 rounded-2xl border border-line p-3">
              <p className="mb-2 text-[12.5px] leading-relaxed text-ink-3">보관함에는 제목만 공개돼요. 이름은 이 PIN을 아는 사람만 불러올 수 있어요.</p>
              <div className="flex gap-2">
                <input
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  maxLength={LIMITS.team}
                  aria-label="명단 이름"
                  placeholder="명단 이름 (예: 회계세무부)"
                  className="h-11 min-w-0 flex-1 rounded-xl bg-ink/[0.04] px-3 text-[16px] outline-none focus:bg-ink/[0.06]"
                />
                <PinInput label="명단 PIN" value={savePin} onChange={setSavePin} />
              </div>
              <div className="mt-2 grid grid-cols-[1fr_1.6fr] gap-2">
                <Button variant="secondary" size="md" onClick={() => setSaving(false)}>
                  취소
                </Button>
                <Button size="md" loading={busy} disabled={!saveTitle.trim() || savePin.length !== 4} onClick={saveNew}>
                  보관함에 저장
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
