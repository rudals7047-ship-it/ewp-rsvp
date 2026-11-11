import { NextResponse, type NextRequest } from "next/server";
import { POLL_ID, TEAM_SITE } from "@/lib/site";

/** 회계세무부 전용 주소(ewptax.vercel.app): / → /t, /<투표id> 또는 /p/<투표id> → /t/<투표id> */
export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0];
  if (host !== TEAM_SITE.host) return NextResponse.next();
  const { pathname } = req.nextUrl;
  const url = req.nextUrl.clone();
  if (pathname === "/") url.pathname = "/t";
  else if (POLL_ID.test(pathname.slice(1))) url.pathname = `/t${pathname}`;
  else if (pathname.startsWith("/p/") && POLL_ID.test(pathname.slice(3))) url.pathname = `/t/${pathname.slice(3)}`;
  else return NextResponse.next();
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!api|_next|icon|favicon).*)"] };
