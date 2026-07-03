import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth/cookie";

/**
 * Password gate (BUILD.md §2 Auth): every request must carry a valid signed
 * session cookie. Runs on the Edge runtime — COOKIE_SECRET is read directly
 * from process.env (no lib/env.ts import) to keep the edge bundle slim.
 */
export async function middleware(request: NextRequest) {
  const secret = process.env.COOKIE_SECRET;
  const cookieValue = request.cookies.get(SESSION_COOKIE)?.value;

  // Missing COOKIE_SECRET → treat every session as invalid.
  const valid = secret ? await verifySessionValue(cookieValue, secret) : false;

  if (valid) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const gateUrl = new URL("/gate", request.url);
  gateUrl.searchParams.set("from", pathname + search);
  return NextResponse.redirect(gateUrl);
}

export const config = {
  /**
   * Run on everything EXCEPT:
   * - /gate            (the password page and its server action POST)
   * - /_next/*         (framework internals: static chunks, image optimizer)
   * - /favicon.ico
   * - any path containing a dot (static assets served from /public)
   */
  matcher: [
    "/((?!gate$|gate/|_next/|favicon.ico|.*\\..*).*)",
  ],
};
