import type { Metadata } from "next";
import { Home } from "@/components/Home";
import { toSummary } from "@/lib/poll";
import { getStore } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

// 공유 미리보기에는 제목·팀만 노출 (질문/응답은 PIN 인증 후)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poll = await getStore()
    .getPoll(id)
    .catch(() => null);
  if (!poll) return { title: "투표" };
  // 링크 미리보기(카톡 등): 제목 + 현재 단계 + 일정. 이름·응답·식당 확정값 등은 넣지 않음
  const sum = toSummary(poll, 0);
  const when = poll.eventAt
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(poll.eventAt))
    : "";
  const title = `[${poll.team}] ${poll.title} · ${sum.stageLabel}`;
  const description = `${when ? `📅 ${when} · ` : ""}🔒 PIN으로 보호된 투표예요. 탭해서 참여하세요.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary", title, description } };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <Home initialPollId={id} />;
}
