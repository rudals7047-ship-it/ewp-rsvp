"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton, cx, useMediaQuery } from "./ui";

export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const controls = useDragControls();
  const desktop = useMediaQuery("(min-width: 640px)");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panel = useRef<HTMLDivElement>(null);
  // 키보드가 올라오면 보이는 영역(visualViewport)에 시트를 맞춤.
  // iOS는 키보드가 뜰 때 화면 전체를 밀어 올리는데, 이때 고정(fixed) 시트 안 입력칸의 커서가 엉뚱한 곳에 그려지는 문제가 있음
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const v = typeof window !== "undefined" ? window.visualViewport : null;
    if (!open || !v) return;
    const sync = () => setVv(v.height < window.innerHeight - 1 || v.offsetTop > 0 ? { h: v.height, top: v.offsetTop } : null);
    sync();
    v.addEventListener("resize", sync);
    v.addEventListener("scroll", sync);
    return () => {
      v.removeEventListener("resize", sync);
      v.removeEventListener("scroll", sync);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    // 접근성: 열리면 시트로 포커스 이동, 닫히면 원래 위치로 복귀
    const opener = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          style={vv ? { top: vv.top, height: vv.h, bottom: "auto" } : undefined}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <motion.div
            className="absolute inset-0 bg-[#0e1116]/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            tabIndex={-1}
            className="relative flex max-h-[94%] outline-none w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-lift sm:max-h-[min(88dvh,820px)] sm:max-w-[440px] sm:rounded-[28px]"
            initial={desktop ? { opacity: 0, scale: 0.96, y: 16 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.97, y: 8 } : { y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 360 }}
            drag={desktop ? false : "y"}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 700) onClose();
            }}
          >
            <div
              onPointerDown={(e) => controls.start(e)}
              className="flex shrink-0 touch-none justify-center pb-1 pt-2.5 sm:hidden"
              aria-hidden
            >
              <div className="h-[5px] w-10 rounded-full bg-ink/15" />
            </div>
            <IconButton label="닫기" onClick={onClose} className="absolute right-2.5 top-[27px] z-10 bg-surface/90 backdrop-blur sm:right-3 sm:top-4">
              <X className="size-5" />
            </IconButton>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function SheetBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-7", className)}>{children}</div>;
}

export function SheetFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  // className에 pb-가 있으면 안전영역 패딩(pb-safe) 대신 사용 (하단 고정 바 위에 놓일 때)
  return (
    <div className={cx(!className?.includes("pb-") && "pb-safe", "shrink-0 border-t border-line/60 bg-surface px-5 pt-3 sm:px-7", className)}>{children}</div>
  );
}
