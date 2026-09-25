"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
          <motion.div
            className="absolute inset-0 bg-[#0e1116]/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-lift sm:max-h-[min(88dvh,820px)] sm:max-w-[440px] sm:rounded-[28px]"
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
  return <div className={cx("pb-safe shrink-0 border-t border-line/60 bg-surface px-5 pt-3 sm:px-7", className)}>{children}</div>;
}
