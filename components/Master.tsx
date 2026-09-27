"use client";

import { EyeOff, KeyRound, LogOut, Merge, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api, keys, session } from "@/lib/client";
import { BUILTIN_REGIONS, DEFAULT_REGION, type Place, type Region, type RegionInfo, searchPlaces } from "@/lib/places";
import type { RosterSummary } from "@/lib/types";
import { PlaceEditor, dropFromCache, usePlaces } from "./Places";
import { Sheet, SheetBody } from "./Sheet";
import { Button, Segmented, cx, inputCls, toast } from "./ui";

/**
 * 사이트 관리자(마스터): MASTER_KEY 환경변수로 로그인. 이 창에서만 2시간 유지.
 * 투표는 목록에서 열면 PIN 없이 관리 탭이 열리고, 여기서는 저장된 명단·식당을 정리
 */
export function MasterSheet({
  open,
  active,
  onClose,
  onChange,
  onRegionsChanged,
}: {
  open: boolean;
  active: boolean;
  onClose: () => void;
  onChange: (v: boolean) => void;
  onRegionsChanged?: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="사이트 관리">
      <SheetBody className="pb-6 pt-4 sm:pt-7">
        <div className="mb-5 flex items-center gap-2.5 pr-10">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-white">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="text-[19px] font-bold tracking-tight">사이트 관리</h2>
            <p className="text-[12.5px] text-ink-3">투표 만든 사람과 별개인 전체 관리자용이에요</p>
          </div>
        </div>
        {active ? <Console onLogout={() => onChange(false)} onRegionsChanged={onRegionsChanged} /> : <Login onDone={() => onChange(true)} />}
      </SheetBody>
    </Sheet>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!key.trim()) return;
    setBusy(true);
    try {
      const { token } = await api.masterLogin(key.trim());
      session.set(keys.master, token);
      toast("사이트 관리자 모드로 전환했어요");
      onDone();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "로그인에 실패했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        autoComplete="off"
        placeholder="관리자 키"
        aria-label="관리자 키"
        className={inputCls}
      />
      <Button className="mt-3 w-full" loading={busy} onClick={submit}>
        <KeyRound className="size-5" /> 로그인
      </Button>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">관리자 키는 Vercel 환경변수(MASTER_KEY)에만 있어요. 로그인은 이 창에서 2시간 유지돼요.</p>
    </div>
  );
}

function Console({ onLogout, onRegionsChanged }: { onLogout: () => void; onRegionsChanged?: () => void }) {
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [view, setView] = useState<"rosters" | "places" | "regions">("rosters");
  const [regions, setRegions] = useState<RegionInfo[]>(BUILTIN_REGIONS);
  const reloadRegions = () =>
    api
      .allRegions()
      .then((r) => setRegions(r.regions))
      .catch(() => {});
  useEffect(() => {
    reloadRegions();
  }, []);
  const active = regions.filter((r) => !r.hidden && !r.mergedInto);
  return (
    <div className="space-y-4">
      <ul className="space-y-1.5 rounded-2xl bg-ink/[0.04] px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <li>• <b>투표</b>: 목록에서 누르면 PIN 없이 열리고, 관리 탭에서 마감·다시 열기·삭제·대신 입력을 할 수 있어요</li>
        <li>• <b>명단</b>: PIN 없이 열어 수정하거나 삭제할 수 있어요</li>
        <li>• <b>식당</b>: 공용 목록의 식당을 추가·수정·삭제할 수 있어요 (이미 만든 투표에는 영향 없음)</li>
        <li>• <b>지역</b>: 사용자가 만든 지역의 이름을 고치거나, 숨기거나, 다른 지역으로 합칠 수 있어요</li>
      </ul>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "rosters", label: "명단" },
          { value: "places", label: "식당" },
          { value: "regions", label: "지역" },
        ]}
      />
      {view !== "regions" &&
        (active.length <= 3 ? (
          <Segmented value={region} onChange={setRegion} options={active.map((r) => ({ value: r.id, label: r.label }))} />
        ) : (
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="지역" className={inputCls}>
            {active.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        ))}
      {view === "rosters" ? (
        <RosterAdmin region={region} />
      ) : view === "places" ? (
        <PlaceAdmin region={region} />
      ) : (
        <RegionAdmin
          regions={regions}
          onChanged={() => {
            reloadRegions();
            onRegionsChanged?.();
          }}
        />
      )}
      <Button
        variant="secondary"
        size="md"
        className="w-full"
        onClick={() => {
          session.del(keys.master);
          toast("사이트 관리자 모드를 끝냈어요");
          onLogout();
        }}
      >
        <LogOut className="size-4" /> 관리자 모드 끝내기
      </Button>
    </div>
  );
}

