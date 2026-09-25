import type { Metadata } from "next";
import { Home } from "@/components/Home";
import { getStore } from "@/lib/store";

type Props = { params: Promise<{ id: string }> };

// 공유 미리보기에는 제목·팀만 노출 (질문/응답은 PIN 인증 후)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poll = await getStore()
    .getPoll(id)
    .catch(() => null);
  if (!poll) return { title: "투표" };
  return {
    title: poll.title,
    description: `${poll.team} · PIN으로 보호된 투표예요. 링크를 열고 PIN 4자리를 입력해 참여하세요.`,
    openGraph: {
      title: `[${poll.team}] ${poll.title}`,
      description: "🔒 PIN으로 보호된 투표 · 탭해서 참여하기",
    },
  };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  return <Home initialPollId={id} />;
}
