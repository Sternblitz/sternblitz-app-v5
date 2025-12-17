import { NextResponse } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req) {
  // Enforce HTTPS in production to keep payment forms in a secure context
  if (process.env.NODE_ENV === 'production') {
    const proto = req.headers.get('x-forwarded-proto');
    if (proto && proto !== 'https') {
      const host = req.headers.get('host');
      const url = new URL(`https://${host}${req.nextUrl.pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  // Nur /dashboard und /admin schützen
  const protectedPaths = ["/dashboard", "/admin"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (!isProtected) {
    // Login & andere Seiten bleiben unberührt
    return res;
  }

  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session && isProtected) {
    const loginUrl = new URL("/login", req.url);
    const redirectPath = `${pathname}${req.nextUrl.search || ""}` || "/dashboard";
    loginUrl.searchParams.set("redirect", encodeURIComponent(redirectPath));
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

// Middleware greift auf Dashboard und Admin zu
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
