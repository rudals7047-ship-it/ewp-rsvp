"use client";

import { Check, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { ApiError, api, josa, keys, local } from "@/lib/client";
import { REGION_LIMITS, type RegionInfo, koIncludes, regionKey } from "@/lib/places";
import { Sheet, SheetBody } from "./Sheet";
import { Button, cx, inputCls, toast } from "./ui";

/** 이 기기에서 만든 지역 id 목록 (첫 투표 전에는 만든 사람에게만 보이도록) */
export function readMyRegions(): string[] {
  try {
    const v = JSON.parse(local.get(keys.myRegions) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function rememberRegion(id: string) {
  const list = readMyRegions();
  if (!list.includes(id)) local.set(keys.myRegions, JSON.stringify([...list, id].slice(-20)));
}

/** 전체 지역 목록 + 새 지역 추가 */
export function RegionSheet({
  open,
  onClose,
  regions,
  allRegions,
  current,
  stats,
  onSelect,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  /** 화면에 보이는 지역 (정렬됨) */
  regions: RegionInfo[];
  /** 중복 확인용: 아직 투표가 없어 안 보이는 지역까지 */
  allRegions: RegionInfo[];
  current: string;
  stats: { total: Record<string, number>; open: Record<string, number> };
  onSelect: (id: string) => void;
  onAdded: (r: RegionInfo) => void;
}) {
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const label = name.replace(/\s+/g, " ").trim();
  const same = label ? allRegions.find((r) => regionKey(r.label) === regionKey(label)) : undefined;
  const list = q.trim() ? regions.filter((r) => koIncludes(r.label, q.trim())) : regions;

  async function add() {
    if (!label) return;
    if (same) return onSelect(same.id);
    setBusy(true);
    try {
      const { region, existed } = await api.addRegion(label);
      if (!existed) rememberRegion(region.id);
      onAdded(region);
      onSelect(region.id);
      setName("");
      toast(existed ? `이미 있는 지역이라 '${region.label}'${josa(region.label, "으로")} 이동했어요` : `'${region.label}' 지역을 만들었어요. 첫 투표를 만들면 모두에게 보여요`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "지역을 만들지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="지역">
      <SheetBody className="pb-6 pt-4 sm:pt-7">
        <div className="mb-4 pr-10">
          <h2 className="text-[20px] font-bold tracking-tight">지역</h2>
          <p className="mt-0.5 text-[13px] text-ink-3">지역마다 투표·팀·식당 목록이 따로 있어요</p>
        </div>
        {regions.length > 8 && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="지역 검색" aria-label="지역 검색" autoComplete="off" className={cx(inputCls, "mb-2")} />
        )}
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {list.map((r) => {
            const on = r.id === current;
            const open = stats.open[r.id] ?? 0;
            const total = stats.total[r.id] ?? 0;
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onSelect(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink/[0.02]">
                  <MapPin className={cx("size-4 shrink-0", on ? "text-ink" : "text-ink-3")} />
                  <span className={cx("min-w-0 flex-1 truncate text-[15px]", on ? "font-bold" : "font-semibold")}>{r.label}</span>
                  <span className="shrink-0 text-[12.5px] text-ink-3">
                    {open > 0 ? <b className="font-bold text-accent">진행 중 {open}</b> : total > 0 ? `투표 ${total}` : r.builtin ? "" : "새 지역"}
                  </span>
                  {on && <Check className="size-4 shrink-0 text-ink" strokeWidth={2.6} />}
                </button>
              </li>
            );
          })}
          {!list.length && <li className="px-4 py-5 text-center text-[13px] text-ink-3">찾는 지역이 없어요. 아래에서 추가해 주세요.</li>}
        </ul>

        <div className="mt-6">
          <p className="mb-1.5 text-[13px] font-bold">새 지역 추가</p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
              maxLength={REGION_LIMITS.label}
              placeholder="예: 여수, 서울사무소"
              aria-label="새 지역 이름"
              autoComplete="off"
              className={cx(inputCls, "min-w-0 flex-1")}
            />
            <Button size="md" variant={label ? "primary" : "secondary"} loading={busy} onClick={add} className="shrink-0">
              {same ? "이동" : (
                <>
                  <Plus className="size-4" /> 추가
                </>
              )}
            </Button>
          </div>
          {same ? (
            <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-[13px] font-medium text-[#0b6b51]">이미 있는 지역이에요. &lsquo;{same.label}&rsquo;{josa(same.label, "으로")} 이동해요.</p>
          ) : (
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">누구나 추가할 수 있어요. 첫 투표가 생기기 전까지는 만든 기기에서만 보여요.</p>
          )}
        </div>
      </SheetBody>
    </Sheet>
  );
}
