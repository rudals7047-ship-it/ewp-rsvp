"use client";

import { ExternalLink, Pencil, Phone, Plus, UtensilsCrossed } from "lucide-react";
import { useState } from "react";
import { openExternal } from "@/lib/client";
import { type Place, type Region, menuLabel, naverUrl, searchPlaces } from "@/lib/places";
import { PlaceEditor, usePlaces } from "./Places";
import { Sheet, SheetBody } from "./Sheet";
import { Segmented, cx, inputCls } from "./ui";

const PAGE = 40;

/** 지역별 식당 목록: 투표 없이도 보고, 누구나 추가·수정 (삭제는 사이트 관리자만) */
export function PlaceBook({ open, onClose, region, regionName }: { open: boolean; onClose: () => void; region: Region; regionName: string }) {
  return (
    <Sheet open={open} onClose={onClose} label={`${regionName} 식당`}>
      {/* 지역이 바뀌면 검색·펼침 상태를 새로 */}
      <Book key={region} region={region} regionName={regionName} />
    </Sheet>
  );
}

function Book({ region, regionName }: { region: Region; regionName: string }) {
  const places = usePlaces(region);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"popular" | "name">("popular");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const found = places ? searchPlaces(places, q) : null;
  const sorted = found && !q.trim() && sort === "name" ? [...found].sort((a, b) => a.name.localeCompare(b.name, "ko")) : found;
  const blank: Place = { id: "", region, name: q.trim(), category: "", address: "", phone: "", menus: [], status: "user", uses: 0 };

  return (
    <SheetBody className="pb-8 pt-4 sm:pt-7">
      <div className="mb-4 flex items-center gap-2.5 pr-10">
        <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-white">
          <UtensilsCrossed className="size-5" />
        </span>
        <div>
          <h2 className="text-[20px] font-bold tracking-tight">{regionName} 식당</h2>
          <p className="text-[12.5px] text-ink-3">{places ? `${places.length}곳 · 누구나 추가·수정할 수 있어요` : "불러오는 중…"}</p>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setLimit(PAGE);
        }}
        placeholder="식당·메뉴 검색 (초성 가능)"
        aria-label="식당 검색"
        autoComplete="off"
        className={cx(inputCls, "mb-2")}
      />
      {!q.trim() && (places?.length ?? 0) > 1 && (
        <div className="mb-2">
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: "popular", label: "많이 고른 순" },
              { value: "name", label: "이름순" },
            ]}
          />
        </div>
      )}

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

      {!sorted ? (
        <p className="py-8 text-center text-[13px] text-ink-3">불러오는 중…</p>
      ) : !sorted.length ? (
        <p className="rounded-2xl bg-ink/[0.03] px-4 py-8 text-center text-[13.5px] leading-relaxed text-ink-3">
          {q.trim() ? "찾는 식당이 없어요. 위 버튼으로 추가해 주세요." : "아직 등록된 식당이 없어요. 자주 가는 식당을 추가해 주세요."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {sorted.slice(0, limit).map((p) =>
            editing === p.id ? (
              <li key={p.id} className="p-2">
                <PlaceEditor place={p} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
              </li>
            ) : (
              <li key={p.id}>
                <button
                  type="button"
                  aria-expanded={openId === p.id}
                  onClick={() => setOpenId(openId === p.id ? null : p.id)}
                  className="w-full px-4 py-3 text-left hover:bg-ink/[0.02]"
                >
                  <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">
                    {[p.category, p.menus.length ? p.menus.slice(0, 2).map((m) => m.name).join(", ") : "메뉴 정보 없음"].filter(Boolean).join(" · ")}
                  </span>
                </button>
                {openId === p.id && <Detail p={p} region={region} onEdit={() => setEditing(p.id)} />}
              </li>
            ),
          )}
        </ul>
      )}
      {sorted && sorted.length > limit && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="mt-2 w-full rounded-2xl py-3 text-[14px] font-semibold text-ink-2 hover:bg-ink/[0.03]">
          {sorted.length - limit}곳 더 보기
        </button>
      )}
    </SheetBody>
  );
}

function Detail({ p, region, onEdit }: { p: Place; region: Region; onEdit: () => void }) {
  const pill = "inline-flex h-9 items-center gap-1.5 rounded-full bg-ink/[0.05] px-3.5 text-[13px] font-semibold text-ink-2";
  return (
    <div className="px-4 pb-4">
      {p.address && <p className="text-[13.5px] text-ink-2">{p.address}</p>}
      {p.menus.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded-xl bg-ink/[0.03] px-3 py-2 text-[13px] text-ink-2">
          {p.menus.map((m) => (
            <li key={m.name}>{menuLabel(m)}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {p.phone && (
          <a href={`tel:${p.phone}`} className={pill}>
            <Phone className="size-3.5" /> 전화
          </a>
        )}
        <a
          href={naverUrl(p, region)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            openExternal(naverUrl(p, region));
          }}
          className={pill}
        >
          <ExternalLink className="size-3.5" /> 네이버 지도
        </a>
        <button type="button" onClick={onEdit} className={pill}>
          <Pencil className="size-3.5" /> 정보 고치기
        </button>
      </div>
    </div>
  );
}
