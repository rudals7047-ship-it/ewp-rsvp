import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "모임 투표", template: "%s · 모임 투표" },
  description: "팀 식사 모임 참석 여부·선호 식당·메뉴를 PIN 보호 투표로 간편하게 취합하세요.",
  robots: { index: false, follow: false },
  appleWebApp: { title: "모임 투표", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f3ef",
  interactiveWidget: "resizes-content",
};

const goat = process.env.NEXT_PUBLIC_GOATCOUNTER_CODE;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {children}
        {goat && (
          <Script
            src="https://gc.zgo.at/count.js"
            data-goatcounter={`https://${goat}.goatcounter.com/count`}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
