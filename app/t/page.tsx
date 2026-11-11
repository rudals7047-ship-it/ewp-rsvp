import type { Metadata } from "next";
import { Home } from "@/components/Home";

export const metadata: Metadata = {
  title: { absolute: "회계세무부 모임" },
  description: "회계세무부 식사 모임: 식당 → 메뉴 순서로 골라요. PIN으로 보호돼요.",
};

export default function Page() {
  return <Home teamMode />;
}
