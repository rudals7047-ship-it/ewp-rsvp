import { verifyMaster } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { regionKey } from "@/lib/places";
import { overLimit } from "@/lib/ratelimit";
import { cleanRegionLabel, createRegion, listRegions } from "@/lib/regions-server";
import { getStore } from "@/lib/store";

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1" && (await verifyMaster(req));
  return json({ regions: await listRegions(all) });
}

/** 지역 추가(누구나) / 이름 바꾸기·숨기기·합치기(사이트 관리자, 추가된 지역만) */
export async function POST(req: Request) {
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const action = body?.action ?? "create";

  if (action === "create") {
    if (await overLimit(req, "region", 5, 3600)) return fail("잠시 후 다시 시도해 주세요.", 429);
    const label = cleanRegionLabel(body?.label);
    if (!label) return fail("지역 이름은 한글·영문·숫자로 1~10자까지 쓸 수 있어요.");
    const r = await createRegion(label);
    if ("error" in r) return fail(r.error);
    return json(r, r.existed ? 200 : 201);
  }

  if (!(await verifyMaster(req))) return fail("사이트 관리자만 할 수 있어요.", 403);
  const store = getStore();
  const all = await listRegions(true);
  const target = all.find((r) => r.id === body?.id);
  if (!target) return fail("지역을 찾을 수 없어요.", 404);
  if (target.builtin) return fail("기본 지역(울산·당진)은 바꿀 수 없어요.");

  if (action === "rename") {
    const label = cleanRegionLabel(body?.label);
    if (!label) return fail("지역 이름은 한글·영문·숫자로 1~10자까지 쓸 수 있어요.");
    if (all.some((r) => r.id !== target.id && regionKey(r.label) === regionKey(label))) return fail("같은 이름의 지역이 이미 있어요. 합치기를 써 주세요.");
    await store.saveRegion({ ...target, label });
    return json({ ok: true });
  }

  if (action === "hide" || action === "show") {
    await store.saveRegion({ ...target, hidden: action === "hide" });
    return json({ ok: true });
  }

  if (action === "merge") {
    const into = all.find((r) => r.id === body?.into && !r.hidden && !r.mergedInto);
    if (!into || into.id === target.id) return fail("합칠 지역을 골라 주세요.");
    // 투표·명단·식당을 모두 합칠 지역으로 옮김
    for (const { poll } of await store.listPolls(100000)) if (poll.region === target.id) await store.savePoll({ ...poll, region: into.id });
    for (const r of await store.listRosters()) if (r.region === target.id) await store.saveRoster({ ...r, region: into.id });
    for (const p of await store.listPlaceEdits()) if (p.region === target.id) await store.savePlace({ ...p, region: into.id });
    await store.saveRegion({ ...target, mergedInto: into.id });
    return json({ ok: true });
  }

  return fail("알 수 없는 요청이에요.");
}
