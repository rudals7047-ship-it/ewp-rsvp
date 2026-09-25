"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { cx } from "./ui";

/** 칩 목록 입력: Enter/+ 로 추가, 쉼표·줄바꿈으로 여러 개 한 번에 붙여넣기 */
export function ChipsInput({
  values,
  onChange,
  max,
  maxLength,
  placeholder,
  emptyPlaceholder,
  label = "항목",
}: {
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  maxLength: number;
  placeholder: string;
  emptyPlaceholder?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const items = raw
      .split(/[,\n]/)
      .map((s) => s.trim().replace(/\s+/g, " ").slice(0, maxLength))
      .filter(Boolean);
    if (!items.length) return;
    onChange(Array.from(new Set([...values, ...items])).slice(0, max));
    setDraft("");
  }

  const full = values.length >= max;

  return (
    <div>
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((o) => (
            <span key={o} className="inline-flex max-w-full items-center gap-1 rounded-full bg-ink/[0.06] py-1 pl-3 pr-1 text-[14px] font-medium">
              <span className="truncate">{o}</span>
              <button
                type="button"
                aria-label={`${o} 삭제`}
                onClick={() => onChange(values.filter((x) => x !== o))}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-ink/10"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {!full && (
        <div className="flex gap-2">
          <input
            value={draft}
            aria-label={`${label} 추가`}
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
            placeholder={values.length ? placeholder : (emptyPlaceholder ?? placeholder)}
            className="h-11 min-w-0 flex-1 rounded-xl bg-ink/[0.04] px-3.5 text-[16px] outline-none placeholder:text-ink-3/80 focus:bg-ink/[0.06]"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => add(draft)}
            disabled={!draft.trim()}
            aria-label={`${label} 추가`}
            className={cx(
              "flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white transition",
              "disabled:bg-ink/10 disabled:text-ink-3",
            )}
          >
            <Plus className="size-5" />
          </button>
        </div>
      )}
      {full && <p className="text-[12.5px] text-ink-3">최대 {max}개까지 입력할 수 있어요.</p>}
    </div>
  );
}
