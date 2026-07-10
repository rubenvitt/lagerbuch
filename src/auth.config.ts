import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
// Empty type-only import required so TS can resolve the "next-auth/jwt"
// module-augmentation target below (see JWT augmentation at file end):
// without touching "next-auth/jwt" via an import first, TS reports
// TS2664 "Invalid module name in augmentation" for that specifier when
// "next-auth" (root) is also imported in the same file, under
// moduleResolution "bundler" with next-auth@5.0.0-beta.31.
import type {} from "next-auth/jwt";
import { config } from "@/lib/config";

const ADMIN_GROUP = config.oidcAdminGroup;

function extractGroups(profile: unknown): string[] {
  const g = (profile as { groups?: unknown } | null)?.groups;
  return Array.isArray(g) ? (g as string[]) : [];
}

const providers: Provider[] = [];

if (config.oidcIssuer) {
  providers.push({
    id: "oidc",
    name: "Pocket ID",
    type: "oidc",
    issuer: config.oidcIssuer,
    clientId: config.oidcClientId,
    clientSecret: config.oidcClientSecret,
    authorization: { params: { scope: "openid profile email groups" } },
  });
}

// Dev-only demo login — impossible in production (config refinement guards it).
if (config.authDevLogin && config.nodeEnv !== "production") {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Demo-Login (nur Entwicklung)",
      credentials: {},
      authorize: () => ({
        id: "dev-admin",
        name: "Demo-Verwaltung",
        email: "demo@example.com",
        isAdmin: true,
      }),
    }),
  );
}

export const authConfig = {
  secret: config.authSecret,
  trustHost: true,
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/", error: "/verwaltung/kein-zugriff" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "dev-login") return true;
      if (account?.provider === "oidc") return extractGroups(profile).includes(ADMIN_GROUP);
      return false;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "oidc") {
        token.isAdmin = extractGroups(profile).includes(ADMIN_GROUP);
        token.sub = (profile as { sub?: string })?.sub ?? token.sub;
      } else if (account?.provider === "dev-login") {
        token.isAdmin = true;
      }
      if (user?.name) token.name = user.name;
      return token;
    },
    async session({ session, token }) {
      session.user.isAdmin = Boolean(token.isAdmin);
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;

declare module "next-auth" {
  interface Session {
    user: { id: string; isAdmin: boolean } & import("next-auth").DefaultSession["user"];
  }
  interface User {
    isAdmin?: boolean;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    isAdmin?: boolean;
  }
}
