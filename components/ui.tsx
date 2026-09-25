"use client";

import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "lg",
  loading,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition-[transform,background-color,opacity,box-shadow] duration-200 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100",
        size === "lg" ? "h-14 px-6 text-[16px]" : "h-11 px-4 text-[15px]",
        variant === "primary" && "bg-ink text-white hover:bg-ink/90",
        variant === "secondary" && "bg-ink/[0.05] text-ink hover:bg-ink/[0.08]",
        variant === "ghost" && "text-ink-2 hover:bg-ink/[0.04]",
        variant === "danger" && "bg-danger/10 text-danger hover:bg-danger/15",
        className,
      )}
    >
      {loading ? <Loader2 className="size-5 animate-spin" /> : children}
    </button>
  );
}

export function IconButton({
  className,
  label,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "inline-flex size-10 items-center justify-center rounded-full text-ink-2 transition hover:bg-ink/[0.05] active:scale-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub?: string }[];
}) {
  return (
    <div className="flex gap-1 rounded-2xl bg-ink/[0.05] p-1" role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative flex-1 rounded-xl px-2 py-2.5 text-center text-[14px] font-semibold transition",
              on ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${options.map((x) => x.value).join()}`}
                className="absolute inset-0 rounded-xl bg-surface shadow-soft"
                transition={{ type: "spring", damping: 30, stiffness: 400 }}
              />
            )}
            <span className="relative block leading-tight">{o.label}</span>
            {o.sub && <span className="relative block text-[11px] font-medium text-ink-3">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || ariaLabel}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-2"
    >
      <span
        className={cx(
          "relative h-[22px] w-[38px] rounded-full transition-colors",
          checked ? "bg-accent" : "bg-ink/15",
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] size-[18px] rounded-full bg-white shadow transition-[left]",
            checked ? "left-[18px]" : "left-[2px]",
          )}
        />
      </span>
      {label}
    </button>
  );
}

/** input 하나만 감쌀 때는 asLabel, 버튼 묶음은 div(group)로 렌더 (label 안 버튼 오작동 방지) */
export function Field({
  label,
  hint,
  asLabel,
  id,
  error,
  children,
}: {
  label: string;
  hint?: string;
  asLabel?: boolean;
  id?: string;
  /** 제출 시도 후 누락 안내 (빨간 강조) */
  error?: string | null;
  children: React.ReactNode;
}) {
  const Tag = asLabel ? "label" : "div";
  return (
    <Tag
      id={id}
      className={cx("block scroll-mt-24 rounded-2xl transition", error && "-mx-2 -mt-2 bg-danger/[0.04] p-2 ring-2 ring-danger/70")}
      {...(asLabel ? {} : { role: "group", "aria-label": label })}
    >
      <span className="mb-2 flex items-baseline justify-between">
        <span className={cx("text-[13px] font-semibold", error ? "text-danger" : "text-ink-2")}>{label}</span>
        {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-2 block text-[12.5px] font-medium text-danger">{error}</span>}
    </Tag>
  );
}

/** 여러 줄 입력칸 (inputCls의 고정 높이 h-13을 쓰지 않음 → 커서 위치 어긋남 방지) */
export const textareaCls =
  "block w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-ink-3/80 outline-none transition focus:border-ink/30 focus:ring-4 focus:ring-ink/[0.05]";

export const inputCls =
  "h-13 w-full rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink placeholder:text-ink-3/80 outline-none transition focus:border-ink/30 focus:ring-4 focus:ring-ink/[0.05]";

/**
 * 시트 안의 스크롤 영역만 움직여 요소를 보이게 함.
 * (scrollIntoView는 overflow-hidden인 바깥 시트까지 밀어 내용이 잘리는 문제가 있음)
 */
export function reveal(el: Element | null | undefined, block: "center" | "start" = "center") {
  if (!el) return;
  let box = el.parentElement;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const offset = r.top - b.top + box.scrollTop;
  const top = block === "center" ? offset - box.clientHeight / 2 + r.height / 2 : offset - 12;
  box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/**
 * 비활성 버튼 대신: 눌렀을 때 입력·선택해야 할 첫 번째 칸으로 이동해 강조(빨간 테두리 + 흔들림)하고 안내
 */
export function flash(id: string, message?: string) {
  const el = document.getElementById(id);
  if (message) toast(message);
  if (!el) return;
  reveal(el);
  el.classList.remove("attention");
  void el.offsetWidth; // 애니메이션 재시작
  el.classList.add("attention");
  setTimeout(() => el.classList.remove("attention"), 1600);
  const input = el.matches("input,textarea") ? (el as HTMLInputElement) : el.querySelector<HTMLInputElement>("input,textarea");
  // 검색 드롭다운(combobox)은 포커스하면 목록이 열려 안내를 가리므로 강조만
  if (input && input.getAttribute("role") !== "combobox") input.focus({ preventScroll: true });
}

/* ---------- Toast ---------- */

type ToastMsg = { id: number; text: string };
let toasts: ToastMsg[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function toast(text: string) {
  const id = Date.now() + Math.random();
  toasts = [...toasts.slice(-2), { id, text }];
  emit();
  // 긴 안내는 읽을 시간만큼 더 오래 표시
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, Math.min(6000, Math.max(2400, text.length * 70)));
}

export function Toaster() {
  const list = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="rounded-full bg-ink px-4 py-2.5 text-[14px] font-medium text-white shadow-lift"
            role="status"
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------- hooks ---------- */

export function useMediaQuery(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    setM(mq.matches);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 기존 저장본을 바꾸기 전 재확인 (무엇이 바뀌는지 보여주고 한 번 더 누르게) */
export function ConfirmCard({
  title,
  lines,
  note,
  confirmLabel = "바꾸기",
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  lines: string[];
  note?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div role="alertdialog" aria-label={title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border-2 border-[#f0d9a8] bg-[#fdf8ee] p-4">
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {lines.length > 0 && (
        <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-ink-2">
          {lines.map((l, i) => (
            <li key={i} className="break-keep">
              • {l}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{note}</p>}
      <div className="mt-3 grid grid-cols-[1fr_1.4fr] gap-2">
        <Button variant="secondary" size="md" onClick={onCancel}>
          취소
        </Button>
        <Button size="md" loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </motion.div>
  );
}
