import "server-only";
import { autoAdvance } from "./poll";
import { getStore } from "./store";

/** 투표 불러오기 + 마감 시각이 지난 식당 투표는 메뉴 투표로 자동 전환 (조회하는 순간 반영) */
export async function freshPoll(id: string) {
  const store = getStore();
  const poll = await store.getPoll(id);
  if (!poll?.menuLater || (poll.round ?? 1) !== 1) return poll;
  if (autoAdvance(poll, await store.getResponses(id))) await store.savePoll(poll);
  return poll;
}
