import type { Metadata } from "next";
import { Home } from "@/components/Home";
import { toSummary } from "@/lib/poll";
import { freshPoll } from "@/lib/advance";

type Props = { params: Promise<{ id: string }> };

// 카톡 미리보기: 제목 + 지금 단계만 (이름·응답은 PIN 인증 후)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poll = await freshPoll(id).catch(() => null);
  if (!poll) return { title: { absolute: "회계세무부 모임" } };
  const title = `${poll.title} · ${toSummary(poll, 0).stageLabel}`;
  const description = "🔒 PIN으로 보호된 회계세무부 투표예요. 탭해서 참여하세요.";
  return { title: { absolute: title }, description, openGraph: { title, description }, twitter: { card: "summary", title, description } };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <Home teamMode initialPollId={id} />;
}
