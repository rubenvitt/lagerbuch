import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe: middleware runs in the Edge runtime, so it builds `auth` from the
// DB-free config (NOT from `@/auth`, which imports better-sqlite3).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isVerwaltung = req.nextUrl.pathname.startsWith("/verwaltung");
  const isKeinZugriff = req.nextUrl.pathname === "/verwaltung/kein-zugriff";
  if (!isVerwaltung || isKeinZugriff) return;
  if (!req.auth?.user) {
    return Response.redirect(new URL("/", req.nextUrl));
  }
  if (!req.auth.user.isAdmin) {
    return Response.redirect(new URL("/verwaltung/kein-zugriff", req.nextUrl));
  }
});

export const config = {
  matcher: ["/verwaltung/:path*"],
};
