"use client";

import confetti from "canvas-confetti";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, keys, local, session, track, vibrate } from "@/lib/client";
import { nameKey, pendingQuestions } from "@/lib/poll";
import type { Answer, PollDetail, PollSummary } from "@/lib/types";
import { PinPad } from "./PinPad";
import { Results } from "./Results";
import { Sheet, SheetBody, SheetFooter } from "./Sheet";
import { VoteFlow } from "./VoteFlow";
import { Button } from "./ui";

type Phase = "loading" | "pin" | "vote" | "done" | "results";

export function PollSheet({
  summary,
  onClose,
  onUpdated,
  onDeleted,
}: {
  summary: PollSummary | null;
  onClose: () => void;
  onUpdated: (p: PollDetail) => void;
  onDeleted: (id: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [poll, setPoll] = useState<PollDetail | null>(null);
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [myAnswers, setMyAnswers] = useState<Record<string, Answer> | null>(null);
  const id = summary?.id;

  const route = useCallback((p: PollDetail) => {
    const name = local.get(keys.name);
    // 이 기기에서 작성한 응답이 우선, 없으면 저장된 이름으로 (다른 기기가 잠근 응답은 제외)
    const mine = p.responses.find((r) => r.own) ?? (name ? p.responses.find((r) => !r.locked && nameKey(r.name) === nameKey(name)) : undefined);
    setMyName(mine?.name ?? name);
    const needs = !mine || pendingQuestions(p, mine.answers).length > 0;
    if (mine && !needs) local.set(`done:${p.id}`, String(p.round));
    // 만든 사람(관리자)은 관리/결과 화면부터: 참여는 하단 버튼으로
    const isAdmin = !!local.get(keys.admin(p.id));
    setPhase(p.status === "open" && needs && !isAdmin ? "vote" : "results");
  }, []);

  const accept = useCallback(
    (p: PollDetail) => {
      setPoll(p);
      onUpdated(p);
    },
    [onUpdated],
  );

  // 열릴 때: 저장된 인증 토큰이 있으면 바로 조회, 아니면 PIN 입력
  useEffect(() => {
    if (!id) return;
    setPoll(null);
    setPinMsg(null);
    const hasToken = session.get(keys.access(id)) || local.get(keys.admin(id));
    if (!hasToken) {
      setPhase("pin");
      return;
    }
    setPhase("loading");
    let alive = true;
    api
      .detail(id)
      .then(({ poll }) => {
        if (!alive) return;
        accept(poll);
        route(poll);
      })
      .catch(() => alive && setPhase("pin"));
    return () => {
      alive = false;
    };
  }, [id, accept, route]);

  // 결과 화면에서는 실시간에 가깝게 갱신
  useEffect(() => {
    if (!id || phase !== "results") return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api.detail(id).then(({ poll }) => accept(poll)).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [id, phase, accept]);

  const unlock = useCallback(
    async (pin: string) => {
      if (!id) return false;
      try {
        const { token, poll } = await api.unlock(id, pin);
        session.set(keys.access(id), token);
        setPinMsg(null);
        accept(poll);
        track("pin-unlock");
        setTimeout(() => route(poll), 380); // 잠금 해제 애니메이션을 보여준 뒤 이동
        return true;
      } catch (e) {
        if (e instanceof ApiError) {
          const left = e.data.attemptsLeft as number | undefined;
          setPinMsg(e.status === 401 && left !== undefined ? `PIN이 일치하지 않아요 (남은 시도 ${left}회)` : e.message);
        } else setPinMsg("문제가 발생했어요.");
        return false;
      }
    },
    [id, accept, route],
  );

  return (
    <Sheet open={!!summary} onClose={onClose} label={summary?.title ?? "투표"}>
      {phase === "loading" && (
        <div className="flex h-[360px] items-center justify-center">
          <Loader2 className="size-7 animate-spin text-ink-3" />
        </div>
      )}
      {phase === "pin" && summary && (
        <SheetBody className="pb-safe">
          <PinPad
            title="PIN 4자리를 입력하세요"
            subtitle={
              <>
                <b className="font-semibold text-ink-2">{summary.title}</b>
                <br />
                투표 생성자가 공유한 PIN으로 보호되어 있어요
              </>
            }
            message={pinMsg}
            onSubmit={unlock}
          />
        </SheetBody>
      )}
      {phase === "vote" && poll && (
        <VoteFlow
          poll={poll}
          onCancel={() => (poll.responses.length || poll.status !== "open" ? setPhase("results") : onClose())}
          onDone={(p, name, answers) => {
            accept(p);
            setMyName(name);
            setMyAnswers(answers);
            local.set(`done:${p.id}`, String(p.round));
            track("vote-complete");
            setPhase("done");
          }}
        />
      )}
      {phase === "done" && poll && (
        <Done poll={poll} name={myName ?? ""} answers={myAnswers ?? {}} onResults={() => setPhase("results")} onClose={onClose} />
      )}
      {phase === "results" && poll && (
        <Results
          poll={poll}
          myName={myName}
          onEdit={() => setPhase("vote")}
          onChange={accept}
          onDeleted={() => {
            onDeleted(poll.id);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function Done({
  poll,
  name,
  answers,
  onResults,
  onClose,
}: {
  poll: PollDetail;
  name: string;
  answers: Record<string, Answer>;
  onResults: () => void;
  onClose: () => void;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    vibrate(25);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const colors = ["#0f9d76", "#34d399", "#0e1116", "#f5c96a", "#ffffff"];
    confetti({ particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.62 }, colors, zIndex: 200, scalar: 0.9 });
    setTimeout(
      () => confetti({ particleCount: 40, spread: 100, startVelocity: 28, origin: { y: 0.55 }, colors, zIndex: 200, scalar: 0.8 }),
      180,
    );
  }, []);

  const chips = poll.questions.flatMap((q) => {
    const v = answers[q.id];
    if (!v || (Array.isArray(v) && !v.length)) return [];
    return [{ q: q.title, v: Array.isArray(v) ? v.join(", ") : v }];
  });

  return (
    <>
      <SheetBody className="pb-4 pt-8">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 12, stiffness: 220 }}
            className="relative flex size-20 items-center justify-center rounded-full bg-accent shadow-[0_12px_40px_-8px_rgb(15_157_118/0.6)]"
          >
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-accent"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.9, delay: 0.2 }}
            />
            <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, delay: 0.18, ease: "easeOut" }}
              />
            </svg>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6 text-[24px] font-bold tracking-tight"
          >
            응답 완료!
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-1.5 text-[15px] text-ink-3">
            {name}님의 응답이 안전하게 저장됐어요
          </motion.p>
        </div>

        {chips.length > 0 && (
          <motion.dl
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="mt-7 divide-y divide-line rounded-2xl bg-ink/[0.03] px-4"
          >
            {chips.map((c) => (
              <div key={c.q} className="flex gap-3 py-3 text-[14px]">
                <dt className="w-[42%] shrink-0 text-ink-3">{c.q}</dt>
                <dd className="min-w-0 flex-1 text-right font-semibold break-keep">{c.v}</dd>
              </div>
            ))}
          </motion.dl>
        )}
      </SheetBody>
      <SheetFooter className="grid grid-cols-[1fr_1.4fr] gap-2">
        <Button variant="secondary" onClick={onClose}>
          닫기
        </Button>
        <Button onClick={onResults}>결과 보기</Button>
      </SheetFooter>
    </>
  );
}
