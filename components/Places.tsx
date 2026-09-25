"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ExternalLink, Loader2, MapPin, Pencil, Phone, Plus, Search, Store, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, openExternal } from "@/lib/client";
import {
  PLACE_LIMITS,
  parseLabel,
  type Place,
  type PlaceMenu,
  type PlaceSnap,
  type PlaceStatus,
  type Region,
  menuLabel,
  naverUrl,
  searchPlaces,
} from "@/lib/places";
import { Button, cx, flash, inputCls, reveal, toast } from "./ui";

/* ---------- 데이터 ---------- */

const cache = new Map<Region, Place[]>();
const listeners = new Set<() => void>();

export function usePlaces(region: Region) {
  const [places, setPlaces] = useState<Place[] | null>(cache.get(region) ?? null);
  useEffect(() => {
    let alive = true;
    const sync = () => alive && setPlaces(cache.get(region) ?? null);
    listeners.add(sync);
    if (!cache.has(region)) {
      api
        .places(region)
        .then(({ places }) => {
          cache.set(region, places);
          listeners.forEach((f) => f());
        })
        .catch(() => alive && setPlaces([]));
    } else sync();
    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, [region]);
  return places;
}

function upsertCache(p: Place) {
  const list = cache.get(p.region) ?? [];
  cache.set(p.region, [p, ...list.filter((x) => x.id !== p.id)]);
  listeners.forEach((f) => f());
}

/* ---------- 작은 요소 ---------- */

const STATUS: Record<PlaceStatus, { label: string; cls: string } | null> = {
  verified: null,
  estimated: { label: "위치 추정", cls: "bg-[#fdf5e3] text-[#9a6412]" },
  unverified: { label: "정보 미확인", cls: "bg-ink/[0.06] text-ink-3" },
  user: { label: "직접 추가", cls: "bg-[#eef0ff] text-[#4450b8]" },
};

function StatusBadge({ status, edited }: { status: PlaceStatus; edited?: boolean }) {
  const s = edited && status !== "user" ? { label: "수정됨", cls: "bg-[#eef0ff] text-[#4450b8]" } : STATUS[status];
  return s ? <span className={cx("shrink-0 rounded-md px-1.5 py-px text-[11px] font-semibold", s.cls)}>{s.label}</span> : null;
}

const shortAddr = (a: string) => a.replace(/^(울산|충남|충청남도)\s*/, "").split(" ").slice(0, 3).join(" ");

/* ---------- 식당 선택기 (생성자용) ---------- */

export function PlacePicker({
  region,
  mode,
  selected,
  onChange,
  max = 12,
}: {
  region: Region;
  mode: "single" | "multi";
  selected: Place[];
  onChange: (v: Place[]) => void;
  max?: number;
}) {
  const places = usePlaces(region);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Place | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const results = useMemo(() => (places ? searchPlaces(places, q).slice(0, 30) : []), [places, q]);
  const selectedIds = new Set(selected.map((p) => p.id));
  const full = mode === "multi" && selected.length >= max;

  function pick(p: Place) {
    if (mode === "single") {
      onChange([p]);
      setOpen(false);
      setQ("");
      return;
    }
    if (selectedIds.has(p.id)) onChange(selected.filter((x) => x.id !== p.id));
    else if (!full) onChange([...selected, p]);
  }

  function startNew() {
    const name = q.trim().slice(0, PLACE_LIMITS.name);
    setDraft({ id: "", region, name, category: "", address: "", phone: "", menus: [], status: "user", uses: 0 });
    setOpen(false);
    setQ("");
  }

  const showSearch = mode === "multi" || selected.length === 0;
  // 입력 없이 한 번에 고를 수 있는 자주 가는 곳
  const quick = (places ?? []).filter((p) => !selectedIds.has(p.id)).sort((a, b) => b.uses - a.uses).slice(0, 6);

  return (
    <div ref={box}>
      {/* 선택된 식당 */}
      {selected.length > 0 && (
        <div className="mb-2.5 space-y-2">
          {selected.map((p) =>
            editing === p.id ? (
              <PlaceEditor
                key={p.id}
                place={p}
                onCancel={() => setEditing(null)}
                onSaved={(np) => {
                  onChange(selected.map((x) => (x.id === p.id ? np : x)));
                  setEditing(null);
                }}
              />
            ) : (
              <SelectedPlace
                key={p.id}
                p={p}
                onEdit={() => setEditing(p.id)}
                onRemove={() => onChange(selected.filter((x) => x.id !== p.id))}
                removeLabel={mode === "single" ? "변경" : "빼기"}
              />
            ),
          )}
        </div>
      )}

      {draft && (
        <div className="mb-2.5">
          <PlaceEditor
            place={draft}
            isNew
            onCancel={() => setDraft(null)}
            onSaved={(np) => {
              setDraft(null);
              if (mode === "single") onChange([np]);
              else if (!full) onChange([...selected, np]);
            }}
          />
        </div>
      )}

      {showSearch && !draft && (
        <div className="relative">
          <div className={cx("flex items-center gap-2 rounded-2xl border bg-surface px-3.5 transition", open ? "border-ink/30 ring-4 ring-ink/[0.05]" : "border-line")}>
            <Search className="size-[18px] shrink-0 text-ink-3" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                setOpen(true);
                // 모바일 키보드에 목록이 가리지 않도록 검색칸을 시트 위쪽으로 스크롤
                setTimeout(() => reveal(box.current, "start"), 250);
              }}
              onClick={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (results[0] && q.trim()) pick(results[0]);
                  else if (q.trim()) startNew();
                }
                if (e.key === "Escape") setOpen(false);
              }}
              role="combobox"
              aria-expanded={open}
              aria-label="식당 검색"
              enterKeyHint="search"
              placeholder={full ? `최대 ${max}곳까지 고를 수 있어요` : "식당·메뉴 검색 (초성 가능: ㅁㄱㅎ)"}
              disabled={full}
              className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3/80"
            />
            {q && (
              <button type="button" aria-label="검색어 지우기" onClick={() => setQ("")} className="flex size-7 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.05]">
                <X className="size-4" />
              </button>
            )}
          </div>

          {!open && !q && quick.length > 0 && !full && (
            <div className="mt-2">
              <p className="mb-1.5 text-[12px] font-semibold text-ink-3">자주 가는 곳 · 탭해서 {mode === "multi" ? "추가" : "선택"}</p>
              <div className="flex flex-wrap gap-1.5">
                {quick.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pick(p)}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[13px] font-semibold text-ink-2 transition hover:border-ink/20 active:scale-95"
                  >
                    <Plus className="size-3.5 text-ink-3" /> {p.name}
                  </button>
                ))}
                <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-semibold text-ink-3 underline underline-offset-2">
                  전체 목록
                </button>
              </div>
            </div>
          )}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                role="listbox"
                className="mt-1.5 max-h-[300px] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-lift"
              >
                {places === null ? (
                  <div className="flex items-center justify-center py-6 text-ink-3">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                ) : (
                  <>
                    {!q && <p className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold text-ink-3">자주 가는 순</p>}
                    {results.map((p) => {
                      const on = selectedIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={on}
                          onClick={() => pick(p)}
                          className={cx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition", on ? "bg-accent-soft" : "hover:bg-ink/[0.04] active:bg-ink/[0.06]")}
                        >
                          <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold", on ? "bg-accent text-white" : "bg-ink/[0.05] text-ink-2")}>
                            {on ? <Check className="size-4" strokeWidth={3} /> : p.name.slice(0, 1)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[15px] font-semibold">{p.name}</span>
                              <StatusBadge status={p.status} edited={!!p.editedAt} />
                            </span>
                            <span className="block truncate text-[12.5px] text-ink-3">
                              {[p.category, p.address && shortAddr(p.address), p.menus.length ? `메뉴 ${p.menus.length}` : ""].filter(Boolean).join(" · ") || "정보 없음"}
                            </span>
                          </span>
                          {p.uses > 0 && <span className="shrink-0 text-[11.5px] font-medium tabular-nums text-ink-3">{p.uses}회</span>}
                        </button>
                      );
                    })}
                    {q.trim() && (
                      <button
                        type="button"
                        onClick={startNew}
                        className="mt-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-ink/20 px-2.5 py-2.5 text-left hover:bg-ink/[0.03]"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
                          <Plus className="size-4" />
                        </span>
                        <span className="text-[14.5px] font-semibold">&lsquo;{q.trim()}&rsquo; 새 식당으로 추가</span>
                      </button>
                    )}
                    {!q.trim() && results.length === 0 && <p className="py-5 text-center text-[13px] text-ink-3">등록된 식당이 없어요. 이름을 입력해 추가하세요.</p>}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function SelectedPlace({ p, onEdit, onRemove, removeLabel }: { p: Place; onEdit: () => void; onRemove: () => void; removeLabel: string }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
        <Store className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{p.name}</span>
          <StatusBadge status={p.status} edited={!!p.editedAt} />
        </span>
        <span className="block truncate text-[12.5px] text-ink-3">
          {[p.category, p.menus.length ? `메뉴 ${p.menus.length}개` : "메뉴 정보 없음"].filter(Boolean).join(" · ")}
        </span>
      </span>
      <button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink/[0.05] px-2.5 text-[12.5px] font-semibold text-ink-2 hover:bg-ink/[0.08]">
        <Pencil className="size-3.5" /> 편집
      </button>
      <button type="button" onClick={onRemove} aria-label={`${p.name} ${removeLabel}`} className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.05]">
        <X className="size-4" />
      </button>
    </motion.div>
  );
}

/* ---------- 식당 편집기 ---------- */

export function PlaceEditor({
  place,
  isNew,
  onCancel,
  onSaved,
}: {
  place: Place;
  isNew?: boolean;
  onCancel: () => void;
  onSaved: (p: Place) => void;
}) {
  const [f, setF] = useState(() => ({ ...place, menus: place.menus.map((m) => ({ ...m })) }));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Place>(k: K, v: Place[K]) => setF((x) => ({ ...x, [k]: v }));
  const setMenu = (i: number, m: PlaceMenu) => set("menus", f.menus.map((x, j) => (j === i ? m : x)));

  async function revert() {
    setBusy(true);
    try {
      const { place: saved } = await api.revertPlace(place.id);
      upsertCache(saved);
      toast("직전 내용으로 되돌렸어요");
      onSaved(saved);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "되돌리기에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const { place: saved } = await api.savePlace({
        id: isNew ? undefined : f.id,
        region: f.region,
        name: f.name,
        category: f.category,
        address: f.address,
        phone: f.phone,
        naverId: f.naverId,
        menus: f.menus.filter((m) => m.name.trim()),
      });
      upsertCache(saved);
      toast(isNew ? "공용 목록에 추가했어요" : "수정 내용을 저장했어요");
      onSaved(saved);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "저장에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  const small = "h-11 w-full rounded-xl bg-ink/[0.04] px-3 text-[16px] outline-none placeholder:text-ink-3/80 focus:bg-ink/[0.06]";

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border-2 border-ink/80 bg-surface p-4">
      <p className="mb-3 flex items-center gap-1.5 text-[13px] font-bold">
        <Pencil className="size-4" /> {isNew ? "새 식당 추가" : "식당 정보 편집"}
      </p>
      <div className="space-y-2">
        <input id="pe-name" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={PLACE_LIMITS.name} aria-label="식당 이름" placeholder="식당 이름" className={cx(inputCls, "h-12 font-semibold")} />
        <div className="grid grid-cols-2 gap-2">
          <input value={f.category} onChange={(e) => set("category", e.target.value)} maxLength={PLACE_LIMITS.category} aria-label="분류" placeholder="분류 (예: 한식)" className={small} />
          <input value={f.phone} onChange={(e) => set("phone", e.target.value)} maxLength={PLACE_LIMITS.phone} aria-label="전화번호" placeholder="전화번호" inputMode="tel" className={small} />
        </div>
        <input value={f.address} onChange={(e) => set("address", e.target.value)} maxLength={PLACE_LIMITS.address} aria-label="주소" placeholder="주소" className={small} />
      </div>

      <p className="mb-2 mt-4 text-[12.5px] font-semibold text-ink-2">메뉴 · 가격</p>
      <div className="space-y-1.5">
        {f.menus.map((m, i) => (
          <div key={i} className="flex gap-1.5">
            <input value={m.name} onChange={(e) => setMenu(i, { ...m, name: e.target.value })} maxLength={PLACE_LIMITS.menuName} aria-label="메뉴명" placeholder="메뉴명" className={cx(small, "min-w-0 flex-[1.6]")} />
            <input value={m.price ?? ""} onChange={(e) => setMenu(i, { ...m, price: e.target.value })} maxLength={PLACE_LIMITS.price} aria-label="가격" placeholder="가격" className={cx(small, "min-w-0 flex-1")} />
            <button type="button" aria-label="메뉴 삭제" onClick={() => set("menus", f.menus.filter((_, j) => j !== i))} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-3 hover:bg-ink/[0.05]">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {f.menus.length < PLACE_LIMITS.menus && (
          <button type="button" onClick={() => set("menus", [...f.menus, { name: "", price: "" }])} className="flex h-10 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-ink/20 text-[13px] font-semibold text-ink-2">
            <Plus className="size-4" /> 메뉴 추가
          </button>
        )}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
        저장을 눌러야 공용 목록에 반영돼요. 이미 만든 투표에는 영향이 없고, 잘못 고쳤다면 직전 내용으로 되돌릴 수 있어요.
      </p>
      {!isNew && place.prev && (
        <button type="button" disabled={busy} onClick={revert} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-2 underline underline-offset-4">
          <Undo2 className="size-3.5" /> 직전 저장 내용으로 되돌리기
        </button>
      )}
      <div className="mt-3 grid grid-cols-[1fr_1.6fr] gap-2">
        <Button variant="secondary" size="md" onClick={onCancel}>
          취소
        </Button>
        <Button size="md" loading={busy} onClick={() => (f.name.trim() ? save() : flash("pe-name", "식당 이름을 입력해 주세요"))}>
          저장
        </Button>
      </div>
    </motion.div>
  );
}

/* ---------- 직접 넣은 메뉴를 식당 정보에 저장 (누를 때만, 추가만) ---------- */

export function SaveMenus({ placeId, placeName, labels }: { placeId?: string; placeName: string; labels: string[] }) {
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const todo = labels.filter((l) => !done.includes(l));
  if (!placeId || !todo.length) return null;
  async function save() {
    setBusy(true);
    try {
      const { place, added } = await api.addMenus(placeId!, todo.map(parseLabel));
      upsertCache(place);
      setDone((d) => [...d, ...todo]);
      toast(added ? `${placeName} 메뉴 ${added}개를 목록에 저장했어요` : "이미 목록에 있는 메뉴예요");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "저장에 실패했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={save}
      className="mt-2 inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 hover:bg-ink/[0.08] active:scale-95"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
      직접 넣은 메뉴 {todo.length}개 &lsquo;{placeName}&rsquo; 목록에도 저장
    </button>
  );
}

/* ---------- 메뉴 선택 (식당 메뉴에서 탭해서 선택지로) ---------- */

export function MenuSuggestions({
  menus,
  selected,
  onToggle,
  title = "식당 메뉴에서 탭해서 추가",
  labelOf = menuLabel,
}: {
  menus: PlaceMenu[];
  selected: string[];
  onToggle: (label: string) => void;
  title?: string;
  labelOf?: (m: PlaceMenu) => string;
}) {
  if (!menus.length) return null;
  return (
    <div className="mb-3">
      <p className="mb-2 text-[12.5px] font-semibold text-ink-3">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {menus.map((m) => {
          const label = labelOf(m);
          const on = selected.includes(label);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(label)}
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition active:scale-95",
                on ? "bg-ink text-white" : "border border-line bg-surface text-ink-2 hover:border-ink/20",
              )}
            >
              {on && <Check className="size-3.5" strokeWidth={3} />}
              {m.name}
              {m.price && <span className={on ? "text-white/60" : "text-ink-3"}>{m.price}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 식당 정보 카드 (참여자·결과용) ---------- */

export function PlaceInfo({ p, region, label, dark }: { p: PlaceSnap; region?: Region; label?: string; dark?: boolean }) {
  const menus = p.menus.slice(0, 4);
  return (
    <div className={cx("rounded-2xl p-4", dark ? "bg-ink text-white" : "border border-line bg-surface")}>
      {label && <p className={cx("mb-1 text-[12px] font-semibold", dark ? "text-[#6ee7b7]" : "text-accent")}>{label}</p>}
      <p className="text-[18px] font-bold leading-snug tracking-tight">{p.name}</p>
      {p.category && <p className={cx("text-[13px]", dark ? "text-white/60" : "text-ink-3")}>{p.category}</p>}
      {p.address && (
        <p className={cx("mt-2 flex items-start gap-1.5 text-[13.5px]", dark ? "text-white/80" : "text-ink-2")}>
          <MapPin className="mt-0.5 size-4 shrink-0" />
          {p.address}
        </p>
      )}
      {menus.length > 0 && (
        <p className={cx("mt-1.5 text-[13px] leading-relaxed", dark ? "text-white/60" : "text-ink-3")}>
          {menus.map((m) => menuLabel(m)).join("  ·  ")}
          {p.menus.length > menus.length && ` 외 ${p.menus.length - menus.length}개`}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {p.phone && (
          <a
            href={`tel:${p.phone}`}
            onClick={(e) => e.stopPropagation()}
            className={cx("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold", dark ? "bg-white/10 text-white" : "bg-ink/[0.05] text-ink-2")}
          >
            <Phone className="size-3.5" /> 전화
          </a>
        )}
        <a
          href={naverUrl(p, region)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openExternal(naverUrl(p, region));
          }}
          className={cx("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold", dark ? "bg-white/10 text-white" : "bg-ink/[0.05] text-ink-2")}
        >
          <ExternalLink className="size-3.5" /> 네이버 지도
        </a>
      </div>
    </div>
  );
}
