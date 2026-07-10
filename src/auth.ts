import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { getDb } from "@/db";
import { users } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  events: {
    async signIn({ user }) {
      if (!user?.id) return;
      try {
        getDb()
          .insert(users)
          .values({ id: user.id, name: user.name, email: user.email, lastLoginAt: new Date() })
          .onConflictDoUpdate({
            target: users.id,
            set: { name: user.name, email: user.email, lastLoginAt: new Date() },
          })
          .run();
      } catch {
        /* user table upsert is non-critical */
      }
    },
  },
});
