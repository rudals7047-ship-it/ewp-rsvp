"use client";

import { KeyRound, LogOut, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api, keys, session } from "@/lib/client";
import { DEFAULT_REGION, REGIONS, type Place, type Region, searchPlaces } from "@/lib/places";
import type { RosterSummary } from "@/lib/types";
import { PlaceEditor, dropFromCache, usePlaces } from "./Places";
import { Sheet, SheetBody } from "./Sheet";
import { Button, Segmented, cx, inputCls, toast } from "./ui";

/**
 * 사이트 관리자(마스터): MASTER_KEY 환경변수로 로그인. 이 창에서만 2시간 유지.
 * 투표는 목록에서 열면 PIN 없이 관리 탭이 열리고, 여기서는 저장된 명단·식당을 정리
 */
export function MasterSheet({ open, active, onClose, onChange }: { open: boolean; active: boolean; onClose: () => void; onChange: (v: boolean) => void }) {
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
        {active ? <Console onLogout={() => onChange(false)} /> : <Login onDone={() => onChange(true)} />}
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

function Console({ onLogout }: { onLogout: () => void }) {
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [view, setView] = useState<"rosters" | "places">("rosters");
  return (
    <div className="space-y-4">
      <ul className="space-y-1.5 rounded-2xl bg-ink/[0.04] px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        <li>• <b>투표</b>: 목록에서 누르면 PIN 없이 열리고, 관리 탭에서 마감·다시 열기·삭제·대신 입력을 할 수 있어요</li>
        <li>• <b>명단</b>: PIN 없이 열어 수정하거나 삭제할 수 있어요</li>
        <li>• <b>식당</b>: 공용 목록의 식당을 추가·수정·삭제할 수 있어요 (이미 만든 투표에는 영향 없음)</li>
      </ul>
      <Segmented value={region} onChange={setRegion} options={REGIONS.map((r) => ({ value: r.id, label: r.label }))} />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "rosters", label: "저장된 명단" },
          { value: "places", label: "식당 목록" },
        ]}
      />
      {view === "rosters" ? <RosterAdmin region={region} /> : <PlaceAdmin region={region} />}
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