function RosterAdmin({ region }: { region: Region }) {
  const [list, setList] = useState<RosterSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    setList(null);
    api.rosters(region).then((r) => setList(r.rosters)).catch(() => setList([]));
  }, [region]);
  async function peek(id: string) {
    if (openId === id) return setOpenId(null);
    try {
      const r = await api.roster(id, { pin: "", action: "open" });
      setNames(r.names ?? []);
      setOpenId(id);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "열지 못했어요");
    }
  }
  async function remove(id: string) {
    try {
      await api.roster(id, { pin: "", action: "delete" });
      setList((l) => l?.filter((x) => x.id !== id) ?? l);
      setConfirm(null);
      toast("명단을 삭제했어요");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "삭제하지 못했어요");
    }
  }
  if (!list) return <p className="py-6 text-center text-[13px] text-ink-3">불러오는 중…</p>;
  if (!list.length) return <p className="py-6 text-center text-[13px] text-ink-3">저장된 명단이 없어요</p>;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line">
      {list.map((r) => (
        <li key={r.id} className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => peek(r.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[14.5px] font-semibold">{r.title}</span>
              <span className="text-[12px] text-ink-3">눌러서 이름 {openId === r.id ? "닫기" : "보기"}</span>
            </button>
            {confirm === r.id ? (
              <>
                <Button variant="secondary" size="md" className="h-9 px-3 text-[13px]" onClick={() => setConfirm(null)}>
                  취소
                </Button>
                <Button variant="danger" size="md" className="h-9 px-3 text-[13px]" onClick={() => remove(r.id)}>
                  삭제
                </Button>
              </>
            ) : (
              <button type="button" aria-label={`${r.title} 삭제`} onClick={() => setConfirm(r.id)} className="flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-danger/10 hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
          {openId === r.id && <p className="mt-2 rounded-xl bg-ink/[0.04] px-3 py-2 text-[13px] leading-relaxed text-ink-2">{names.join(", ")}</p>}
        </li>
      ))}
    </ul>
  );
}

function PlaceAdmin({ region }: { region: Region }) {
  const places = usePlaces(region);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  // 편집 중인 식당 id ("new"면 새 식당 추가)
  const [editing, setEditing] = useState<string | null>(null);
  const shown = places ? searchPlaces(places, q).slice(0, 30) : null;
  const blank: Place = { id: "", region, name: q.trim(), category: "", address: "", phone: "", menus: [], status: "user", uses: 0 };
  async function remove(p: Place) {
    try {
      await api.hidePlace(p.id);
      dropFromCache(p);
      setConfirm(null);
      toast(`'${p.name}' 식당을 목록에서 삭제했어요`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "삭제하지 못했어요");
    }
  }
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="식당 검색" aria-label="식당 검색" autoComplete="off" className={cx(inputCls, "mb-2")} />
      {editing === "new" ? (
        <div className="mb-2">
          <PlaceEditor place={blank} isNew onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="mb-2 flex h-11 w-full items-center justify-center gap-1 rounded-2xl border border-dashed border-ink/20 text-[13.5px] font-semibold text-ink-2"
        >
          <Plus className="size-4" /> {q.trim() ? `'${q.trim()}' 새 식당으로 추가` : "새 식당 추가"}
        </button>
      )}
      {!shown ? (
        <p className="py-6 text-center text-[13px] text-ink-3">불러오는 중…</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {shown.map((p) =>
            editing === p.id ? (
              <li key={p.id} className="p-2">
                <PlaceEditor place={p} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
              </li>
            ) : (
              <li key={p.id} className="flex items-center gap-1 px-4 py-2.5">
                <button type="button" onClick={() => setEditing(p.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {[p.status === "user" ? "직접 추가" : null, p.category, p.phone, p.menus.length ? `메뉴 ${p.menus.length}` : "메뉴 없음"].filter(Boolean).join(" · ")}
                  </span>
                </button>
                <button type="button" aria-label={`${p.name} 편집`} onClick={() => setEditing(p.id)} className="flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.05] hover:text-ink">
                  <Pencil className="size-4" />
                </button>
                {confirm === p.id ? (
                  <Button variant="danger" size="md" className="h-9 px-3 text-[13px]" onClick={() => remove(p)}>
                    삭제 확인
                  </Button>
                ) : (
                  <button type="button" aria-label={`${p.name} 삭제`} onClick={() => setConfirm(p.id)} className="flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-ink-3">식당 이름을 누르면 전화·주소·메뉴·가격을 고칠 수 있어요. 저장 전에 바뀌는 내용을 한 번 더 보여주고, 잘못 고쳤다면 &lsquo;직전 저장 내용으로 되돌리기&rsquo;로 복구돼요.</p>
    </div>
  );
}

function RegionAdmin({ regions, onChanged }: { regions: RegionInfo[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [into, setInto] = useState("");
  const [busy, setBusy] = useState(false);
  const active = regions.filter((r) => !r.hidden && !r.mergedInto);
  const nameOf = (id?: string) => regions.find((r) => r.id === id)?.label ?? "";
  async function run(b: Parameters<typeof api.regionAdmin>[0], done: string) {
    setBusy(true);
    try {
      await api.regionAdmin(b);
      toast(done);
      setEditing(null);
      setMerging(null);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "처리하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  const iconBtn = "flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-ink/[0.05] hover:text-ink";
  return (
    <div>
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {regions.map((r) => (
          <li key={r.id} className="px-4 py-2.5">
            {editing === r.id ? (
              <div className="flex gap-2">
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={10} aria-label="지역 이름" className={cx(inputCls, "h-10 min-w-0 flex-1")} />
                <Button size="md" className="h-10" loading={busy} onClick={() => run({ action: "rename", id: r.id, label }, "이름을 바꿨어요")}>
                  저장
                </Button>
                <Button size="md" variant="ghost" className="h-10 px-3" onClick={() => setEditing(null)}>
                  취소
                </Button>
              </div>
            ) : merging === r.id ? (
              <div className="space-y-2">
                <p className="text-[13px] text-ink-2">
                  &lsquo;{r.label}&rsquo;의 투표·명단·식당을 옮길 지역을 골라 주세요. 예전 링크도 새 지역으로 열려요.
                </p>
                <div className="flex gap-2">
                  <select value={into} onChange={(e) => setInto(e.target.value)} aria-label="합칠 지역" className={cx(inputCls, "h-10 min-w-0 flex-1")}>
                    <option value="">합칠 지역 선택</option>
                    {active
                      .filter((x) => x.id !== r.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                  </select>
                  <Button size="md" variant="danger" className="h-10" loading={busy} disabled={!into} onClick={() => run({ action: "merge", id: r.id, into }, `'${nameOf(into)}' 지역으로 합쳤어요`)}>
                    합치기
                  </Button>
                  <Button size="md" variant="ghost" className="h-10 px-3" onClick={() => setMerging(null)}>
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <span className={cx("block truncate text-[14px] font-semibold", (r.hidden || r.mergedInto) && "text-ink-3 line-through")}>{r.label}</span>
                  <span className="block text-[12px] text-ink-3">
                    {r.builtin ? "기본 지역" : r.mergedInto ? `'${nameOf(r.mergedInto)}'에 합쳐짐` : r.hidden ? "숨김" : `추가됨 ${r.createdAt ? new Date(r.createdAt).toLocaleDateString("ko-KR") : ""}`}
                  </span>
                </div>
                {!r.builtin && !r.mergedInto && (
                  <>
                    {!r.hidden && (
                      <>
                        <button
                          type="button"
                          aria-label={`${r.label} 이름 바꾸기`}
                          onClick={() => {
                            setEditing(r.id);
                            setLabel(r.label);
                          }}
                          className={iconBtn}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${r.label} 다른 지역으로 합치기`}
                          onClick={() => {
                            setMerging(r.id);
                            setInto("");
                          }}
                          className={iconBtn}
                        >
                          <Merge className="size-4" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={r.hidden ? `${r.label} 다시 보이기` : `${r.label} 숨기기`}
                      onClick={() => run({ action: r.hidden ? "show" : "hide", id: r.id }, r.hidden ? "다시 보이게 했어요" : "숨겼어요")}
                      className={cx(iconBtn, r.hidden && "text-ink")}
                    >
                      {r.hidden ? <span className="text-[12px] font-semibold">보이기</span> : <EyeOff className="size-4" />}
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-3">기본 지역(울산·당진)은 바꿀 수 없어요. 숨긴 지역은 목록에서만 사라지고 투표 링크는 그대로 열려요.</p>
    </div>
  );
}
