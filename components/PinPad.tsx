"use client";

import { motion, useAnimationControls } from "motion/react";
import { Delete, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { vibrate } from "@/lib/client";
import { cx } from "./ui";

/**
 * 4자리 PIN 입력 키패드. onSubmit이 false를 반환하면 흔들림 + 초기화.
 */
export function PinPad({
  title,
  subtitle,
  onSubmit,
  message,
  tone = "lock",
}: {
  title: string;
  subtitle?: React.ReactNode;
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  message?: string | null;
  tone?: "lock" | "set";
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const shake = useAnimationControls();
  const busyRef = useRef(false);

  const submit = useCallback(
    async (value: string) => {
      busyRef.current = true;
      setBusy(true);
      const ok = await onSubmit(value);
      busyRef.current = false;
      setBusy(false);
      if (ok) {
        if (tone === "lock") setUnlocked(true);
        vibrate(10);
        setPin("");
      } else {
        vibrate(60);
        await shake.start({ x: [0, -12, 12, -8, 8, -4, 0], transition: { duration: 0.42 } });
        setPin("");
      }
    },
    [onSubmit, shake, tone],
  );

  const press = useCallback(
    (d: string) => {
      if (busyRef.current) return;
      vibrate(6);
      setPin((p) => (p.length >= 4 ? p : p + d));
    },
    [],
  );

  useEffect(() => {
    if (pin.length !== 4 || busyRef.current) return;
    const t = setTimeout(() => submit(pin), 120);
    return () => clearTimeout(t);
  }, [pin, submit]);
  const back = useCallback(() => !busyRef.current && setPin((p) => p.slice(0, -1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, back]);

  const Icon = unlocked ? LockOpen : tone === "set" ? ShieldCheck : Lock;

  return (
    <div className="flex flex-col items-center pb-2 pt-4">
      <motion.div
        key={unlocked ? "open" : "closed"}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cx(
          "mb-4 flex size-14 items-center justify-center rounded-2xl",
          unlocked ? "bg-accent text-white" : "bg-ink text-white",
        )}
      >
        <Icon className="size-6" strokeWidth={2.2} />
      </motion.div>
      <h2 className="text-center text-[20px] font-bold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1.5 text-center text-[14px] leading-relaxed text-ink-3">{subtitle}</p>}

      <motion.div animate={shake} className="my-7 flex gap-4" aria-live="polite" aria-label={`${pin.length}자리 입력됨`}>
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            animate={{ scale: pin.length === i + 1 ? [1, 1.25, 1] : 1 }}
            transition={{ duration: 0.18 }}
            className={cx(
              "size-3.5 rounded-full transition-colors duration-150",
              pin.length > i ? (busy ? "bg-ink/40" : "bg-ink") : "bg-ink/12",
            )}
          />
        ))}
      </motion.div>

      <p className={cx("mb-4 h-5 text-[13px] font-medium", message ? "text-danger" : "text-transparent")}>
        {message || "."}
      </p>

      <div className="grid w-full max-w-[300px] grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <span />
        <Key onClick={() => press("0")}>0</Key>
        <Key onClick={back} label="지우기" subtle>
          <Delete className="size-6" />
        </Key>
      </div>
    </div>
  );
}

function Key({
  children,
  onClick,
  label,
  subtle,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label?: string;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cx(
        "flex h-[60px] items-center justify-center rounded-2xl text-[24px] font-semibold tabular-nums transition active:scale-95",
        subtle ? "text-ink-2 active:bg-ink/[0.06]" : "bg-ink/[0.04] text-ink active:bg-ink/[0.1] hover:bg-ink/[0.06]",
      )}
    >
      {children}
    </button>
  );
}
