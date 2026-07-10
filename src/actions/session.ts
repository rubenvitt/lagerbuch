import { auth } from "@/auth";

export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error("Kein Zugriff");
  return { userId: session.user.id };
}
