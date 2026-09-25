"use client";

import { AnimatePresence, motion } from "motion/react";
import { Database, MapPin, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, keys, local, session } from "@/lib/client";
import { REGIONS, type Region, regionOf } from "@/lib/places";
import { teamKey } from "@/lib/poll";
import type { PollDetail, PollSummary } from "@/lib/types";
import { CreateSheet } from "./CreateSheet";
import { CardSkeleton, PollCard } from "./PollCard";
import { PollSheet } from "./PollSheet";
import { MasterSheet } from "./Master";
import { GuideSheet } from "./Guide";
import { Button, Toaster, cx, toast, useNow } from "./ui";

const ALL = "__all__";

export function Home({ initialPollId }: { initialPollId?: string }) {
  const [polls, setPolls] = useState<PollSummary[] | null>(null);
  const [storage, setStorage] = useState<"redis" | "memory">("redis");
  const [team, setTeam] = useState<string>(ALL);
  const [region, setRegion] = useState<Region>("ulsan");
  const [openPoll, setOpenPoll] = useState<PollSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [, force] = useState(0);
  const [showAllDone, setShowAllDone] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [teamQuery, setTeamQuery] = useState("");
  const [masterOn, setMasterOn] = useState<boolean | null>(null); // null: 기능 꺼짐
  const [masterOpen, setMasterOpen] = useState(false);
  useEffect(() => {
    api
      .masterStatus()
      .then((r) => {
        if (!r.enabled) return setMasterOn(null);
        if (!r.active) session.del(keys.master);
        setMasterOn(r.active);
      })
      .catch(() => {});
  }, []);
  const pending = useRef(initialPollId);
  const now = useNow();

  const load = useCallback(async () => {
    try {
      const res = await api.list();
      setPolls(res.polls);
      setStorage(res.storage);
      return res.polls;
    } catch {
      setPolls((p) => {
        if (p === null) toast("목록을 불러오지 못했어요"); // 주기적 갱신 실패로 토스트가 반복되지 않도록
        return p ?? [];
      });
      return null;
    }
  }, []);

  // 초기화: 팀 선택 복원, 관리 링크(#admin=) 처리, 목록 로드
  useEffect(() => {
    // 개인정보: 예전 버전이 기기에 저장한 명단(실명)을 정리
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("roster:")) localStorage.removeItem(k);
    } catch {}
    const site = new URLSearchParams(location.search).get("site") ?? local.get(keys.region);
    if (site) setRegion(regionOf(site));
    const q = new URLSearchParams(location.search).get("team");
    const saved = q ?? local.get(keys.team);
    if (saved) setTeam(saved);
    const m = location.hash.match(/admin=([\w-]+)/);
    if (m && initialPollId) {
      local.set(keys.admin(initialPollId), m[1]);
      history.replaceState(history.state, "", location.pathname + location.search);
      toast("관리자 권한이 이 기기에 저장됐어요");
    }
    load();
  }, [initialPollId, load]);

  // 주기적 갱신
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && load(), 30000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // 공유 링크(/p/:id)로 들어온 경우 해당 카드 자동 열기
  useEffect(() => {
    if (!polls || !pending.current) return;
    const p = polls.find((x) => x.id === pending.current);
    pending.current = undefined;
    if (p) {
      if (p.region !== region) setRegion(p.region);
      setOpenPoll(p);
    } else {
      toast("투표를 찾을 수 없어요");
      history.replaceState(null, "", "/");
    }
  }, [polls]);

  // 뒤로가기로 시트 닫기
  useEffect(() => {
    const onPop = () => {
      if (!history.state?.sheet) setOpenPoll(null);
      if (!history.state?.create) setCreateOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openCard = (p: PollSummary) => {
    history.pushState({ sheet: p.id }, "", `/p/${p.id}`);
    setOpenPoll(p);
  };
  const closeCard = useCallback(() => {
    setOpenPoll(null);
    if (history.state?.sheet) history.back();
    else if (location.pathname !== "/") history.replaceState(null, "", "/");
    force((n) => n + 1); // 응답함/관리자 배지 갱신
  }, []);

  const selectTeam = (t: string) => {
    setTeam(t);
    if (t === ALL) local.del(keys.team);
    else local.set(keys.team, t);
    const url = new URL(location.href);
    if (t === ALL) url.searchParams.delete("team");
    else url.searchParams.set("team", t);
    history.replaceState(history.state, "", url);
  };

  const selectRegion = (r: Region) => {
    setRegion(r);
    local.set(keys.region, r);
    setTeam(ALL);
    local.del(keys.team);
    const url = new URL(location.href);
    url.searchParams.set("site", r);
    url.searchParams.delete("team");
    history.replaceState(history.state, "", url);
  };

  const regionPolls = useMemo(() => (polls ?? []).filter((p) => p.region === region), [polls, region]);

  // 띄어쓰기·대소문자만 다른 팀 이름은 하나로 합쳐 보여줌 (먼저 만든 표기 기준이 아니라 최근 투표 표기)
  const teams = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of regionPolls) if (!seen.has(teamKey(p.team))) seen.set(teamKey(p.team), p.team);
    if (team !== ALL && !seen.has(teamKey(team))) seen.set(teamKey(team), team);
    return [...seen.values()];
  }, [regionPolls, team]);

  const visible = useMemo(() => regionPolls.filter((p) => team === ALL || teamKey(p.team) === teamKey(team)), [regionPolls, team]);
  const live = visible.filter((p) => p.status === "open");
  const done = visible.filter((p) => p.status === "closed");

  const onUpdated = useCallback((d: PollDetail) => {
    setPolls((ps) => ps?.map((p) => (p.id === d.id ? { ...p, status: d.status, responseCount: d.responses.length, round: d.round } : p)) ?? ps);
  }, []);

  const startCreate = () => {
    setCreateKey((k) => k + 1);
    setCreateOpen(true);
    history.pushState({ create: true }, "", location.href); // 모바일 뒤로가기로 닫히도록
  };
  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    if (history.state?.create) history.back();
  }, []);

  return (
    <div className="min-h-dvh">
      <Toaster />
      <div className="mx-auto max-w-[680px] px-4 pb-36 sm:px-6">
        <header className="flex items-center justify-between pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:pt-10">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-[11px] bg-ink shadow-soft">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="#3ddc97" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 12.5l4 4 9-9.5" />
              </svg>
            </span>
            <div className="leading-tight">
              <p className="text-[17px] font-bold tracking-tight">모임 투표</p>
              <p className="text-[12px] font-medium text-ink-3">식사 모임 · 팀 투표 취합</p>
            </div>
          </div>
          <div className="hidden sm:block">
            <Button size="md" onClick={startCreate}>
              <Plus className="size-5" /> 새 투표
            </Button>
          </div>
        </header>

        {masterOn && (
          <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-ink px-4 py-3 text-[13px] leading-relaxed text-white">
            <ShieldCheck className="size-4 shrink-0 text-[#6ee7b7]" />
            <p className="min-w-0 flex-1">
              <b>사이트 관리자 모드</b> · 모든 투표를 PIN 없이 열어 마감·삭제하고, 명단·식당을 정리할 수 있어요
            </p>
            <button type="button" onClick={() => setMasterOpen(true)} className="shrink-0 font-semibold underline underline-offset-2">
              관리
            </button>
          </div>
        )}

        {storage === "memory" && (
          <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-[#f2d6a7] bg-[#fdf6e9] px-4 py-3 text-[13px] leading-relaxed text-[#8a5a12]">
            <Database className="mt-0.5 size-4 shrink-0" />
            <p>
              <b>데모 모드</b> — 데이터베이스가 연결되지 않아 서버가 재시작되면 데이터가 사라져요. Vercel에서 Upstash Redis를 연결해 주세요.
            </p>
          </div>
        )}

        {/* 사업장 선택 */}
        <div className="mb-3 flex gap-1 rounded-2xl bg-ink/[0.05] p-1" role="radiogroup" aria-label="사업장">
          {REGIONS.map((r) => {
            const on = r.id === region;
            const open = (polls ?? []).filter((p) => p.region === r.id && p.status === "open").length;
            return (
              <button
                key={r.id}
                role="radio"
                aria-checked={on}
                onClick={() => selectRegion(r.id)}
                className={cx("relative flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[14.5px] font-semibold transition", on ? "text-ink" : "text-ink-3 hover:text-ink-2")}
              >
                {on && <motion.span layoutId="region-pill" className="absolute inset-0 rounded-xl bg-surface shadow-soft" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
                <MapPin className="relative size-4" />
                <span className="relative">{r.label}</span>
                {open > 0 && <span className="relative rounded-full bg-accent-soft px-1.5 text-[11.5px] font-bold text-accent tabular-nums">{open}</span>}
              </button>
            );
          })}
        </div>

        {/* 팀 선택 */}
        <nav
          aria-label="팀 선택"
          className="sticky top-0 z-20 -mx-4 mb-5 bg-canvas/85 px-4 py-2.5 backdrop-blur-xl supports-[backdrop-filter]:bg-canvas/70 sm:-mx-6 sm:px-6"
        >
          {/* 팀이 많으면 옆으로 넘기거나, '펼치기'로 한 번에 보고 검색 */}
          {teamsOpen && (
            <input
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
              placeholder="팀 이름 검색"
              aria-label="팀 이름 검색"
              autoComplete="off"
              autoFocus
              className="mb-2 h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-ink/30"
            />
          )}
          <div className={cx("-mx-4 flex gap-2 px-4 sm:-mx-6 sm:px-6", teamsOpen ? "flex-wrap" : "no-scrollbar overflow-x-auto")}>
            {[ALL, ...teams.filter((t) => !teamsOpen || !teamQuery.trim() || t.toLowerCase().includes(teamQuery.trim().toLowerCase()))].map((t) => {
              const on = t === ALL ? team === ALL : team !== ALL && teamKey(team) === teamKey(t);
              const count = regionPolls.filter((p) => p.status === "open" && (t === ALL || teamKey(p.team) === teamKey(t))).length;
              return (
                <button
                  key={t}
                  onClick={() => selectTeam(t)}
                  aria-pressed={on}
                  className={cx(
                    "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition active:scale-95",
                    on ? "text-white" : "bg-surface text-ink-2 shadow-soft hover:text-ink",
                  )}
                >
                  {on && <motion.span layoutId="team-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", damping: 30, stiffness: 400 }} />}
                  <span className="relative">{t === ALL ? "전체" : t}</span>
                  {count > 0 && (
                    <span className={cx("relative rounded-full px-1.5 text-[11.5px] font-bold tabular-nums", on ? "bg-white/15" : "bg-accent-soft text-accent")}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            {teams.length > 4 && (
              <button
                type="button"
                onClick={() => {
                  setTeamsOpen((v) => !v);
                  setTeamQuery("");
                }}
                aria-expanded={teamsOpen}
                className="inline-flex h-10 shrink-0 items-center rounded-full border border-dashed border-ink/20 px-3.5 text-[13.5px] font-semibold text-ink-2"
              >
                {teamsOpen ? "접기 ▴" : `🔍 팀 ${teams.length}개 모두 보기`}
              </button>
            )}
          </div>
        </nav>

        <div className="mb-6 flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
          <ShieldCheck className="size-4 text-accent" />
          모든 투표는 PIN 4자리로 보호돼요. 응답 내용은 PIN을 아는 팀원만 볼 수 있어요.
        </div>

        {polls === null ? (
          <CardSkeleton />
        ) : visible.length === 0 ? (
          <Empty team={team === ALL ? null : team} onCreate={startCreate} />
        ) : (
          <>
            <Section title="진행 중" count={live.length}>
              {live.length === 0 ? (
                <p className="rounded-[20px] border border-dashed border-ink/15 px-4 py-6 text-center text-[14px] text-ink-3">
                  지금 진행 중인 투표가 없어요
                </p>
              ) : (
                <div className="space-y-3.5">
                  <AnimatePresence initial={false}>
                    {live.map((p) => (
                      <PollCard
                        key={p.id}
                        poll={p}
                        now={now}
                        onOpen={() => openCard(p)}
                        doneRound={Number(local.get(`done:${p.id}`)) || 0}
                        isAdmin={!!local.get(keys.admin(p.id))}
                        showTeam={team === ALL}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </Section>
            {done.length > 0 && (
              <Section title="지난 투표" count={done.length}>
                <div className="space-y-2">
                  {(showAllDone ? done : done.slice(0, 6)).map((p) => (
                    <PollCard
                      key={p.id}
                      poll={p}
                      now={now}
                      onOpen={() => openCard(p)}
                      doneRound={Number(local.get(`done:${p.id}`)) || 0}
                      isAdmin={!!local.get(keys.admin(p.id))}
                      showTeam={team === ALL}
                    />
                  ))}
                  {!showAllDone && done.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDone(true)}
                      className="w-full rounded-[20px] py-3 text-[14px] font-semibold text-ink-2 hover:bg-ink/[0.03]"
                    >
                      지난 투표 {done.length - 6}개 더 보기
                    </button>
                  )}
                </div>
              </Section>
            )}
          </>
        )}

        <footer className="mt-14 text-center text-[12px] leading-relaxed text-ink-3/80">
          <button type="button" onClick={() => setGuideOpen(true)} className="font-semibold text-ink-2 underline underline-offset-2">
            이용 안내 · 개인정보
          </button>
        </footer>
      </div>

      {/* 모바일 하단 고정 버튼 (투표가 없을 때는 가운데 안내 카드의 버튼만: 중복·하단 링크 가림 방지) */}
      <div className={cx("bottom-safe pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 sm:hidden", polls !== null && visible.length === 0 && "hidden")}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={startCreate}
          className="pointer-events-auto inline-flex h-14 items-center gap-2 rounded-full bg-ink pl-5 pr-6 text-[16px] font-semibold text-white shadow-lift"
        >
          <Plus className="size-5" strokeWidth={2.6} /> 새 투표 만들기
        </motion.button>
      </div>

      <GuideSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        onMaster={
          masterOn !== null
            ? () => {
                setGuideOpen(false);
                setMasterOpen(true);
              }
            : undefined
        }
      />
      <MasterSheet
        open={masterOpen}
        active={!!masterOn}
        onClose={() => setMasterOpen(false)}
        onChange={(v) => {
          setMasterOn(v);
          force((n) => n + 1);
        }}
      />
      <PollSheet
        summary={openPoll}
        onClose={closeCard}
        onUpdated={onUpdated}
        onDeleted={(id) => setPolls((ps) => ps?.filter((p) => p.id !== id) ?? ps)}
      />
      <CreateSheet
        key={createKey}
        open={createOpen}
        onClose={closeCreate}
        teams={teams}
        defaultTeam={team === ALL ? null : team}
        region={region}
        onCreated={async (id, t) => {
          if (team !== ALL && team !== t) selectTeam(t);
          await load();
          force((n) => n + 1);
          void id;
        }}
      />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 flex items-center gap-2 px-1 text-[13px] font-bold uppercase tracking-wide text-ink-3">
        {title}
        <span className="tabular-nums text-ink-3/70">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function Empty({ team, onCreate }: { team: string | null; onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center rounded-[28px] border border-line bg-surface px-6 py-14 text-center shadow-soft"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-ink text-white">
        <Sparkles className="size-6" />
      </span>
      <h2 className="mt-5 text-[19px] font-bold tracking-tight">{team ? `${team}의 첫 투표를 만들어 보세요` : "첫 투표를 만들어 보세요"}</h2>
      <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-3">
        참석 여부, 선호 식당, 메뉴까지 링크 하나로 취합하고 결과를 메신저로 바로 공유할 수 있어요.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <Plus className="size-5" /> 새 투표 만들기
      </Button>
    </motion.div>
  );
}
