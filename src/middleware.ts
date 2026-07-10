import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { HELFER_COOKIE, verifyHelferSession } from "@/lib/auth/helferSession";
import { helferGateDecision } from "@/lib/auth/cordon";

// Edge-safe: middleware runs in the Edge runtime, so it builds `auth` from the
// DB-free config (NOT from `@/auth`, which imports better-sqlite3).
const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;

  // Admin-Cordon (unverändert aus M1).
  if (pathname.startsWith("/verwaltung")) {
    if (pathname === "/verwaltung/kein-zugriff") return;
    if (!req.auth?.user) return Response.redirect(new URL("/", req.nextUrl));
    if (!req.auth.user.isAdmin) return Response.redirect(new URL("/verwaltung/kein-zugriff", req.nextUrl));
    return;
  }

  // Helfer-/Regaletikett-Cordon. Edge: nur Signatur+Ablauf des jose-Cookies
  // (kein DB-Zugriff); die aktiv-Prüfung macht requireHelfer je Buchung.
  const cookie = req.cookies.get(HELFER_COOKIE)?.value;
  const hasHelfer = cookie ? (await verifyHelferSession(cookie)) !== null : false;
  const decision = helferGateDecision({
    pathname, search, hasHelfer, isAdmin: Boolean(req.auth?.user?.isAdmin),
  });
  if (decision.action === "redirect") return Response.redirect(new URL(decision.to, req.nextUrl));
});

export const config = {
  matcher: ["/verwaltung/:path*", "/helfer/:path*", "/a/:path*"],
};
